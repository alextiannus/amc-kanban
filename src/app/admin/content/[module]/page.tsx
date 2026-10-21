import type {VideoEditorEntryParams} from '@/lib/unifiedVideoEditor'
import { notFound } from 'next/navigation'
import { contentEntry } from '@/lib/role-permissions/content-entry'
import { PERMISSION_MODULES } from '@/lib/role-permissions/contract'
export default async function Page({ params, searchParams }: { params: Promise<{module:string}>; searchParams: Promise<VideoEditorEntryParams> }) {
  const id = (await params).module
  const module = PERMISSION_MODULES.find(m => m.id === `content.${id}`)
  if (!module) notFound()
  const path = ['skills', 'knowledge', 'records'].includes(id) ? `/admin/content-lab/${id}` : `/admin/${id}`
  const context = await searchParams
  const brandId = typeof context.brandId === 'string' ? context.brandId.trim() : undefined
  return contentEntry(id, path, brandId, module.scope === '已授权品牌', context)
}
