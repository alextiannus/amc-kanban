#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

const PORT = 4017
const API_KEY = 'pf_test_mock_key'
const BASE_URL = `http://127.0.0.1:${PORT}`

type SeenRequest = {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: any
}

const seen: SeenRequest[] = []

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      if (!raw) return resolve(null)
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(raw)
      }
    })
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function startMockPostFast() {
  const server = createServer(async (req, res) => {
    const url = req.url || '/'
    const method = req.method || 'GET'
    const body = await readBody(req)
    seen.push({ method, url, headers: req.headers, body })

    if (req.headers['pf-api-key'] !== API_KEY && !url.startsWith('/upload/') && !url.startsWith('/cdn/')) {
      return json(res, 401, { message: 'missing pf-api-key' })
    }

    if (method === 'GET' && url.startsWith('/social-media/my-social-accounts')) {
      return json(res, 200, [
        {
          id: 'pf_acc_instagram',
          platform: 'INSTAGRAM',
          platformUsername: 'amc_store',
          displayName: 'AMC Store',
          isConnected: true,
        },
        {
          id: 'pf_acc_video',
          platform: 'TIKTOK',
          platformUsername: '@video_store',
          displayName: 'Video Store',
          isConnected: true,
        },
        {
          id: 'pf_acc_google',
          platform: 'GOOGLE',
          platformUsername: 'amc_maps',
          displayName: 'AMC Google Business',
          isConnected: true,
        },
        {
          id: 'pf_acc_facebook',
          platform: 'FACEBOOK',
          platformUsername: 'amc_store_fb',
          displayName: 'AMC Store Facebook',
          isConnected: true,
        },
      ])
    }

    if (method === 'GET' && url === '/social-media/pf_acc_google/gbp-locations') {
      return json(res, 200, [
        {
          locationId: 'gbp_location_001',
          name: 'AMC Google Business Location',
          address: '1 Test Street',
        },
      ])
    }

    if (method === 'POST' && url === '/social-media/connect-link') {
      assert.deepEqual(body, { label: 'AMC Store' })
      return json(res, 201, {
        connectUrl: 'https://app.postfa.st/connect?token=fresh-test-token',
      })
    }

    if (method === 'POST' && url === '/file/get-signed-upload-urls') {
      assert.equal(body.count, 1)
      assert.equal(body.contentType, 'video/mp4')
      return json(res, 200, {
        urls: [
          {
            uploadUrl: `${BASE_URL}/upload/video-key`,
            storageKey: 'video/reel-key',
            fileToken: 'video/reel-key',
          },
        ],
      })
    }

    if (method === 'PUT' && url === '/upload/video-key') {
      res.writeHead(200)
      res.end()
      return
    }

    if (method === 'GET' && url === '/cdn/octet-video.mp4') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      res.end(Buffer.from('video'))
      return
    }

    if (method === 'POST' && url === '/social-posts') {
      const post = body?.posts?.[0]
      if (post.content === 'Facebook custom cover') {
        assert.equal(post.socialMediaId, 'pf_acc_facebook')
        assert.equal(body.controls.facebookContentType, 'REEL')
        assert.equal(post.mediaItems[0].key, 'video/reel-key')
        assert.equal(post.mediaItems[0].coverImageKey, 'image/cover.jpg')
        return json(res, 201, { postIds: ['pf_post_facebook_cover_001'] })
      }
      if (post.content === 'TikTok first-frame cover') {
        assert.equal(post.socialMediaId, 'pf_acc_video')
        assert.equal(post.mediaItems[0].key, 'video/reel-key')
        assert.equal(post.mediaItems[0].coverTimestamp, '0')
        assert.equal(post.mediaItems[0].coverImageKey, undefined)
        return json(res, 201, { postIds: ['pf_post_tiktok_cover_001'] })
      }
      if (post.socialMediaId === 'pf_acc_google') {
        assert.equal(post.content, 'Google map update')
        assert.match(post.scheduledAt, /^\d{4}-\d{2}-\d{2}T/)
        assert.equal(body.controls.gbpLocationId, 'gbp_location_001')
        assert.equal(post.gbpLocationId, 'gbp_location_001')
        assert.equal(post.controls.gbpLocationId, 'gbp_location_001')
        return json(res, 200, {
          posts: [
            {
              id: 'pf_post_google_001',
              status: 'SCHEDULED',
              scheduledAt: post.scheduledAt,
              url: 'https://postfa.st/posts/pf_post_google_001',
            },
          ],
        })
      }

      assert.equal(post.socialMediaId, 'pf_acc_instagram')
      if (post.content === 'Instagram custom cover') {
        assert.equal(body.controls.instagramPublishType, 'REEL')
        assert.equal(post.mediaItems[0].key, 'video/reel-key')
        assert.equal(post.mediaItems[0].coverImageKey, 'image/cover.jpg')
        return json(res, 201, { postIds: ['pf_post_instagram_cover_001'] })
      }
      if (post.content === 'Image cover first') {
        assert.equal(body.controls?.instagramPublishType, undefined)
        assert.equal(post.mediaItems.length, 2)
        assert.equal(post.mediaItems[0].key, 'image/cover.jpg')
        assert.equal(post.mediaItems[1].key, 'image/content.jpg')
        return json(res, 201, { postIds: ['pf_post_image_cover_001'] })
      }
      if (post.content === 'Relaxed image warning') {
        assert.equal(body.controls?.instagramPublishType, undefined)
        assert.equal(post.mediaItems[0].key, 'image/oversized-photo.jpg')
        assert.equal(post.mediaItems[0].type, 'IMAGE')
        return json(res, 200, {
          posts: [
            {
              id: 'pf_post_warning_image_001',
              status: 'SCHEDULED',
              scheduledAt: post.scheduledAt,
              url: 'https://postfa.st/posts/pf_post_warning_image_001',
            },
          ],
        })
      }
      assert.equal(body.controls.instagramPublishType, 'REEL')
      if (post.content === 'Opaque video key') {
        assert.equal(post.mediaItems[0].key, 'opaque-storage-key')
        assert.equal(post.mediaItems[0].type, 'VIDEO')
        return json(res, 200, {
          posts: [
            {
              id: 'pf_post_opaque_video_001',
              status: 'SCHEDULED',
              scheduledAt: post.scheduledAt,
              url: 'https://postfa.st/posts/pf_post_opaque_video_001',
            },
          ],
        })
      }

      if (post.content === 'Octet stream video URL') {
        assert.equal(post.mediaItems[0].key, 'video/reel-key')
        assert.equal(post.mediaItems[0].type, 'VIDEO')
        return json(res, 200, {
          posts: [
            {
              id: 'pf_post_octet_video_001',
              status: 'SCHEDULED',
              scheduledAt: post.scheduledAt,
              url: 'https://postfa.st/posts/pf_post_octet_video_001',
            },
          ],
        })
      }

      if (post.content === 'Relaxed video warning') {
        assert.equal(post.mediaItems[0].key, 'video/reel-key')
        assert.equal(post.mediaItems[0].type, 'VIDEO')
        return json(res, 200, {
          posts: [
            {
              id: 'pf_post_warning_video_001',
              status: 'SCHEDULED',
              scheduledAt: post.scheduledAt,
              url: 'https://postfa.st/posts/pf_post_warning_video_001',
            },
          ],
        })
      }

      if (post.content === 'Missing provider ID') {
        return json(res, 201, { postIds: [] })
      }

      assert.equal(post.content, 'Lunch special\n\n#amc #food')
      assert.match(post.scheduledAt, /^\d{4}-\d{2}-\d{2}T/)
      assert.equal(post.mediaItems[0].key, 'video/reel-key')
      assert.equal(post.mediaItems[0].type, 'VIDEO')
      return json(res, 201, {
        postIds: ['pf_post_scheduled_001'],
      })
    }

    if (method === 'GET' && url.startsWith('/social-posts?')) {
      const query = new URL(`${BASE_URL}${url}`).searchParams
      assert.equal(query.get('statuses'), 'SCHEDULED')
      assert.equal(query.get('platforms'), 'INSTAGRAM')
      assert.equal(query.get('page'), '0')
      return json(res, 200, {
        data: [
          {
            id: 'pf_post_scheduled_001',
            socialMediaId: 'pf_acc_instagram',
            platform: 'INSTAGRAM',
            content: 'Lunch special',
            status: 'SCHEDULED',
            scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            mediaItems: [{ url: 'https://cdn.example.com/reel.mp4' }],
          },
        ],
        totalCount: 1,
        pageInfo: { hasNextPage: false },
      })
    }

    if (method === 'DELETE' && url === '/social-posts/pf_post_scheduled_001') {
      return json(res, 200, { success: true })
    }

    return json(res, 404, { message: `unhandled ${method} ${url}` })
  })

  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve))
  return server
}

