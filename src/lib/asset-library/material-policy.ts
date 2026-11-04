export const MATERIAL_CLASSES = ['ORIGINAL', 'MANUAL', 'AI', 'UNCONFIRMED'] as const
export type MaterialClass = typeof MATERIAL_CLASSES[number]
export const MATERIAL_FORMS = ['UNKNOWN', 'CLIP', 'FINISHED'] as const
export type MaterialForm = typeof MATERIAL_FORMS[number]
export const AI_SOURCES = ['ai_video', 'ai_video_final', 'generated_video', 'ai_image', 'generated_image', 'designer_ai', 'designer', 'veo3', 'video_director']

export function materialClass(value: unknown): MaterialClass {
  if (!MATERIAL_CLASSES.includes(value as MaterialClass)) throw Object.assign(new Error('请选择素材类别'), { status: 400 })
  return value as MaterialClass
}
export function materialForm(value: unknown): MaterialForm {
  if (!MATERIAL_FORMS.includes(value as MaterialForm)) throw Object.assign(new Error('请选择片段或成片标记'), { status: 400 })
  return value as MaterialForm
}
export function isAiSource(source: string | null | undefined) { return AI_SOURCES.includes(source || '') }
export function isKnownAiAsset(asset: { sourceType?: string | null; technicalMetadata?: unknown }) {
  if (isAiSource(asset.sourceType)) return true
  const metadata = asset.technicalMetadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  const provenance = (metadata as Record<string, unknown>).materialProvenance
  return !!provenance && typeof provenance === 'object' && (provenance as Record<string, unknown>).origin === 'AI_GENERATION'
}
export function requestedFolderTarget(body: Record<string, unknown>): { id: string } | { name: string } | null {
  if (body.folderId === null) return null
  if (body.folderId !== undefined) {
    if (typeof body.folderId !== 'string' || !body.folderId.trim()) throw Object.assign(new Error('目录标识无效'), { status: 400 })
    return { id: body.folderId.trim() }
  }
  // An explicit root is a real choice, not permission to fall through to a
  // conflicting legacy aiCategory (for example a creative's suggested label).
  const value = body.folder !== undefined ? body.folder : body.aiCategory
  if (value === undefined) return null
  if (typeof value !== 'string') throw Object.assign(new Error('目录名称无效'), { status: 400 })
  const name = value.trim()
  return !name || ['素材库', 'raw'].includes(name) ? null : { name }
}
export function assertClassChange(current: string, next: string, confirmed: unknown, source?: string | null, knownAi = false) {
  if ((knownAi || isAiSource(source)) && next !== 'AI') throw Object.assign(new Error('AI 制作素材应保留 AI 类别'), { status: 409 })
  if (current !== next && confirmed !== true) throw Object.assign(new Error('请确认素材类别调整'), { status: 409, code: 'MATERIAL_CLASS_CONFIRMATION_REQUIRED' })
}

export type FolderNode = { id: string; parentId: string | null; name: string; folderKind: string; materialClass: string; revision: number }
export function folderPath(folder: FolderNode, folders: FolderNode[]): FolderNode[] {
  const path: FolderNode[] = []; const visited = new Set<string>(); let node: FolderNode | undefined = folder
  while (node) {
    if (visited.has(node.id)) throw Object.assign(new Error('目录不能循环嵌套'), { status: 409 })
    visited.add(node.id); path.unshift(node)
    if (!node.parentId) break
    node = folders.find(f => f.id === node!.parentId)
    if (!node) throw Object.assign(new Error('父目录不存在'), { status: 409 })
  }
  return path
}
export function subtreeIds(id: string, folders: FolderNode[]): string[] {
  const ids = new Set([id]); let changed = true
  while (changed) { changed = false; for (const f of folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); changed = true } }
  return [...ids]
}
export function validateFolderMove(folder: FolderNode, parentId: string | null, folders: FolderNode[]) {
  if (folder.folderKind === 'STANDARD') throw Object.assign(new Error('标准一级目录不可移动'), { status: 409 })
  const descendants = subtreeIds(folder.id, folders)
  if (parentId && descendants.includes(parentId)) throw Object.assign(new Error('目录不能移到自己或子目录中'), { status: 409 })
  const parent = parentId ? folders.find(f => f.id === parentId) : null
  if (parentId && !parent) throw Object.assign(new Error('父目录不存在'), { status: 404 })
  if (parent && parent.materialClass !== folder.materialClass) throw Object.assign(new Error('目录只能移到同类别目录下'), { status: 409 })
  if (!parent && !['MANUAL', 'AI'].includes(folder.materialClass)) throw Object.assign(new Error('原始素材子目录须位于标准目录下'), { status: 409 })
  const baseDepth = parent ? folderPath(parent, folders).length : 0
  const oldDepth = folderPath(folder, folders).length
  const height = Math.max(...folders.filter(f => descendants.includes(f.id)).map(f => folderPath(f, folders).length - oldDepth + 1))
  if (baseDepth + height > 3) throw Object.assign(new Error('目录最多三级'), { status: 409 })
}
