import Link from 'next/link'
import {type VideoEditorEntryParams} from '@/lib/unifiedVideoEditor'
import {redirect} from 'next/navigation'
import {authenticateCurrentSession,canAccessBrandScope} from '@/lib/auth-v2/index'
import {allows} from '@/lib/role-permissions/store'
import {labSecret,signAccessIdentity} from '@/lib/role-permissions/token'

export default async function Page({searchParams}:{searchParams:Promise<VideoEditorEntryParams>}){
 const principal=await authenticateCurrentSession()
 if(!principal)redirect('/')
 const params=await searchParams
 const brandId=(Array.isArray(params.brandId)?params.brandId[0]:params.brandId)?.trim()
 if(!await allows(principal,'content.video-making.read')||brandId&&!await canAccessBrandScope(principal,brandId))return <main className="p-10">没有此品牌视频制作权限。<Link href="/board">返回看板</Link></main>
 const base=process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/,'')
 if(!base||!labSecret())return <main className="p-10">Content 服务入口尚未配置。<Link href="/board">返回看板</Link></main>
 const query=brandId?`?brandId=${encodeURIComponent(brandId)}`:''
 redirect(`${base}/admin/video-making${query}#labToken=${encodeURIComponent(signAccessIdentity(principal,brandId))}`)
}
