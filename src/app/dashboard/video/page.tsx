import {redirect} from 'next/navigation'
import {authenticateCurrentSession,canAccessBrandScope} from '@/lib/auth-v2'
import {allows} from '@/lib/role-permissions/store'
import VideoEditor from '@/components/video-editor/VideoEditor'
import {unifiedVideoEditorUrl,type VideoEditorEntryParams} from '@/lib/unifiedVideoEditor'
export default async function Page({searchParams}:{searchParams:Promise<VideoEditorEntryParams>}){
 const actor=await authenticateCurrentSession()
 if(!actor)redirect('/')
 const raw=await searchParams,params=Object.fromEntries(new URL(unifiedVideoEditorUrl(raw),'https://amc-kanban.immedi.ai').searchParams)
 if(!params.brandId)return <main className="p-8">请从品牌看板或素材库进入视频编辑器。<a href="/board">返回看板</a></main>
 if(!(await allows(actor,'content.video-making.read')||await allows(actor,'content.video-production.read'))||!await canAccessBrandScope(actor,params.brandId))return <main className="p-8">没有此品牌的视频制作权限。</main>
 return <VideoEditor key={params.brandId} actorId={actor.userId} brandId={params.brandId} params={params}/>
}
