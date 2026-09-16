import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

export async function analysisActor(request: Request, brandId: string) {
  const session = await getSession()
  const key = extractApiKey(request)
  const agent = key ? await getAgentFromApiKey(key) : null
  const actor = key ? (agent ? { id: agent.id, type: agent.type, role: 'USER' } : null) : session?.user
  if (!actor) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  if (!await canSessionAccessBrandProject(brandId, actor.id, actor.type ?? 'HUMAN', actor.role)) {
    throw Object.assign(new Error('Not found'), { status: 404 })
  }
  return actor
}
