import { NextResponse } from 'next/server'
import { extractApiKey, getAgentFromApiKey, getSession } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { McpClientManager } from '@/lib/mcp/clientManager'

type Params = { params: Promise<{ id: string }> }
const ALLOWED_COMPAT_TOOLS = new Set([
  'dct-logistics__query_flash_payment_status',
])

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

export async function POST(request: Request, { params }: Params) {
  const { id: brandId } = await params
  const actor = await getActor(request)
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const toolName = typeof body.toolName === 'string' ? body.toolName : ''
  const args = body.args && typeof body.args === 'object' ? body.args : {}

  if (!ALLOWED_COMPAT_TOOLS.has(toolName)) {
    return NextResponse.json({ error: 'Unsupported compatibility MCP tool' }, { status: 400 })
  }

  try {
    const result = await McpClientManager.executeTool(brandId, toolName, args)
    const status = result && (result.isError || result.error) ? 502 : 200
    return NextResponse.json(result, { status })
  } catch (err: any) {
    console.error('[brands/mcp/execute] Tool execution failed:', err)
    return NextResponse.json(
      { error: 'MCP tool execution failed', detail: err?.message || String(err) },
      { status: 502 },
    )
  }
}
