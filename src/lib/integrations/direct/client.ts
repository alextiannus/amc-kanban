import { prisma } from '@/lib/prisma'
import { isDirectPublishingEnabled } from '@/lib/systemConfig'
import { publishGbpLocalPost, deleteGbpLocalPost } from './googleBusiness'
import { publishFacebookPost, deleteFacebookPost } from './facebook'
import { publishInstagramPost, deleteInstagramPost } from './instagram'
import { publishTiktokVideo } from './tiktok'
import { postfastPublish, postfastDeletePost, PostFastPublishInput, PostFastPublishResult } from '../postfast'

export async function directPublish(input: PostFastPublishInput): Promise<PostFastPublishResult> {
  const { platform, accountId, caption, mediaUrls = [] } = input
  if (!accountId) {
    return { success: false, error: 'Direct publishing requires a specific accountId' }
  }

  // Find the SocialAccount in the DB to fetch direct OAuth credentials
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId }
  })

  if (!account || !account.accessToken) {
    return { 
      success: false, 
      error: `Direct publishing failed: No authorized SocialAccount credentials found in database for ID ${accountId}` 
    }
  }

  const normPlatform = platform.toLowerCase().trim()

  if (normPlatform === 'google' || normPlatform === 'gbp' || normPlatform === 'gmb') {
    // Google Business locationName is typically stored in the handle field
    return publishGbpLocalPost({
      accessToken: account.accessToken,
      locationName: account.handle,
      content: caption,
      mediaUrls,
    })
  }

  if (normPlatform === 'facebook') {
    // Facebook Page ID is stored in the handle field
    return publishFacebookPost({
      accessToken: account.accessToken,
      pageId: account.handle,
      content: caption,
      mediaUrls,
    })
  }

  if (normPlatform === 'instagram') {
    // Instagram Business ID is stored in the handle field
    return publishInstagramPost({
      accessToken: account.accessToken,
      instagramBusinessId: account.handle,
      content: caption,
      mediaUrl: mediaUrls[0] || '',
      isVideo: mediaUrls[0]?.toLowerCase().endsWith('.mp4') || mediaUrls[0]?.includes('.mp4?'),
    })
  }

  if (normPlatform === 'tiktok') {
    return publishTiktokVideo({
      accessToken: account.accessToken,
      title: caption,
      mediaUrl: mediaUrls[0] || '',
    })
  }

  return { success: false, error: `Platform ${platform} is not yet supported in Direct API mode` }
}

export async function publishPost(input: PostFastPublishInput): Promise<PostFastPublishResult> {
  const directEnabled = await isDirectPublishingEnabled()
  if (directEnabled) {
    console.log(`[Integration Bridge] Routing publish request directly via official APIs for platform: ${input.platform}`)
    return directPublish(input)
  }
  console.log(`[Integration Bridge] Routing publish request via PostFast Gateway for platform: ${input.platform}`)
  return postfastPublish(input)
}

export async function deletePost(apiKey: string, postId: string, platform?: string, accountId?: string): Promise<{ success: boolean; error?: string }> {
  const directEnabled = await isDirectPublishingEnabled()
  if (directEnabled && accountId && platform) {
    console.log(`[Integration Bridge] Routing delete request directly via official APIs for post: ${postId}`)
    const account = await prisma.socialAccount.findUnique({
      where: { id: accountId }
    })
    if (account && account.accessToken) {
      const normPlatform = platform.toLowerCase().trim()
      if (normPlatform === 'google' || normPlatform === 'gbp' || normPlatform === 'gmb') {
        return deleteGbpLocalPost(account.accessToken, postId)
      }
      if (normPlatform === 'facebook') {
        return deleteFacebookPost(account.accessToken, postId)
      }
      if (normPlatform === 'instagram') {
        return deleteInstagramPost(account.accessToken, postId)
      }
    }
  }
  console.log(`[Integration Bridge] Routing delete request via PostFast Gateway for post: ${postId}`)
  const res = await postfastDeletePost(apiKey, postId)
  return { success: res.success, error: res.error }
}
