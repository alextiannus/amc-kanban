import {allowedRoleWriteOrigin} from '@/lib/role-permissions/request-origin'
import {cookies} from 'next/headers'
import {authenticateCurrentSession} from '@/lib/auth-v2'
import {allows} from '@/lib/role-permissions/store'
export const dynamic='force-dynamic'
const routes:Record<string,{path:string;methods:string[]}>= {
 jobs:{path:'/api/content/video-jobs',methods:['GET','POST','PATCH']},
 voices:{path:'/api/content/video/voices',methods:['GET']},
 capabilities:{path:'/api/content/video/capabilities',methods:['GET']},
 presets:{path:'/api/content/video/presets',methods:['GET']},
}
async function forward(request:Request,{params}:{params:Promise<{operation:string}>}){
 const route=routes[(await params).operation]
 if(!route||!route.methods.includes(request.method))return Response.json({error:'Not found'},{status:404})
 const principal=await authenticateCurrentSession()
 if(!principal)return Response.json({error:'请重新登录。'},{status:401})
 if(!(await allows(principal,'content.video-making.read')||await allows(principal,'content.video-production.read')))return Response.json({error:'没有视频制作权限。'},{status:403})
 const url=new URL(request.url)
 if(request.method!=='GET'&&(!request.headers.get('origin')||!allowedRoleWriteOrigin(request)||request.headers.get('sec-fetch-site')==='cross-site'))return Response.json({error:'Forbidden'},{status:403})
 const token=(await cookies()).get('session')?.value
 if(!token)return Response.json({error:'请重新登录。'},{status:401})
 const body=request.method==='GET'?undefined:await request.text()
 if(body&&new TextEncoder().encode(body).length>9_000_000)return Response.json({error:'请求过大。'},{status:413})
 try{
  // Fixed authenticated upstream; MM rechecks canonical actor, brand and job ownership.
  const response=await fetch('https://amc-mm.immedi.ai'+route.path+url.search,{method:request.method,headers:{cookie:`session=${token}`,'content-type':'application/json',origin:'https://amc-mm.immedi.ai','sec-fetch-site':'same-origin'},body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(180000)})
  return new Response(response.body,{status:response.status,headers:{'content-type':'application/json','cache-control':'no-store'}})
 }catch{return Response.json({error:'视频服务回执暂不可用，请核对当前任务，勿重复提交。'},{status:502})}
}
export {forward as GET,forward as POST,forward as PATCH}
