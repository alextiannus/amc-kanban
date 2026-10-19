import { SkillCatalog } from '@immedi/iaic-core/skills/catalog.js'
import { skillMetadata } from '@immedi/iaic-core/skills/metadata.js'
import { agentSkills } from './store'
import { USER_AI, USER_SKILLS, hash, fail } from './catalog'

type Context = { actor: unknown }
/** Keep authorization at discovery/read time, including after role revocation. */
export function managedSkillCatalog(root: string, authorize: (actor: unknown) => Promise<boolean>, agentId = USER_AI) {
  const bundled = new SkillCatalog({ root, entries: agentId === USER_AI ? USER_SKILLS.map(name => `${name}/SKILL.md`) : [] })
  const selected = async (context: Context) => {
    if (!await authorize(context.actor)) throw fail('无权读取 Skills', 403)
    return (await agentSkills(agentId)).filter(skill => skill.installed)
  }
  return {
    async list(context: Context) {
      return (await selected(context)).map(skill => ({ id: skill.id, ...skillMetadata(skill.content, skill.id), version: hash(skill.content) }))
    },
    async read(id: string, options: { resource?: string | null; expectedVersion?: string | null; expectedResourceVersion?: string | null } = {}, context: Context) {
      const skill = (await selected(context)).find(item => item.id === id)
      if (!skill) throw fail(`Skill 未安装：${id}`, 404)
      const version = hash(skill.content)
      if (options.expectedVersion && options.expectedVersion !== version) throw fail('Skill 已更新，请重新读取', 409)
      if (options.resource != null) {
        // Only bundled packages have resources. The existing catalog enforces realpath containment.
        if (skill.source !== 'bundled') throw fail('此 Skill 没有附加资源', 404)
        const resource = await bundled.read(id, { resource: options.resource, expectedResourceVersion: options.expectedResourceVersion })
        return { ...resource, skillVersion: version }
      }
      if (options.expectedResourceVersion && options.expectedResourceVersion !== version) throw fail('Skill 已更新，请重新读取', 409)
      return { id, resource: null, text: skill.content, version, skillVersion: version }
    },
  }
}
