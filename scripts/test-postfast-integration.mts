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

    if (req.headers['pf-api-key'] !== API_KEY && !url.startsWith('/upload/')) {
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
      ])
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

    if (method === 'POST' && url === '/social-posts') {
      const post = body?.posts?.[0]
      if (post.socialMediaId === 'pf_acc_google') {
        assert.equal(post.content, 'Google map update')
        assert.match(post.scheduledAt, /^\d{4}-\d{2}-\d{2}T/)
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
      assert.equal(post.content, 'Lunch special\n\n#amc #food')
      assert.match(post.scheduledAt, /^\d{4}-\d{2}-\d{2}T/)
      assert.equal(post.mediaItems[0].key, 'video/reel-key')
      assert.equal(post.mediaItems[0].type, 'VIDEO')
      return json(res, 200, {
        posts: [
          {
            id: 'pf_post_scheduled_001',
            status: 'SCHEDULED',
            scheduledAt: post.scheduledAt,
            url: 'https://postfa.st/posts/pf_post_scheduled_001',
          },
        ],
      })
    }

    if (method === 'GET' && url.startsWith('/social-posts?')) {
      const query = new URL(`${BASE_URL}${url}`).searchParams
      assert.equal(query.get('statuses'), 'SCHEDULED')
      assert.equal(query.get('platforms'), 'INSTAGRAM')
      return json(res, 200, {
        posts: [
          {
            id: 'pf_post_scheduled_001',
            platform: 'INSTAGRAM',
            content: 'Lunch special',
            status: 'SCHEDULED',
            scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            mediaItems: [{ url: 'https://cdn.example.com/reel.mp4' }],
          },
        ],
        totalCount: 1,
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
  const server = await startMockPostFast()

  try {
    const accounts = await postfast.postfastFetchAccounts(API_KEY)
    assert.equal(accounts.success, true)
    assert.equal(accounts.accounts.length, 3)
    assert.equal(accounts.accounts[0].platformId, 'instagram')

    const uploadSlots = await postfast.postfastGetSignedUploadUrls(API_KEY, [
      { filename: 'reel.mp4', mimeType: 'video/mp4', sizeBytes: 10 },
    ])
    assert.equal(uploadSlots.success, true)
    assert.equal(uploadSlots.slots[0].storageKey, 'video/reel-key')

    const upload = await postfast.postfastUploadFile(uploadSlots.slots[0].uploadUrl, Buffer.from('video'), 'video/mp4')
    assert.equal(upload.success, true)

    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const publish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'instagram',
      accountId: 'pf_acc_instagram',
      caption: 'Lunch special',
      mediaStorageKeys: ['video/reel-key'],
      hashtags: ['amc', 'food'],
      scheduledAt,
    })
    assert.equal(publish.success, true)
    assert.equal(publish.postId, 'pf_post_scheduled_001')
    assert.equal(publish.scheduledAt, scheduledAt)

    const googlePublish = await postfast.postfastPublish({
      apiKey: API_KEY,
      platform: 'google_business',
      caption: 'Google map update',
      scheduledAt,
    })
    assert.equal(googlePublish.success, true)
    assert.equal(googlePublish.postId, 'pf_post_google_001')

    const list = await postfast.postfastListPosts(API_KEY, { status: 'scheduled', platform: 'instagram', limit: 10, page: 0 })
    assert.equal(list.success, true)
    assert.equal(list.posts.length, 1)
    assert.equal(list.posts[0].platformId, 'instagram')

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
