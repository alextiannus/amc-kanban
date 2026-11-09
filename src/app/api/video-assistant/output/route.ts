import {videoAssistantMessage} from '@/lib/video-assistant/presentation'
import {authenticateRequest} from '@/lib/auth-v2'
import {videoAssistant,fetchVideoContent} from '@/lib/video-assistant/runtime'
export const dynamic='force-dynamic'
export const maxDuration=120
export async function GET(request:Request){
 try{
  const p=await authenticateRequest(request);if(!p)return Response.json({error:'请登录 AMC 后查看视频。'},{status:401,headers:{'cache-control':'no-store'}})
  const query=new URL(request.url).searchParams
  const input={brandId:query.get('brandId')||undefined,projectId:query.get('projectId')||undefined,approvalId:query.get('approvalId')||undefined,mediaId:query.get('mediaId')||''}
  if(!input.mediaId||Object.values(input).some(v=>v&&v.length>200))return Response.json({error:'Invalid video reference'},{status:400})
  const actor={userId:p.userId,authVersion:p.authVersion},target=await videoAssistant.downloadTarget(actor,input)
  const upstream=await fetchVideoContent(actor,'GET',target.path,{brandId:target.brandId})
  if(!upstream.ok||!upstream.body)return Response.json({error:'视频暂不可用，请重新读取原任务。'},{status:502,headers:{'cache-control':'no-store'}})
  const contentType=upstream.headers.get('content-type')||''
  if(!contentType.startsWith('video/'))return Response.json({error:'Invalid video response'},{status:502})
  const headers=new Headers({'cache-control':'private, no-store','content-type':contentType,'x-content-type-options':'nosniff','content-disposition':input.approvalId?'inline':'attachment; filename="amc-video.mp4"'})
  const length=upstream.headers.get('content-length');if(length)headers.set('content-length',length)
  return new Response(upstream.body,{headers})
 }catch(e){return Response.json({error:videoAssistantMessage(e)},{status:(e as any)?.status||503,headers:{'cache-control':'no-store'}})}
}
