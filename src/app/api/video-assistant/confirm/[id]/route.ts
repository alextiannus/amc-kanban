import {videoAssistantMessage} from '@/lib/video-assistant/presentation'
import {authenticateRequest} from '@/lib/auth-v2'
import {allowedRoleWriteOrigin} from '@/lib/role-permissions/request-origin'
import {videoAssistant} from '@/lib/video-assistant/runtime'
export const dynamic='force-dynamic'
export const maxDuration=120
const headers={'cache-control':'no-store'}
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,{params}:Context){
 try{
  const p=await authenticateRequest(request);if(!p)return Response.json({error:'请登录 AMC 后继续。'},{status:401,headers})
  return Response.json(await videoAssistant.preview({userId:p.userId,authVersion:p.authVersion},(await params).id),{headers})
 }catch(e){return Response.json({error:videoAssistantMessage(e)},{status:(e as any)?.status||503,headers})}
}
export async function POST(request:Request,{params}:Context){
 // API keys and assistant tool calls can never manufacture a human approval.
 if(!request.headers.get('origin')||!allowedRoleWriteOrigin(request)||request.headers.get('sec-fetch-site')==='cross-site'||request.headers.has('authorization')||request.headers.has('x-api-key'))return Response.json({error:'请在登录后的确认页面操作。'},{status:403,headers})
 try{
  const p=await authenticateRequest(request);if(!p||p.source!=='session')return Response.json({error:'请登录 AMC 后继续。'},{status:401,headers})
  const body=await request.json().catch(()=>null)
  if(body?.confirmed!==true||Object.keys(body).some(k=>k!=='confirmed'))return Response.json({error:'请确认当前内容。'},{status:400,headers})
  return Response.json(await videoAssistant.confirm({userId:p.userId,authVersion:p.authVersion},(await params).id),{headers})
 }catch(e){return Response.json({error:videoAssistantMessage(e)},{status:(e as any)?.status||503,headers})}
}
