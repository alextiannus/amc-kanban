import crypto from 'crypto'

const DEFAULT_REGION = 'ap-southeast-3'

type ObsConfig = {
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  endpoint: string
  region: string
  publicBaseUrl: string
}

function hmac(key: crypto.BinaryLike | crypto.KeyObject, value: string) {
  return crypto.createHmac('sha256', key).update(value).digest()
}

function sha256Hex(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function encodeObjectKey(key: string) {
  return key.split('/').map(encodePathSegment).join('/')
}

export function getHuaweiObsConfig(): ObsConfig | null {
  const accessKeyId = process.env.HUAWEI_OBS_ACCESS_KEY_ID || process.env.OBS_ACCESS_KEY_ID
  const secretAccessKey = process.env.HUAWEI_OBS_SECRET_ACCESS_KEY || process.env.OBS_SECRET_ACCESS_KEY
  const bucket = process.env.HUAWEI_OBS_BUCKET || process.env.OBS_BUCKET || 'robotics'
  let endpoint = normalizeEndpoint(process.env.HUAWEI_OBS_ENDPOINT || process.env.OBS_ENDPOINT || 'obs.ap-southeast-3.myhuaweicloud.com')
  if (endpoint.startsWith(`${bucket}.`)) endpoint = endpoint.slice(bucket.length + 1)
  
  let region = process.env.HUAWEI_OBS_REGION || process.env.OBS_REGION
  if (!region) {
    const match = endpoint.match(/obs\.([^.]+)\.myhuaweicloud\.com/)
    region = match ? match[1] : DEFAULT_REGION
  }
  
  const publicBaseUrl = (process.env.HUAWEI_OBS_PUBLIC_BASE_URL || process.env.OBS_PUBLIC_BASE_URL || `https://${bucket}.${endpoint}`).replace(/\/+$/, '')

  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) return null

  return { accessKeyId, secretAccessKey, bucket, endpoint, region, publicBaseUrl }
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const dateRegionKey = hmac(dateKey, region)
  const dateRegionServiceKey = hmac(dateRegionKey, 's3')
  return hmac(dateRegionServiceKey, 'aws4_request')
}

export async function uploadHuaweiObsObject(input: {
  key: string
  body: Buffer | string
  contentType: string
  cacheControl?: string
}) {
  const config = getHuaweiObsConfig()
  if (!config) return { ok: false as const, skipped: true as const, error: 'Huawei OBS is not configured' }

  const body = typeof input.body === 'string' ? Buffer.from(input.body) : input.body
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const host = `${config.bucket}.${config.endpoint}`
  const objectPath = `/${encodeObjectKey(input.key)}`
  const payloadHash = sha256Hex(body)

  const headers: Record<string, string> = {
    'cache-control': input.cacheControl || 'public, max-age=31536000, immutable',
    'content-type': input.contentType,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }

  // Only sign host and x-amz-* headers to prevent signature mismatch if fetch alters content-type/cache-control
  const headersToSign: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }

  const signedHeaders = Object.keys(headersToSign).sort().join(';')
  const canonicalHeaders = Object.keys(headersToSign).sort().map((key) => `${key}:${headersToSign[key]}\n`).join('')
  const canonicalRequest = [
    'PUT',
    objectPath,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const signature = crypto.createHmac('sha256', signingKey(config.secretAccessKey, dateStamp, config.region)).update(stringToSign).digest('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(`https://${host}${objectPath}`, {
    method: 'PUT',
    headers: {
      ...headers,
      Authorization: authorization,
    },
    body: new Uint8Array(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false as const, skipped: false as const, error: text || `Huawei OBS upload failed: HTTP ${res.status}` }
  }

  return {
    ok: true as const,
    skipped: false as const,
    key: input.key,
    url: `${config.publicBaseUrl}/${encodeObjectKey(input.key)}`,
  }
}

export async function deleteHuaweiObsObject(key: string) {
  const config = getHuaweiObsConfig()
  if (!config) return { ok: false as const, skipped: true as const, error: 'Huawei OBS is not configured' }

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const host = `${config.bucket}.${config.endpoint}`
  const objectPath = `/${encodeObjectKey(key)}`
  const payloadHash = sha256Hex('')
  const headersToSign: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
  const signedHeaders = Object.keys(headersToSign).sort().join(';')
  const canonicalHeaders = Object.keys(headersToSign).sort().map((header) => `${header}:${headersToSign[header]}\n`).join('')
  const canonicalRequest = ['DELETE', objectPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')
  const signature = crypto.createHmac('sha256', signingKey(config.secretAccessKey, dateStamp, config.region)).update(stringToSign).digest('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const response = await fetch(`https://${host}${objectPath}`, {
    method: 'DELETE',
    headers: {
      ...headersToSign,
      Authorization: authorization,
    },
  })
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => '')
    return { ok: false as const, skipped: false as const, error: text || `Huawei OBS delete failed: HTTP ${response.status}` }
  }
  return { ok: true as const, skipped: false as const }
}

