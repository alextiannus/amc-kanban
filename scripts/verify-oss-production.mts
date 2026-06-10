import crypto from 'node:crypto'
import { config as loadDotenv } from 'dotenv'

type ObsConfig = {
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  endpoint: string
  region: string
  publicBaseUrl: string
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function encodeObjectKey(key: string) {
  return key.split('/').map(encodePathSegment).join('/')
}

function sha256Hex(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function hmac(key: crypto.BinaryLike | crypto.KeyObject, value: string) {
  return crypto.createHmac('sha256', key).update(value).digest()
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const dateRegionKey = hmac(dateKey, region)
  const dateRegionServiceKey = hmac(dateRegionKey, 's3')
  return hmac(dateRegionServiceKey, 'aws4_request')
}

function getObsConfig(): ObsConfig | null {
  const accessKeyId = process.env.HUAWEI_OBS_ACCESS_KEY_ID || process.env.OBS_ACCESS_KEY_ID
  const secretAccessKey = process.env.HUAWEI_OBS_SECRET_ACCESS_KEY || process.env.OBS_SECRET_ACCESS_KEY
  const bucket = process.env.HUAWEI_OBS_BUCKET || process.env.OBS_BUCKET
  const endpointRaw = process.env.HUAWEI_OBS_ENDPOINT || process.env.OBS_ENDPOINT
  if (!accessKeyId || !secretAccessKey || !bucket || !endpointRaw) return null

  let endpoint = normalizeEndpoint(endpointRaw)
  if (endpoint.startsWith(`${bucket}.`)) endpoint = endpoint.slice(bucket.length + 1)
  const region = process.env.HUAWEI_OBS_REGION || process.env.OBS_REGION || 'ap-southeast-3'
  const publicBaseUrl = (process.env.HUAWEI_OBS_PUBLIC_BASE_URL || process.env.OBS_PUBLIC_BASE_URL || `https://${bucket}.${endpoint}`).replace(/\/+$/, '')
  return { accessKeyId, secretAccessKey, bucket, endpoint, region, publicBaseUrl }
}

function loadLocalEnvFiles() {
  // Best-effort local loading; platform env vars still take precedence.
  const candidates = ['.env', '.env.local', '.env.production', '.env.production.local']
  for (const path of candidates) {
    loadDotenv({ path, override: false })
  }
}

function missingObsEnvKeys() {
  const requiredPairs = [
    ['HUAWEI_OBS_ACCESS_KEY_ID', 'OBS_ACCESS_KEY_ID'],
    ['HUAWEI_OBS_SECRET_ACCESS_KEY', 'OBS_SECRET_ACCESS_KEY'],
    ['HUAWEI_OBS_BUCKET', 'OBS_BUCKET'],
    ['HUAWEI_OBS_ENDPOINT', 'OBS_ENDPOINT'],
  ] as const

  return requiredPairs
    .filter(([k1, k2]) => !process.env[k1] && !process.env[k2])
    .map(([k1, k2]) => `${k1} or ${k2}`)
}

async function signedRequest(input: {
  config: ObsConfig
  method: 'PUT' | 'DELETE' | 'GET'
  key: string
  body?: Buffer
  contentType?: string
}) {
  const { config, method, key } = input
  const body = input.body ?? Buffer.alloc(0)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const host = `${config.bucket}.${config.endpoint}`
  const objectPath = `/${encodeObjectKey(key)}`
  const payloadHash = sha256Hex(body)

  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }

  if (method === 'PUT') {
    headers['cache-control'] = 'no-cache'
    headers['content-type'] = input.contentType || 'application/octet-stream'
  }

  const signedHeaders = Object.keys(headers).sort().join(';')
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join('')

  const canonicalRequest = [
    method,
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

  const signature = crypto
    .createHmac('sha256', signingKey(config.secretAccessKey, dateStamp, config.region))
    .update(stringToSign)
    .digest('hex')

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  const url = `https://${host}${objectPath}`

  const res = await fetch(url, {
    method,
    headers: {
      ...headers,
      Authorization: authorization,
    },
    body: method === 'PUT' ? new Uint8Array(body) : undefined,
  })

  return res
}

function getFrontendOrigins() {
  const list = (process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const appBaseUrl = (process.env.APP_BASE_URL || '').trim()
  if (appBaseUrl && !list.includes(appBaseUrl)) list.push(appBaseUrl)
  return list
}

async function main() {
  loadLocalEnvFiles()

  const failures: string[] = []
  const config = getObsConfig()

  if (!config) {
    const missing = missingObsEnvKeys()
    console.error('FAIL: missing OSS env vars.')
    if (missing.length > 0) {
      console.error(`Missing: ${missing.join(', ')}`)
    }
    console.error('Tip: If vars are only configured on your hosting platform, run this script in that runtime shell or redeploy/restart the service before verifying.')
    process.exit(1)
  }

  console.log('PASS: OSS env vars are present.')

  const key = `healthchecks/oss-${Date.now()}-${crypto.randomUUID()}.txt`
  const body = Buffer.from('oss-healthcheck', 'utf8')

  const putRes = await signedRequest({
    config,
    method: 'PUT',
    key,
    body,
    contentType: 'text/plain; charset=utf-8',
  })

  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '')
    console.error(`FAIL: signed upload failed (${putRes.status}) ${text}`)
    process.exit(1)
  }
  console.log('PASS: signed upload succeeded.')

  const publicUrl = `${config.publicBaseUrl}/${encodeObjectKey(key)}`
  const publicReadRes = await fetch(publicUrl, { method: 'GET' })
  if (!publicReadRes.ok) {
    failures.push(`public read check failed (${publicReadRes.status}) on ${publicUrl}`)
  } else {
    const text = await publicReadRes.text().catch(() => '')
    if (text !== 'oss-healthcheck') {
      failures.push('public read returned unexpected body')
    } else {
      console.log('PASS: public read is enabled for uploaded object.')
    }
  }

  const origins = getFrontendOrigins()
  if (origins.length === 0) {
    failures.push('no frontend origins configured. Set FRONTEND_ORIGINS or APP_BASE_URL to verify CORS.')
  } else {
    for (const origin of origins) {
      const preflight = await fetch(publicUrl, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'GET',
        },
      })

      const allowOrigin = preflight.headers.get('access-control-allow-origin')
      if (!preflight.ok || (allowOrigin !== '*' && allowOrigin !== origin)) {
        failures.push(`cors check failed for ${origin}: status=${preflight.status}, access-control-allow-origin=${allowOrigin || 'missing'}`)
      } else {
        console.log(`PASS: CORS allows origin ${origin}.`)
      }
    }
  }

  const delRes = await signedRequest({ config, method: 'DELETE', key })
  if (!delRes.ok) {
    const text = await delRes.text().catch(() => '')
    console.warn(`WARN: cleanup delete failed (${delRes.status}) ${text}`)
  }

  if (failures.length > 0) {
    console.error('\nOSS verification failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log('\nOSS verification passed for env vars, public read, and CORS.')
}

main().catch((error: unknown) => {
  console.error('FAIL: unexpected error during OSS verification.')
  console.error(error)
  process.exit(1)
})
