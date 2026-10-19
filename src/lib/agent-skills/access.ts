import { prisma } from '../prisma'
import type { AuthPrincipal } from '../auth-v2/types'
import { BUILTIN_AGENTS } from './catalog'
export async function visibleSkillAgents(principal: AuthPrincipal) {
  const admin = principal.globalRoles.includes('ADMIN')
  const permissions: {agentId:string}[] = admin ? [] : await prisma.agentPermission.findMany({ where: { humanId: principal.userId }, select: { agentId: true } })
  const owners: {brandAgents:{agentId:string}[]}[] = admin ? [] : await prisma.brand.findMany({ where: { OR: [{ ownerId: principal.userId }, { owners: { some: { userId: principal.userId } } }] }, select: { brandAgents: { where: { active: true }, select: { agentId: true } } } })
  const ids = [principal.userId, ...permissions.map(p => p.agentId), ...owners.flatMap(b => b.brandAgents.map(a => a.agentId))]
  const agents: {id:string;nickname:string|null;email:string;introduction:string|null}[] = await prisma.user.findMany({ where: { type: 'AI_AGENT', ...(!admin ? { id: { in: ids } } : {}) }, select: { id: true, nickname: true, email: true, introduction: true }, orderBy: { createdAt: 'desc' } })
  return [...(admin ? BUILTIN_AGENTS.map(a => ({ ...a, kind: 'builtin' as const, canManage: a.acceptsSkills })) : []), ...agents.map(a => ({ id: a.id, name: a.nickname || a.email, description: a.introduction || '已注册 AI Agent', kind: 'registered' as const, acceptsSkills: true, canManage: admin }))]
}