export async function ensureHuaweiObsBrandWorkspace(input: { brandId: string; brandName: string }) {
  const safeName = input.brandName.trim().replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'brand'
  const basePrefix = `brands/${input.brandId}-${safeName}`
  const marker = {
    brandId: input.brandId,
    brandName: input.brandName,
    workspacePrefix: basePrefix,
    folders: ['drafts', 'assets', 'assets/素材库', 'assets/待整理'],
    createdAt: new Date().toISOString(),
  }

  const first = await uploadHuaweiObsObject({
    key: `${basePrefix}/workspace.json`,
    body: JSON.stringify(marker, null, 2),
    contentType: 'application/json; charset=utf-8',
    cacheControl: 'no-cache',
  })

  if (!first.ok) return first

  await Promise.all([
    uploadHuaweiObsObject({ key: `${basePrefix}/drafts/.keep`, body: '', contentType: 'text/plain', cacheControl: 'no-cache' }),
    uploadHuaweiObsObject({ key: `${basePrefix}/assets/.keep`, body: '', contentType: 'text/plain', cacheControl: 'no-cache' }),
    uploadHuaweiObsObject({ key: `${basePrefix}/assets/素材库/.keep`, body: '', contentType: 'text/plain', cacheControl: 'no-cache' }),
    uploadHuaweiObsObject({ key: `${basePrefix}/assets/待整理/.keep`, body: '', contentType: 'text/plain', cacheControl: 'no-cache' }),
  ])

  return { ok: true as const, skipped: false as const, prefix: basePrefix, url: first.url }
}

export function makeBrandAssetKey(input: { brandId: string; folder?: string; filename: string }) {
  const folder = (input.folder || '素材库').replace(/[/\\:*?"<>|]+/g, '-').replace(/^\.+$/, '素材库') || '素材库'
  const ext = input.filename.includes('.') ? `.${input.filename.split('.').pop()}` : ''
  const base = input.filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset'
  const unique = `${base}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`
  return `brands/${input.brandId}/assets/${folder}/${unique}`
}

export function makeBrandVideoOriginalKey(input: {
  brandId: string
  captureDate: string
  projectId: string
  filename: string
}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.captureDate) ? input.captureDate : new Date().toISOString().slice(0, 10)
  const year = date.slice(0, 4)
  const ext = input.filename.includes('.') ? `.${input.filename.split('.').pop()?.toLowerCase()}` : ''
  const base = input.filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'video'
  const project = input.projectId.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unassigned'
  return `brands/${input.brandId}/assets/视频原片/${year}/${date}/${project}/${base}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`
}

export async function persistDraftSnapshotToObs(input: { brandId: string; draftId: string; data: unknown }) {
  return uploadHuaweiObsObject({
    key: `brands/${input.brandId}/drafts/${input.draftId}.json`,
    body: JSON.stringify(input.data, null, 2),
    contentType: 'application/json; charset=utf-8',
    cacheControl: 'no-cache',
  })
}

export function getHuaweiObsPresignedPutUrl(input: {
  key: string
  contentType: string
  expiresInSeconds?: number
}): { uploadUrl: string; publicUrl: string; headers: Record<string, string> } | null {
  const config = getHuaweiObsConfig()
  if (!config) return null

  const expiresIn = input.expiresInSeconds || 900 // 15 mins
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const host = `${config.bucket}.${config.endpoint}`
  const objectPath = `/${encodeObjectKey(input.key)}`

  // Per file-storage-rules: do NOT include volatile headers (Content-Type) in
  // SignedHeaders — browsers may normalize or alter them during PUT, causing
  // 403 SignatureDoesNotMatch. Only sign stable headers (host).
  const signedHeaders = 'host'
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': signedHeaders,
  }

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&')

  // Only canonical-sign 'host' — content-type is NOT signed
  const canonicalHeaders = `host:${host.trim()}\n`

  const canonicalRequest = [
    'PUT',
    objectPath,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const signature = crypto
    .createHmac('sha256', signingKey(config.secretAccessKey, dateStamp, config.region))
    .update(stringToSign)
    .digest('hex')

  const uploadUrl = `https://${host}${objectPath}?${canonicalQueryString}&X-Amz-Signature=${signature}`

  return {
    uploadUrl,
    publicUrl: `${config.publicBaseUrl}/${encodeObjectKey(input.key)}`,
    headers: {
      'Content-Type': input.contentType,
    },
  }
}

