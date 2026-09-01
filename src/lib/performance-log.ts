const FETCH_PATCH_KEY = Symbol.for('amc.performance.fetchPatched')

type GlobalWithFetchPatch = typeof globalThis & {
  [FETCH_PATCH_KEY]?: boolean
}

function shouldLogAll() {
  return process.env.AMC_PERF_LOG_ALL === 'true'
}

function slowFetchThresholdMs(url: string) {
  if (url.includes('/health')) return 1200
  if (url.includes('/generate') || url.includes('/voice') || url.includes('/tts')) return 8000
  return 3000
}

function safeUrl(input: unknown) {
  try {
    const raw = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input instanceof Request
          ? input.url
          : ''
    const url = new URL(raw)
    return {
      url: `${url.origin}${url.pathname}`,
      host: url.host,
      path: url.pathname,
    }
  } catch {
    return { url: 'unknown', host: 'unknown', path: 'unknown' }
  }
}

export function installPerformanceLogging(service = 'amc-kanban') {
  const globalRef = globalThis as GlobalWithFetchPatch
  if (globalRef[FETCH_PATCH_KEY]) return
  globalRef[FETCH_PATCH_KEY] = true

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startedAt = performance.now()
    const method = init?.method || (input instanceof Request ? input.method : 'GET')
    const target = safeUrl(input)
    try {
      const response = await originalFetch(input, init)
      const elapsedMs = Math.round(performance.now() - startedAt)
      const slow = elapsedMs >= slowFetchThresholdMs(target.path)
      if (slow || shouldLogAll()) {
        ;(slow ? console.warn : console.log)(JSON.stringify({
          event: 'amc_perf_fetch',
          service,
          method,
          url: target.url,
          host: target.host,
          status: response.status,
          elapsedMs,
          slow,
        }))
      }
      return response
    } catch (error: any) {
      const elapsedMs = Math.round(performance.now() - startedAt)
      console.warn(JSON.stringify({
        event: 'amc_perf_fetch_error',
        service,
        method,
        url: target.url,
        host: target.host,
        elapsedMs,
        error: error?.name || error?.message || String(error),
      }))
      throw error
    }
  }
}
