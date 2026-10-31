import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'

const resources = ['video-rewrite.md', 'video-director.md', 'video-camera.md', 'video-production.md'] as const
const version = (text:string) => 'sha256:' + createHash('sha256').update(text).digest('hex')

/** All required craft modules are supplied to the model, not just linked by name. */
export async function loadVideoRewriteSkill(root = process.cwd()) {
 const modules = await Promise.all(resources.map(async name => {
  const resource = 'references/' + name
  const text = await readFile(path.join(root, 'skills/amc-creative', resource), 'utf8')
  if (!text.trim()) throw Error('video_rewrite_skill_unavailable:' + resource)
  return {resource, text, version:version(text)}
 }))
 const text = modules.map(module => module.text).join('\n\n')
 return {text, id:'amc-creative/SKILL.md', resource:modules[0].resource, version:version(text),
  modules:modules.map(({resource, version}) => ({resource, version}))}
}
let cached:ReturnType<typeof loadVideoRewriteSkill>|undefined
/** Generated resources come from the canonical AMC Skills package. */
export function readVideoRewriteSkill() {
 return cached ||= loadVideoRewriteSkill().catch(error => {cached=undefined; throw error})
}
