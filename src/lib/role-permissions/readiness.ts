import { PERMISSION_PROTOCOL } from './contract.ts'
export async function contentPolicyReady() {
  const base = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '')
  const token = process.env.CONTENT_SERVICE_INTERNAL_TOKEN
  if (!base || !token) return false
  try {
    const r = await fetch(`${base}/v1/internal/access-overview`, { headers: { 'x-content-service-token': token }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) })
    return r.ok && (await r.json()).permissionProtocol === PERMISSION_PROTOCOL
  } catch { return false }
}
