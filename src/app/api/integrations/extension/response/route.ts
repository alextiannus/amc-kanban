import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { bridgeState } from '@/lib/integrations/extensionBridge'
import { actorFromContext, writeAuditLog } from '@/lib/audit'

type ExtensionResponseBody = {
  requestId?: string
  success?: boolean
  data?: unknown
  error?: string
}

export async function POST(request: Request) {
  // 1. Authenticate caller (session or api key)
  const session = await getSession()
  let authenticated = !!session?.user

  if (!authenticated) {
    const apiKey = extractApiKey(request)
    if (apiKey) {
      const agent = await getAgentFromApiKey(apiKey)
      authenticated = !!agent
    }
  }

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse response body
  let body: ExtensionResponseBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { requestId, success, data, error } = body

  if (!requestId) {
    return NextResponse.json({ error: 'requestId required' }, { status: 400 })
  }

  // 3. Resolve/Reject the pending promise
  const pending = bridgeState.pendingRequests.get(requestId)
  if (!pending) {
    return NextResponse.json({ error: 'Request not found or already timed out' }, { status: 404 })
  }

  // Clear timeout and remove from registry
  clearTimeout(pending.timeout)
  bridgeState.pendingRequests.delete(requestId)

  if (success) {
    writeAuditLog({
      actor: session?.user ? actorFromContext(session.user) : { type: 'SYSTEM', name: 'extension' },
      action: 'EXTENSION_CMD_RECV',
      resourceId: requestId,
      resourceType: 'ExtensionBridge',
      reason: `浏览器插件执行动作成功。数据: ${JSON.stringify(data || {})}`,
    }).catch(console.error)
    pending.resolve(data || { success: true })
  } else {
    writeAuditLog({
      actor: session?.user ? actorFromContext(session.user) : { type: 'SYSTEM', name: 'extension' },
      action: 'EXTENSION_CMD_ERR',
      resourceId: requestId,
      resourceType: 'ExtensionBridge',
      reason: `浏览器插件执行动作失败。错误: ${error || '未知错误'}`,
    }).catch(console.error)
    pending.reject(new Error(error || 'Extension execution failed.'))
  }

  return NextResponse.json({ ok: true })
}
