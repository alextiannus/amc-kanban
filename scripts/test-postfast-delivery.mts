#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  POSTFAST_ASYNC_VIDEO_THRESHOLD_BYTES,
  POSTFAST_MAX_UPLOAD_BYTES,
  shouldQueuePostfastDelivery,
} from '../src/lib/postfastDeliveryPolicy.ts'
import { validateUploadMedia } from '../src/lib/mediaValidation.ts'

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

async function main() {
  assert.equal(POSTFAST_ASYNC_VIDEO_THRESHOLD_BYTES, 50_000_000)
  assert.equal(POSTFAST_MAX_UPLOAD_BYTES, 250_000_000)
  assert.equal(shouldQueuePostfastDelivery([{ metadata: { kind: 'video', sizeBytes: 49_999_999 } }]), false)
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
