import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { allowedRoleWriteOrigin } from '@/lib/role-permissions/request-origin'
import { CreativeRevisionError } from '@/lib/brand-plan/creativeRevisionContract'
import { scheduleCreative, unscheduleCreative, readCreativeScheduleAccounts } from '@/lib/brand-plan/creativeScheduling'

export const dynamic = 'force-dynamic'
type Context = {params:Promise<{id:string;creativeId:string}>}
const json = (value:unknown,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}})

async function handle(request:Request,context:Context,remove:boolean) {
  try {
    const auth = await resolveSessionOrApiKey(request)
    if (!auth) return json({error:'Unauthorized'},401)
    if (!allowedRoleWriteOrigin(request)) return json({error:'Forbidden'},403)
    const {id,creativeId} = await context.params
    const raw = await request.text()
    if (raw.length > 10000) return json({error:'schedule_payload_too_large'},413)
    let body: any
    try {body=JSON.parse(raw)} catch {return json({error:'invalid_json'},400)}
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({error:'invalid_schedule_input'},400)
    const allowed = remove
      ? new Set(['expectedRevision','idempotencyKey'])
      : new Set(['expectedRevision','idempotencyKey','platform','scheduledAt','accountId'])
    if (Object.keys(body).some(key => !allowed.has(key))) return json({error:'invalid_schedule_input'},400)
    const month = new URL(request.url).searchParams.get('month') || ''
    const {expectedRevision} = body
    const result = remove
      ? await unscheduleCreative(auth.user,id,creativeId,expectedRevision,{month,idempotencyKey:body.idempotencyKey})
      : await scheduleCreative(auth.user,id,creativeId,expectedRevision,{month,idempotencyKey:body.idempotencyKey,platform:body.platform,scheduledAt:body.scheduledAt,...(body.accountId !== undefined?{accountId:body.accountId}:{})})
    return json(result)
  } catch(error) {
    if (error instanceof CreativeRevisionError) return json({error:error.code},error.status)
    console.error('[creative-schedule] request failed',error instanceof Error?error.name:'unknown')
    return json({error:'creative_schedule_unavailable'},503)
  }
}
export const POST = (request:Request,context:Context) => handle(request,context,false)
export const DELETE = (request:Request,context:Context) => handle(request,context,true)
export async function GET(request:Request,context:Context){
 try{
  const auth=await resolveSessionOrApiKey(request)
  if(!auth)return json({error:'Unauthorized'},401)
  const {id,creativeId}=await context.params
  return json(await readCreativeScheduleAccounts(auth.user,id,new URL(request.url).searchParams.get('month')||'',creativeId))
 }catch(error){return error instanceof CreativeRevisionError?json({error:error.code},error.status):json({error:'creative_schedule_unavailable'},503)}
}
