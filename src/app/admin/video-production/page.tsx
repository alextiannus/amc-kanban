import { contentEntry } from '@/lib/role-permissions/content-entry'
export default async function Page({searchParams}: {searchParams: Promise<{brandId?: string | string[]}>}) {
 const params = await searchParams
 const brandId = (Array.isArray(params.brandId) ? params.brandId[0] : params.brandId)?.trim()
 return contentEntry('video-making', '/admin/video-making', brandId, true)
}
