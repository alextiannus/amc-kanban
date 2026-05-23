import { postfastPublish } from '../src/lib/integrations/postfast'

// Mock global fetch to intercept requests
const originalFetch = global.fetch

async function runTests() {
  console.log('--- Running Mock Integration Tests for PostFast ---')

  let lastRequestUrl = ''
  let lastRequestBody: any = null

  // Override fetch to verify the payload structure
  global.fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlStr = String(url)
    lastRequestUrl = urlStr
    
    console.log(`[Mock Fetch] Intercepted call to: ${urlStr} (${init?.method ?? 'GET'})`)

    if (urlStr.includes('/social-media/my-social-accounts')) {
      return new Response(JSON.stringify([
        {
          id: 'pf_acc_instagram_123',
          platform: 'INSTAGRAM',
          platformUsername: 'test_insta_handle',
          displayName: 'Test Insta Account',
          isConnected: true
        }
      ]), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    if (urlStr.includes('/file/get-signed-upload-urls')) {
      return new Response(JSON.stringify({
        urls: [
          {
            uploadUrl: 'https://postfast-s3-upload-mock.example.com/slots/123',
            storageKey: 'mocked_s3_key_for_image.png',
            fileToken: 'mocked_s3_key_for_image.png'
          }
        ]
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    if (urlStr.includes('postfast-s3-upload-mock.example.com')) {
      return new Response('', { status: 200 })
    }

    if (urlStr.includes('/social-posts')) {
      if (init?.body) {
        lastRequestBody = JSON.parse(init.body as string)
      }
      return new Response(JSON.stringify({
        posts: [
          {
            post_id: 'post_12345',
            url: 'https://instagram.com/p/mock_post_url',
            status: 'PUBLISHED'
          }
        ]
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    // Mock downloading a public media URL
    if (urlStr === 'https://example.com/image.png') {
      return new Response(Buffer.from('mock_image_bytes'), {
        status: 200,
        headers: { 'content-type': 'image/png' }
      })
    }

    return new Response(JSON.stringify({}), { status: 200 })
  }

  try {
    // Test Case 1: Simple publish with account resolution and media URL download/upload
    console.log('\nTest Case 1: Publishing with public mediaUrls')
    const result = await postfastPublish({
      apiKey: 'pf_live_mock_api_key',
      platform: 'instagram',
      caption: 'Hello, this is a test post!',
      mediaUrls: ['https://example.com/image.png'],
      hashtags: ['test', 'postfast']
    })

    console.log('Result:', result)
    console.log('Request URL:', lastRequestUrl)
    console.log('Request Body:', JSON.stringify(lastRequestBody, null, 2))

    // Assertions
    if (!result.success) throw new Error('Publish failed')
    if (result.postId !== 'post_12345') throw new Error('Incorrect post ID')
    if (result.url !== 'https://instagram.com/p/mock_post_url') throw new Error('Incorrect post URL')

    const post = lastRequestBody?.posts?.[0]
    if (!post) throw new Error('Missing post in body')
    if (post.socialMediaId !== 'pf_acc_instagram_123') throw new Error('Failed to resolve socialMediaId')
    if (post.content !== 'Hello, this is a test post!\n\n#test #postfast') throw new Error('Incorrect caption/hashtags mapping')
    if (!post.mediaItems || post.mediaItems[0].key !== 'mocked_s3_key_for_image.png') throw new Error('Failed to download & upload mediaUrl to S3')
    if (post.mediaItems[0].type !== 'IMAGE') throw new Error('Incorrect media type detection')

    console.log('\n✅ Test Case 1 Passed successfully!')

  } catch (error) {
    console.error('\n❌ Test Case 1 Failed:', error)
  } finally {
    global.fetch = originalFetch
  }
}

runTests()
