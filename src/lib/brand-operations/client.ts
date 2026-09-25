export class OperationsRequestError extends Error {
  constructor(message: string, public refreshBeforeWrite = false) { super(message) }
}

/** Bound both the response and body read; a timed-out write may already have committed. */
export async function fetchOperationsJson<T>(url: string, init: RequestInit = {}, options: {
  timeoutMs?: number; en?: boolean
} = {}): Promise<T> {
  const controller = new AbortController()
  const cancel = () => controller.abort(init.signal?.reason)
  if (init.signal?.aborted) cancel()
  else init.signal?.addEventListener('abort', cancel, { once: true })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 15_000)
  const write = init.method === 'PATCH'
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const body = await response.json()
    if (!response.ok) throw new OperationsRequestError(
      body.error || (options.en ? 'Request failed. Please retry.' : '请求失败，请重试'),
      write && (response.status === 409 || response.status >= 500),
    )
    return body as T
  } catch (error) {
    if (error instanceof OperationsRequestError || init.signal?.aborted) throw error
    const message = write
      ? (options.en ? 'The result could not be confirmed. Refresh the list before making another change.' : '无法确认保存结果，请先刷新列表核对当前数据后再操作。')
      : timedOut
        ? (options.en ? 'Loading timed out. Please retry.' : '加载超时，请重试。')
        : (options.en ? 'Could not load data. Please retry.' : '数据加载失败，请重试。')
    throw new OperationsRequestError(message, write)
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', cancel)
  }
}
