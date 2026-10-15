// Shared by OBS signing and the source-media host allowlist. Return the
// regional endpoint, removing an already-qualified bucket prefix exactly once.
export function normalizeHuaweiObsEndpoint(value:string,bucket:string) {
  const endpoint=value.trim().replace(/^https?:\/\//i,'').replace(/\/+$/,'').toLowerCase()
  const prefix=`${bucket.toLowerCase()}.`
  return endpoint.startsWith(prefix)?endpoint.slice(prefix.length):endpoint
}
