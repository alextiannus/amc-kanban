import { createHash, createHmac, randomUUID } from 'node:crypto'

export async function analysisGateway(config: { baseUrl: string; secret: string }, path: string, payload?: unknown) {
  const method = payload === undefined ? 'GET' : 'POST'
  const body = payload === undefined ? '' : JSON.stringify(payload)
  const timestamp = String(Date.now()), nonce = randomUUID()
  const signature = createHmac('sha256', config.secret).update([method, path, timestamp, nonce, createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex')
  const response = await fetch(config.baseUrl + path, { method, headers: { 'content-type': 'application/json', 'x-amc-timestamp': timestamp, 'x-amc-nonce': nonce, 'x-amc-signature': signature }, ...(body ? { body } : {}), signal: AbortSignal.timeout(20_000) })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(`Image analysis gateway unavailable (${response.status})`)
  return data
}
