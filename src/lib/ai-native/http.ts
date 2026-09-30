import { resolveSessionOrApiKey } from '../user-management/auth'
import { allowedRoleWriteOrigin } from '../role-permissions/request-origin'
export const nativeJson=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})
export async function nativeHttp(request:Request,run:(userId:string,body:any)=>Promise<unknown>){
  try{
    const auth=await resolveSessionOrApiKey(request)
    if(!auth)return nativeJson({error:'Unauthorized'},401)
    if(auth.user.type!=='HUMAN')return nativeJson({error:'human_task_owner_required'},403)
    let body={}
    if(request.method!=='GET'){
      if(!allowedRoleWriteOrigin(request)||request.headers.get('sec-fetch-site')==='cross-site')return nativeJson({error:'Forbidden'},403)
      const raw=await request.text();if(raw.length>20000)return nativeJson({error:'payload_too_large'},413)
      try{body=JSON.parse(raw)}catch{return nativeJson({error:'invalid_json'},400)}
    }
    return nativeJson(await run(auth.user.id,body),request.method==='POST'?202:200)
  }catch(e){
    const error=e as {statusCode?:number;status?:number;code?:string}
    const status=error.statusCode||error.status||503
    console.error('[amc-ai] request failed',error.code||'runtime_error')
    return nativeJson({error:error.code||'ai_task_unavailable'},[400,401,403,404,409,413,422,429].includes(status)?status:503)
  }
}
