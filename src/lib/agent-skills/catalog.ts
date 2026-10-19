import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const USER_AI = 'builtin:user-ai'
export const PLATFORM_AI = 'builtin:platform-ai'
export const COPYWRITER = 'builtin:copywriter'
export const USER_SKILLS = ['amc-conversation', 'amc-marketing-expert', 'amc-brand-planning', 'amc-discovery', 'amc-creative', 'amc-brief', 'amc-autopilot']
export const PLATFORMS = ['instagram', 'tiktok', 'xiaohongshu', 'facebook', 'google_business']
export const BUILTIN_AGENTS = [
  { id: PLATFORM_AI, name: 'AMC Platform AI', description: '平台缺陷调查、修复与工程任务', acceptsSkills: true },
  { id: 'builtin:platform-reviewer', name: 'Platform Reviewer · 工程复审', description: '独立审核模型，当前没有 Markdown Skill 加载接口', acceptsSkills: false },
  { id: USER_AI, name: 'AMC User AI', description: '对话、品牌策划、创意与自主任务', acceptsSkills: true },
  { id: COPYWRITER, name: 'Copywriter · 文案', description: '平台写作规范与文案生成', acceptsSkills: true },
  ...[['coordinator', '协调'], ['researcher', '调研'], ['strategist', '策略'], ['assetCurator', '素材'], ['designer', '设计'], ['compliance', '合规'], ['publisher', '发布'], ['scheduler', '排期']].map(([id, name]) => ({ id: `builtin:${id}`, name, description: '代码工作流节点，当前没有 Markdown Skill 加载接口', acceptsSkills: false })),
]
export type Skill = { id: string; content: string; version: string; installed: boolean; source: 'bundled' | 'custom'; name: string }
export const hash = (text: string) => createHash('sha256').update(text).digest('hex')
export const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode })
export function validateSkill(id: unknown, content?: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*\/SKILL\.md$/.test(id) || id.length > 90) throw fail('Skill ID 必须为小写名称/SKILL.md')
  if (content !== undefined && (typeof content !== 'string' || !content.trim() || Buffer.byteLength(content) > 60000 || content.includes('\0'))) throw fail('Skill 内容不能为空，且不得超过 60 KB')
}
export async function bundledSkills(agentId: string, root = process.cwd()): Promise<Skill[]> {
  const entries = agentId === USER_AI ? USER_SKILLS : agentId === COPYWRITER ? PLATFORMS : []
  return Promise.all(entries.map(async name => {
    const file = agentId === USER_AI ? path.join(root, 'skills', name, 'SKILL.md') : path.join(root, 'src/agents/skills/platforms', name, 'SKILL.md')
    const content = await readFile(file, 'utf8')
    return { id: `${name}/SKILL.md`, name, content, version: `bundled:${hash(content)}`, installed: true, source: 'bundled' as const }
  }))
}
export type Setting = { skillId: string; content: string | null; installed: boolean; revision: number }
export function mergeSkills(defaults: Skill[], settings: Setting[]): Skill[] {
  const skills = new Map(defaults.map(skill => [skill.id, skill]))
  for (const row of settings) {
    const base = skills.get(row.skillId)
    skills.set(row.skillId, { id: row.skillId, name: row.skillId.split('/')[0], content: row.content ?? base?.content ?? '', installed: row.installed, source: base ? 'bundled' : 'custom', version: `revision:${row.revision}` })
  }
  return [...skills.values()].sort((a,b) => a.id.localeCompare(b.id))
}
