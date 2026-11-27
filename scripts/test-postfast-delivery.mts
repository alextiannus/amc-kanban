#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import {
  POSTFAST_ASYNC_VIDEO_THRESHOLD_BYTES,
  POSTFAST_MAX_UPLOAD_BYTES,
  shouldQueuePostfastDelivery,
} from '../src/lib/postfastDeliveryPolicy.ts'
import { validateUploadMedia } from '../src/lib/mediaValidation.ts'
import { buildPostfastMediaItems } from '../src/lib/publishMedia.ts'
import { draftMediaIdentity } from '../src/lib/draftMedia.ts'
import { SHORT_VIDEO_CAROUSEL } from '../src/lib/shortVideoCarousel.ts'
import { SocialAccountBindingError } from '../src/lib/socialAccountIdentity.ts'

const PORT = 4021
const BASE_URL = `http://127.0.0.1:${PORT}`
const API_KEY = 'pf_stream_test_key'
const CHUNK_SIZE = 256 * 1024
const CONTENT_LENGTH = 244_634_429
const SMALL_CONTENT_LENGTH = 1_048_576
const STREAM_CHUNK = Buffer.alloc(CHUNK_SIZE, 7)

let sourceEnded = false
let uploadStartedBeforeSourceEnded = false
let uploadedBytes = 0
let uploadContentType = ''
let uploadContentLength = ''
let uploadStatus = 200

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function verifyCarouselRetry() {
  const orderedClips = ['c', 'a', 'e', 'd', 'b', 'h', 'g', 'j', 'f', 'i']
  const urls = orderedClips.map(name => `https://cdn.example.test/${name}.mp4`)
  const inspectedMedia = new Map(urls.map(url => [draftMediaIdentity(url), {
    kind: 'video' as const, mimeType: 'video/mp4', durationSeconds: 4, sizeBytes: 1000,
  }]))
  const scheduledAt = new Date(Date.now() + 300_000).toISOString()
  const job: any = {
    id: 'job', draftId: 'draft', brandId: 'brand', status: 'QUEUED', attempts: 0, nextAttemptAt: null,
    updatedAt: new Date(), mediaState: { version: 1, items: [] },
    payload: {
      version: 1, actorId: 'operator', scheduled: true, retryTaskId: 'task',
      publish: {
        platform: 'instagram', instagramPublishType: 'TIMELINE', mediaMode: SHORT_VIDEO_CAROUSEL, scheduledAt,
        mediaItems: buildPostfastMediaItems({ mediaUrls: urls, inspectedMedia }),
      },
    },
  }
  const transferred: string[] = [], posts: any[] = [], completedTasks: string[] = []
  const draft: any = { status: 'publishing' }
  const cancellations: string[] = []
  let failSecondClip = true
  const prisma = {
    postfastDeliveryJob: {
      findMany: async () => [],
      findFirst: async () => job.status === 'QUEUED' && (!job.nextAttemptAt || job.nextAttemptAt.getTime() <= Date.now()) ? { ...job } : null,
      findUniqueOrThrow: async () => ({ ...job }),
      findUnique: async () => null,
      create: async ({ data }: any) => ({ id: 'new-job', ...data }),
      updateMany: async ({ where, data }: any) => {
        if (where.status && where.status !== job.status || where.leaseToken && where.leaseToken !== job.leaseToken) return { count: 0 }
        const attempts = data.attempts?.increment ? job.attempts + data.attempts.increment : job.attempts
        Object.assign(job, data, { attempts })
        return { count: 1 }
      },
    },
    contentDraft: {
      update: async ({ data }: any) => Object.assign(draft, data),
      updateMany: async ({ where, data }: any) => {
        if (where.updatedAt.getTime() !== draft.updatedAt.getTime()) return { count: 0 }
        Object.assign(draft, data)
        return { count: 1 }
      },
    },
    socialAccount: { findFirst: async () => ({ id: 'ig', handle: 'fixture', unboundAt: null }) },
    brand: { findUnique: async () => ({ postfastApiKey: API_KEY }) },
    actionItem: { updateMany: async () => ({ count: 0 }) },
    workUnit: { updateMany: async ({ where, data }: any) => {
      assert.equal(where.brandId, 'brand')
      assert.equal(data.status, 'done')
      completedTasks.push(where.id)
      return { count: 1 }
    } },
    $transaction: async (work: any) => typeof work === 'function' ? work(prisma) : Promise.all(work),
  }
  const dependencies: Record<string, unknown> = {
    './daily-publishing/sources': {}, './video-assistant/post-contract': {},
    './role-permissions/delegation': { requireActorPermission: async () => {} },
    './role-permissions/store': {},
    '@/lib/socialAccountBinding': { SocialAccountBindingError, lockAccountBinding: async () => {}, assertAccountBound: () => {} },
    '@/lib/socialAccountLocks': { lockBrandSync: async () => {} },
    'node:crypto': crypto, '@/lib/prisma': { prisma },
    '@/lib/integrations/huaweiObs': { persistDraftSnapshotToObs: async () => {} },
    '@/lib/shortVideoCarousel': { SHORT_VIDEO_CAROUSEL },
    '@/lib/syncDraftStatuses': { POSTFAST_RESULT_UNKNOWN: 'POSTFAST_RESULT_UNKNOWN' },
    './feedbackService': { processDraftCuration: async () => {} },
    '@/lib/integrations/postfast': {
      postfastDeletePost: async (_key: string, postId: string) => {
        cancellations.push(postId)
        return { success: true }
      },
      postfastUploadPublicUrlStream: async ({ url }: { url: string }) => {
        const clip = new URL(url).pathname.slice(1, -4)
        transferred.push(clip)
        if (clip === 'a' && failSecondClip) {
          failSecondClip = false
          return { success: false, retryable: true, code: 'POSTFAST_SIGNED_URL_EXPIRED' }
        }
        return { success: true, storageKey: `clips/${clip}` }
      },
      postfastPublish: async (input: unknown) => {
        posts.push(input)
        return { success: true, postId: 'post-1' }
      },
    },
  }
  const source = await readFile(new URL('../src/lib/postfastDelivery.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', outputText)((id: string) => {
    assert(id in dependencies, `Unexpected queue dependency ${id}`)
    return dependencies[id]
  }, module, module.exports)
  const run = () => module.exports.processPostfastDeliveryQueue({ maxRuntimeMs: 60_000 })

  assert.equal((await run()).retried, 1)
  assert.deepEqual(transferred, ['c', 'a'])
  assert.deepEqual(posts, [])
  job.nextAttemptAt = new Date(0)
  assert.equal((await run()).succeeded, 1)
  assert.equal((await run()).processed, 0)
  assert.deepEqual(transferred, ['c', 'a', ...orderedClips.slice(1)])
  assert.equal(posts.length, 1)
  assert.equal(posts[0].mediaMode, SHORT_VIDEO_CAROUSEL)
  assert.equal(posts[0].scheduledAt, scheduledAt)
  assert.deepEqual(posts[0].mediaItems.map((item: any) => item.storageKey), orderedClips.map(clip => `clips/${clip}`))
  assert.deepEqual(completedTasks, ['task'])
  assert.equal(draft.status, 'scheduled')
  draft.updatedAt = new Date()
  draft.platformPostId = 'post-1'
  const replace = {
    brandId: 'brand', draftId: 'draft', actorId: 'operator', immediatePublish: false, scheduled: true,
    draftUpdatedAt: new Date(draft.updatedAt.getTime() - 1000),
    previousSchedule: { postId: 'post-1', scheduledAt: new Date(scheduledAt), apiKey: API_KEY },
    publish: { ...job.payload.publish, accountId: 'ig' },
  }
  await assert.rejects(module.exports.enqueuePostfastDelivery(replace), { code: 'SHORT_VIDEO_DRAFT_CHANGED' })
  assert.deepEqual(cancellations, [], 'a queue request based on stale media must not cancel a provider post')
  assert.equal(draft.platformPostId, 'post-1')
  assert.equal((await module.exports.enqueuePostfastDelivery({ ...replace, draftUpdatedAt: draft.updatedAt })).id, 'new-job')
  assert.deepEqual(cancellations, ['post-1'])
  assert.equal(draft.platformPostId, null)
}

async function main() {
  await verifyCarouselRetry()
  assert.equal(POSTFAST_ASYNC_VIDEO_THRESHOLD_BYTES, 50_000_000)
  assert.equal(POSTFAST_MAX_UPLOAD_BYTES, 250_000_000)
  assert.equal(shouldQueuePostfastDelivery([{ metadata: { kind: 'video', sizeBytes: 49_999_999 } }]), false)
  assert.equal(shouldQueuePostfastDelivery([{ metadata: { kind: 'video', sizeBytes: 1_000_000 } }, { metadata: { kind: 'video', sizeBytes: 1_000_000 } }]), true, 'multi-video uploads use the durable queue')
  assert.equal(shouldQueuePostfastDelivery([{ metadata: { kind: 'video', sizeBytes: 50_000_000 } }]), true)
  assert.equal(shouldQueuePostfastDelivery([{ metadata: { kind: 'video', sizeBytes: 79_560_000 } }]), true)
  assert.equal(shouldQueuePostfastDelivery([{ metadata: { kind: 'video', sizeBytes: 150_000_000 } }]), true)
  assert.equal(shouldQueuePostfastDelivery([{ metadata: { kind: 'video', sizeBytes: 244_634_429 } }]), true)
  assert.equal(shouldQueuePostfastDelivery([{ metadata: { kind: 'image', sizeBytes: 244_634_429 } }]), false)
  const uploadLimitMetadata = { kind: 'video' as const, mimeType: 'video/mp4', sizeBytes: 250_000_000 }
  assert.equal(validateUploadMedia(uploadLimitMetadata).some((issue) => issue.field === 'sizeBytes'), false)
  assert.equal(validateUploadMedia({ ...uploadLimitMetadata, sizeBytes: 250_000_001 }).some((issue) => issue.field === 'sizeBytes'), true)
  const integrationSource = await readFile(new URL('../src/lib/integrations/postfast.ts', import.meta.url), 'utf8')
  const streamFunctionStart = integrationSource.indexOf('export async function postfastUploadPublicUrlStream')
  const streamFunctionSource = integrationSource.slice(
    streamFunctionStart,
    integrationSource.indexOf('function normalizeMimeType', streamFunctionStart),
  )
  assert(!streamFunctionSource.includes('arrayBuffer('))
  assert(!streamFunctionSource.includes('Buffer.from('))

  const server = createServer(async (req, res) => {
    const url = req.url || '/'
    if (req.method === 'POST' && url === '/file/get-signed-upload-urls') {
      assert.equal(req.headers['pf-api-key'], API_KEY)
      const body = await readJson(req)
      assert.equal(body.contentType, 'video/mp4')
      return json(res, 200, {
        urls: [{ uploadUrl: `${BASE_URL}/upload/large-video`, storageKey: 'video/large-video-key' }],
      })
    }

    if (req.method === 'GET' && (url === '/source/large-video.mp4' || url === '/source/small-video.mp4')) {
      sourceEnded = false
      const sourceLength = url.includes('/small-') ? SMALL_CONTENT_LENGTH : CONTENT_LENGTH
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': String(sourceLength),
      })
      let sent = 0
      const writeChunk = () => {
        if (sent >= sourceLength) {
          sourceEnded = true
          res.end()
          return
        }
        const nextSize = Math.min(CHUNK_SIZE, sourceLength - sent)
        sent += nextSize
        const chunk = nextSize === CHUNK_SIZE ? STREAM_CHUNK : STREAM_CHUNK.subarray(0, nextSize)
        if (res.write(chunk)) setImmediate(writeChunk)
        else res.once('drain', writeChunk)
      }
      writeChunk()
      return
    }

    if (req.method === 'PUT' && url === '/upload/large-video') {
      uploadContentType = String(req.headers['content-type'] || '')
      uploadContentLength = String(req.headers['content-length'] || '')
      req.on('data', (chunk) => {
        if (uploadedBytes === 0) uploadStartedBeforeSourceEnded = !sourceEnded
        uploadedBytes += chunk.length
      })
      req.on('end', () => {
        res.writeHead(uploadStatus)
        res.end()
      })
      return
    }

    json(res, 404, { error: 'not found' })
  })

  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve))
  try {
    process.env.POSTFAST_BASE_URL = BASE_URL
    const { postfastUploadPublicUrlStream } = await import('../src/lib/integrations/postfast.ts')
    const result = await postfastUploadPublicUrlStream({
      apiKey: API_KEY,
      url: `${BASE_URL}/source/large-video.mp4`,
      filename: 'large-video.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 244_634_429,
      timeoutMs: 30_000,
    })

    assert.deepEqual(result, { success: true, storageKey: 'video/large-video-key' })
    assert.equal(uploadedBytes, CONTENT_LENGTH)
    assert.equal(uploadContentType, 'video/mp4')
    assert.equal(uploadContentLength, String(CONTENT_LENGTH))
    assert.equal(uploadStartedBeforeSourceEnded, true, 'upload must begin before the source stream has completed')

    uploadStatus = 403
    const expiredSignature = await postfastUploadPublicUrlStream({
      apiKey: API_KEY,
      url: `${BASE_URL}/source/small-video.mp4`,
      filename: 'small-video.mp4',
      mimeType: 'video/mp4',
      sizeBytes: SMALL_CONTENT_LENGTH,
      timeoutMs: 30_000,
    })
    assert.equal(expiredSignature.success, false)
    assert.equal(expiredSignature.code, 'POSTFAST_SIGNED_URL_EXPIRED')
    assert.equal(expiredSignature.retryable, true)

    const missingSource = await postfastUploadPublicUrlStream({
      apiKey: API_KEY,
      url: `${BASE_URL}/source/missing.mp4`,
      filename: 'missing.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 79_560_000,
      timeoutMs: 30_000,
    })
    assert.equal(missingSource.success, false)
    assert.equal(missingSource.code, 'POSTFAST_SOURCE_UNAVAILABLE')
    assert.equal(missingSource.retryable, false)
    console.log('PostFast delivery threshold and streaming tests passed.')
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
