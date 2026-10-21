import Link from 'next/link'
import {redirect} from 'next/navigation'
import {authenticateCurrentSession,canAccessBrandScope} from '@/lib/auth-v2/index'
import {allows} from '@/lib/role-permissions/store'

export default async function Page({searchParams}:{searchParams:Promise<{brandId?:string|string[]}>}){
 const principal=await authenticateCurrentSession()
 if(!principal)redirect('/')
 const params=await searchParams
 const brandId=(Array.isArray(params.brandId)?params.brandId[0]:params.brandId)?.trim()
 if(!await allows(principal,'content.video-making.read')||brandId&&!await canAccessBrandScope(principal,brandId))return <main className="p-10">没有此品牌视频制作权限。<Link href="/board">返回看板</Link></main>
 const query=new URLSearchParams({videoEditor:'1'})
 if(brandId)query.set('brandId',brandId)
 redirect(`https://amc-mm.immedi.ai/dashboard?${query}`)
}
