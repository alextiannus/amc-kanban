import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {allowedRoleWriteOrigin} from '@/lib/role-permissions/request-origin'
import {CreativeRevisionError} from '@/lib/brand-plan/creativeRevisionContract'
import {readSkuDecision,saveSkuDecision} from '@/lib/brand-plan/creativeSkuDecision'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string;creativeId:string}>}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})
async function handle(request:Request,context:Context,write=false){
  try{
    const auth=await resolveSessionOrApiKey(request)
    if(!auth)return json({error:'Unauthorized'},401)
    if(write&&!allowedRoleWriteOrigin(request))return json({error:'Forbidden'},403)
    const {id,creativeId}=await context.params,month=new URL(request.url).searchParams.get('month')||''
    if(!write)return json(await readSkuDecision(auth.user,id,month,creativeId))
    const raw=await request.text()
    if(Buffer.byteLength(raw)>100000)return json({error:'sku_payload_too_large'},413)
    let body:any
    try{body=JSON.parse(raw)}catch{return json({error:'invalid_json'},400)}
    if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'invalid_sku_decision'},400)
    const {expectedRevision,...input}=body
    if(input.month!==undefined&&input.month!==month)return json({error:'sku_month_mismatch'},400)
    return json(await saveSkuDecision(auth.user,id,creativeId,expectedRevision,{...input,month}))
  }catch(error){
    if(error instanceof CreativeRevisionError)return json({error:error.code},error.status)
    return json({error:'sku_decision_unavailable'},503)
  }
}
export const GET=(request:Request,context:Context)=>handle(request,context)
export const POST=(request:Request,context:Context)=>handle(request,context,true)