async function main() {
  process.env.POSTFAST_BASE_URL = BASE_URL
  const postfast = await import('../src/lib/integrations/postfast.ts')
  const publishMedia = await import('../src/lib/publishMedia.ts')
  const server = await startMockPostFast()

  try {
    const validReelMetadata = {
      kind: 'video' as const,
      mimeType: 'video/mp4',
      sizeBytes: 10,
      width: 1080,
      height: 1920,
      container: 'MPEG-4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      frameRate: 30,
      durationSeconds: 30,
      videoBitrate: 8_000_000,
      audioSampleRate: 48_000,
    }
    const accounts = await postfast.postfastFetchAccounts(API_KEY)
    assert.equal(accounts.success, true)
    assert.equal(accounts.accounts.length, 4)
    assert.equal(accounts.accounts[0].platformId, 'instagram')

    const connectLink = await postfast.postfastGenerateConnectLink(API_KEY, { label: 'AMC Store' })
    assert.equal(connectLink.success, true)
    assert.equal(connectLink.connectUrl, 'https://app.postfa.st/connect?token=fresh-test-token')

    const uploadSlots = await postfast.postfastGetSignedUploadUrls(API_KEY, [
      { filename: 'reel.mp4', mimeType: 'video/mp4', sizeBytes: 10 },
    ])
    assert.equal(uploadSlots.success, true)
    assert.equal(uploadSlots.slots[0].storageKey, 'video/reel-key')

    const upload = await postfast.postfastUploadFile(uploadSlots.slots[0].uploadUrl, Buffer.from('video'), 'video/mp4')
    assert.equal(upload.success, true)

    const requestCountBeforeInvalidPublish = seen.length
    const invalidPublish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'instagram',
      caption: 'Missing media',
      scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })
    assert.equal(invalidPublish.code, 'MEDIA_VALIDATION_FAILED')
    assert.equal(seen.length, requestCountBeforeInvalidPublish)

    const duplicateVideoMedia = publishMedia.buildPostfastMediaItems({
      mediaUrls: [`${BASE_URL}/cdn/octet-video.mp4`],
      assetRefs: [
        {
          asset: {
            id: 'asset-reel-1',
            url: `${BASE_URL}/cdn/octet-video.mp4`,
            filename: 'reel.mp4',
            mimeType: 'video/mp4',
            sourceType: 'huawei_obs',
            technicalMetadata: validReelMetadata,
          },
        },
      ],
    })
    assert.equal(duplicateVideoMedia.length, 1)
    assert.equal(duplicateVideoMedia[0].url, `${BASE_URL}/cdn/octet-video.mp4`)
    assert.equal(duplicateVideoMedia[0].mimeType, 'video/mp4')
    assert.equal(duplicateVideoMedia[0].assetId, 'asset-reel-1')
    assert.equal(duplicateVideoMedia[0].filename, 'reel.mp4')
    assert.deepEqual(duplicateVideoMedia[0].metadata, validReelMetadata)

    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const validCoverMetadata = {
      kind: 'image' as const,
      mimeType: 'image/jpeg',
      sizeBytes: 500_000,
      width: 1_080,
      height: 1_350,
      format: 'jpeg',
    }

    const builtCover = publishMedia.buildPostfastCoverImage({
      id: 'asset-cover-1',
      url: 'image/cover.jpg',
      mimeType: 'image/jpeg',
      sourceType: 'postfast',
      filename: 'cover.jpg',
      technicalMetadata: validCoverMetadata,
    })
    assert.equal(builtCover?.storageKey, 'image/cover.jpg')
    assert.equal(builtCover?.assetId, 'asset-cover-1')

    const instagramCoverPublish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'instagram',
      accountId: 'pf_acc_instagram',
      caption: 'Instagram custom cover',
      mediaItems: [{ storageKey: 'video/reel-key', metadata: validReelMetadata }],
      coverImage: { storageKey: 'image/cover.jpg', metadata: validCoverMetadata },
      scheduledAt,
    })
    assert.equal(instagramCoverPublish.success, true)
    assert.equal(instagramCoverPublish.postId, 'pf_post_instagram_cover_001')

    const facebookCoverPublish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'facebook',
      accountId: 'pf_acc_facebook',
      caption: 'Facebook custom cover',
      mediaItems: [{ storageKey: 'video/reel-key', metadata: validReelMetadata }],
      coverImage: { storageKey: 'image/cover.jpg', metadata: validCoverMetadata },
      scheduledAt,
    })
    assert.equal(facebookCoverPublish.success, true)
    assert.equal(facebookCoverPublish.postId, 'pf_post_facebook_cover_001')

    const tiktokCoverPublish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'tiktok',
      accountId: 'pf_acc_video',
      caption: 'TikTok first-frame cover',
      mediaItems: [{ storageKey: 'video/reel-key', metadata: validReelMetadata }],
      coverImage: { storageKey: 'image/cover.jpg', metadata: validCoverMetadata },
      scheduledAt,
    })
    assert.equal(tiktokCoverPublish.success, true)
    assert.equal(tiktokCoverPublish.postId, 'pf_post_tiktok_cover_001')
    assert.equal(tiktokCoverPublish.warnings?.some((warning) => warning.field === 'coverImage') ?? false, false)

    const imageCoverPublish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'instagram',
      accountId: 'pf_acc_instagram',
      caption: 'Image cover first',
      mediaItems: [{ storageKey: 'image/content.jpg', metadata: validCoverMetadata }],
      coverImage: { storageKey: 'image/cover.jpg', metadata: validCoverMetadata },
      scheduledAt,
    })
    assert.equal(imageCoverPublish.success, true)
    assert.equal(imageCoverPublish.postId, 'pf_post_image_cover_001')

    const publish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'instagram',
      accountId: 'pf_acc_instagram',
      caption: 'Lunch special',
      mediaItems: [{ storageKey: 'video/reel-key', metadata: validReelMetadata }],
      hashtags: ['amc', 'food'],
      scheduledAt,
    })
    assert.equal(publish.success, true)
    assert.equal(publish.postId, 'pf_post_scheduled_001')
    assert.equal(publish.scheduledAt, scheduledAt)

    const missingProviderId = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'instagram',
      accountId: 'pf_acc_instagram',
      caption: 'Missing provider ID',
      mediaItems: [{ storageKey: 'video/reel-key', metadata: validReelMetadata }],
      scheduledAt,
    })
    assert.equal(missingProviderId.success, false)
    assert.equal(missingProviderId.code, 'POSTFAST_RESULT_UNKNOWN')

    const relaxedVideoPublish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'instagram',
      accountId: 'pf_acc_instagram',
      caption: 'Relaxed video warning',
      mediaItems: [{
        storageKey: 'video/reel-key',
        metadata: {
          ...validReelMetadata,
          width: 3_840,
          height: 2_160,
          videoCodec: 'av1',
          audioCodec: 'opus',
          frameRate: 120,
          durationSeconds: 1_200,
          videoBitrate: 40_000_000,
          audioSampleRate: 96_000,
        },
      }],
      scheduledAt,
    })
    assert.equal(relaxedVideoPublish.success, true)
    assert.equal(relaxedVideoPublish.postId, 'pf_post_warning_video_001')
    assert.ok((relaxedVideoPublish.warnings?.length ?? 0) >= 6)
    assert.ok(relaxedVideoPublish.warnings?.every((warning) => warning.severity === 'warning'))

    const relaxedImagePublish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'instagram',
      accountId: 'pf_acc_instagram',
      caption: 'Relaxed image warning',
      mediaItems: [{
        storageKey: 'image/oversized-photo.jpg',
        filename: '2024-07-27 114533.jpg',
        metadata: {
          kind: 'image',
          mimeType: 'image/jpeg',
          sizeBytes: 23_191_745,
          width: 5_464,
          height: 8_192,
          format: 'jpeg',
        },
      }],
      scheduledAt,
    })
    assert.equal(relaxedImagePublish.success, true)
    assert.equal(relaxedImagePublish.postId, 'pf_post_warning_image_001')
    assert.ok((relaxedImagePublish.warnings?.length ?? 0) >= 3)
    assert.ok(relaxedImagePublish.warnings?.every((warning) => warning.severity === 'warning'))

    const opaqueVideoPublish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'instagram',
      accountId: 'pf_acc_instagram',
      caption: 'Opaque video key',
      mediaItems: [{
        storageKey: 'opaque-storage-key',
        mimeType: 'video/mp4',
        metadata: validReelMetadata,
      }],
      scheduledAt,
    })
    assert.equal(opaqueVideoPublish.success, true)
    assert.equal(opaqueVideoPublish.postId, 'pf_post_opaque_video_001')

    const octetVideoPublish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'instagram',
      accountId: 'pf_acc_instagram',
      caption: 'Octet stream video URL',
      mediaUrls: [`${BASE_URL}/cdn/octet-video.mp4`],
      scheduledAt,
    })
    assert.equal(octetVideoPublish.success, false)
    assert.ok(octetVideoPublish.error)

    const googlePublish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'google_business',
      caption: 'Google map update',
      gbpLocationId: 'gbp_location_001',
      scheduledAt,
    })
    assert.equal(googlePublish.success, true)
    assert.equal(googlePublish.postId, 'pf_post_google_001')

    const missingGoogleLocation = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'google_business',
      caption: 'Missing Google location',
      scheduledAt,
    })
    assert.equal(missingGoogleLocation.success, false)
    assert.equal(missingGoogleLocation.code, 'GOOGLE_LOCATION_REQUIRED')

    const staleGoogleLocation = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'google_business',
      caption: 'Stale Google location',
      gbpLocationId: 'gbp_location_stale',
      scheduledAt,
    })
    assert.equal(staleGoogleLocation.success, false)
    assert.equal(staleGoogleLocation.code, 'GOOGLE_LOCATION_NOT_FOUND')

    const list = await postfast.postfastListPosts(API_KEY, { status: 'scheduled', platform: 'instagram', limit: 10, page: 0 })
    assert.equal(list.success, true)
    assert.equal(list.posts.length, 1)
    assert.equal(list.posts[0].platformId, 'instagram')
    assert.equal(list.posts[0].socialMediaId, 'pf_acc_instagram')
    assert.equal(list.hasNextPage, false)

    const deleted = await postfast.postfastDeletePost(API_KEY, 'pf_post_scheduled_001')
    assert.equal(deleted.success, true)

    const past = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'instagram',
      caption: 'Too late',
      scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    })
    assert.equal(past.success, false)
    assert.match(past.error || '', /排期时间/)

    assert.ok(seen.some((r) => r.method === 'GET' && r.url.startsWith('/social-media/my-social-accounts')))
    assert.ok(seen.some((r) => r.method === 'GET' && r.url === '/social-media/pf_acc_google/gbp-locations'))
    assert.ok(seen.some((r) => r.method === 'POST' && r.url === '/social-media/connect-link'))
    assert.ok(seen.some((r) => r.method === 'POST' && r.url === '/file/get-signed-upload-urls'))
    assert.ok(seen.some((r) => r.method === 'PUT' && r.url === '/upload/video-key'))
    assert.ok(seen.some((r) => r.method === 'POST' && r.url === '/social-posts'))
    assert.ok(seen.some((r) => r.method === 'GET' && r.url.startsWith('/social-posts?')))
    assert.ok(seen.some((r) => r.method === 'DELETE' && r.url === '/social-posts/pf_post_scheduled_001'))

    console.log('PostFast integration wrapper tests passed.')
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
