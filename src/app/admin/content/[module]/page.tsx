import { notFound } from 'next/navigation'
import { contentEntry } from '@/lib/role-permissions/content-entry'
import { PERMISSION_MODULES } from '@/lib/role-permissions/contract'
export default async function Page({ params, searchParams }: { params: Promise<{module:string}>; searchParams: Promise<{brandId?:string}> }) {
  const id = (await params).module
  const module = PERMISSION_MODULES.find(m => m.id === `content.${id}`)
  if (!module) notFound()
  const path = ['skills', 'knowledge', 'records'].includes(id) ? `/admin/content-lab/${id}` : `/admin/${id}`
  return contentEntry(id, path, (await searchParams).brandId, module.scope === '已授权品牌')
}
