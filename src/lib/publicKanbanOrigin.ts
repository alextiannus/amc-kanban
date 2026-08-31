const PRODUCTION_KANBAN_ORIGIN = 'https://amc-kanban.immedi.ai'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

type PublicKanbanOriginOptions = {
  production?: boolean
  configuredUrl?: string | null
}

function parsedOrigin(value: string | null | undefined) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return { origin: url.origin, loopback: LOOPBACK_HOSTS.has(url.hostname) }
  } catch {
    return null
  }
}

export function publicKanbanOrigin(request: Request, options: PublicKanbanOriginOptions = {}) {
  const production = options.production
    ?? (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true')
  const configured = parsedOrigin(
    options.configuredUrl === undefined
      ? process.env.NEXT_PUBLIC_APP_URL
      : options.configuredUrl
  )

  if (production) {
    return configured && !configured.loopback
      ? configured.origin
      : PRODUCTION_KANBAN_ORIGIN
  }

  if (configured) return configured.origin

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProtoValue = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const forwardedProto = forwardedProtoValue === 'http' ? 'http' : 'https'
  const forwarded = parsedOrigin(forwardedHost ? `${forwardedProto}://${forwardedHost}` : '')
  if (forwarded && !forwarded.loopback) return forwarded.origin

  return new URL(request.url).origin
}
