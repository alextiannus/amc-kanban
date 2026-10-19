import type { Prisma } from '@prisma/client'
import { skillMetadata } from '@immedi/iaic-core/skills/metadata.js'
import { USER_AI, PLATFORM_AI } from './catalog'
import { prisma } from '../prisma'
import { bundledSkills, mergeSkills, validateSkill, fail, type Setting } from './catalog'

// SQL uses the migration's table so deployments do not depend on a stale generated client.
export async function agentSkills(agentId: string) {
  const settings = await prisma.$queryRaw<Setting[]>`SELECT "skillId", "content", "installed", "revision" FROM "AgentSkillSetting" WHERE "agentId" = ${agentId}`
  return mergeSkills(await bundledSkills(agentId), settings)
}
export async function readAgentSkill(agentId: string, skillId: string) {
  validateSkill(skillId)
  const skill = (await agentSkills(agentId)).find(item => item.id === skillId && item.installed)
  if (!skill) throw fail(`Skill 未安装：${skillId}`, 404)
  return skill
}
export async function changeAgentSkill(input: { agentId: string; skillId: string; action: 'save' | 'uninstall'; content?: string; expectedVersion: string }, actorId: string, actorType = 'HUMAN') {
  validateSkill(input.skillId)
  const defaults = await bundledSkills(input.agentId)
  // Trusted built-ins can exceed the custom-upload limit; exact equality is required.
  const restoresBundled = input.action === 'save' && defaults.some(skill => skill.id === input.skillId && skill.content === input.content)
  if (!restoresBundled) validateSkill(input.skillId, input.action === 'save' ? input.content : undefined)
  if (input.action === 'save' && typeof input.content !== 'string') throw fail('缺少 Skill 内容')
  if (input.action === 'save' && [USER_AI, PLATFORM_AI].includes(input.agentId)) skillMetadata(input.content!, input.skillId)
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Serialize first installs too: there may be no row to lock yet.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-skill:${input.agentId}:${input.skillId}`}, 0))`
    const rows = await tx.$queryRaw<Setting[]>`SELECT "skillId", "content", "installed", "revision" FROM "AgentSkillSetting" WHERE "agentId" = ${input.agentId} AND "skillId" = ${input.skillId}`
    const current = mergeSkills(defaults, rows).find(item => item.id === input.skillId)
    if ((current?.version ?? 'absent') !== input.expectedVersion) throw fail('此 Skill 已被修改，请保留草稿并重新加载最新版本', 409)
    if (input.action === 'uninstall' && !current?.installed) throw fail('此 Skill 尚未安装', 409)
    const installed = input.action === 'save'
    const content = installed ? input.content! : current!.content
    const revision = (rows[0]?.revision ?? 0) + 1
    await tx.$executeRaw`INSERT INTO "AgentSkillSetting" ("agentId", "skillId", "content", "installed", "revision") VALUES (${input.agentId}, ${input.skillId}, ${content}, ${installed}, ${revision}) ON CONFLICT ("agentId", "skillId") DO UPDATE SET "content" = EXCLUDED."content", "installed" = EXCLUDED."installed", "revision" = EXCLUDED."revision", "updatedAt" = CURRENT_TIMESTAMP`
    await tx.auditLog.create({ data: { actorId, actorType, action: installed ? (current?.installed ? 'SKILL_UPDATED' : 'SKILL_INSTALLED') : 'SKILL_UNINSTALLED', resourceType: 'AgentSkill', resourceId: `${input.agentId}/${input.skillId}`, metadata: { agentId: input.agentId, skillId: input.skillId, revision }, ...(current ? { oldValue: current } : {}), newValue: { content, installed, revision } } })
    return { version: `revision:${revision}`, installed }
  })
}
