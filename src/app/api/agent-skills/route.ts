import { allowedRoleWriteOrigin } from '@/lib/role-permissions/request-origin'
import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth-v2'
import { visibleSkillAgents } from '@/lib/agent-skills/access'
import { agentSkills, changeAgentSkill } from '@/lib/agent-skills/store'
import { bundledSkills, USER_AI, COPYWRITER, fail } from '@/lib/agent-skills/catalog'

function errorResponse(error: unknown) {
  const status = Number((error as { statusCode?: number })?.statusCode) || 500
  if (status === 500) console.error('[agent-skills]', error)
  return NextResponse.json({ error: status === 500 ? 'Skills 加载或保存失败，请稍后重试' : (error as Error).message }, { status })
}
export async function GET(request: Request) {
  try {
    const principal = await authenticateRequest(request)
    if (!principal) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const agents = await visibleSkillAgents(principal)
    const agentId = new URL(request.url).searchParams.get('agentId')
    if (agentId && !agents.some(a => a.id === agentId)) throw fail('无权查看此 Agent', 403)
    const selected = agentId ? agents.filter(a => a.id === agentId) : agents
    const rows = await Promise.all(selected.map(async agent => ({ ...agent, skills: await agentSkills(agent.id) })))
    const catalog = principal.globalRoles.includes('ADMIN') ? [...await bundledSkills(USER_AI), ...await bundledSkills(COPYWRITER)] : []
    return NextResponse.json({ agents: rows, catalog }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return errorResponse(error) }
}
export async function POST(request: Request) {
  try {
    const principal = await authenticateRequest(request)
    if (!principal) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    if (!allowedRoleWriteOrigin(request) || request.headers.get('sec-fetch-site') === 'cross-site') throw fail('不允许跨站修改', 403)
    if (!principal.globalRoles.includes('ADMIN')) throw fail('仅管理员可以修改 Agent Skills', 403)
    if (Number(request.headers.get('content-length')) > 300000) throw fail('请求过大', 413)
    const raw = await request.text()
    if (Buffer.byteLength(raw) > 300000) throw fail('请求过大', 413)
    let body
    try { body = JSON.parse(raw) } catch { throw fail('无效 JSON') }
    if (!body || typeof body.agentId !== 'string' || typeof body.expectedVersion !== 'string' || !['save', 'uninstall'].includes(body.action)) throw fail('缺少 Agent、操作或版本')
    const agent = (await visibleSkillAgents(principal)).find(a => a.id === body.agentId)
    if (!agent) throw fail('Agent 不存在', 404)
    if (!agent.acceptsSkills) throw fail('此工作流节点尚无 Markdown Skill 加载接口', 409)
    return NextResponse.json(await changeAgentSkill(body, principal.userId, principal.actorType === 'AMC_AGENT' ? 'AI_AGENT' : 'HUMAN'))
  } catch (error) { return errorResponse(error) }
}
