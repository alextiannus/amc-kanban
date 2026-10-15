import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { allowedRoleWriteOrigin } from '@/lib/role-permissions/request-origin'
import { CreativeRevisionError } from '@/lib/brand-plan/creativeRevisionContract'
import { scheduleCreative, unscheduleCreative } from '@/lib/brand-plan/creativeScheduling'

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
    const month = new URL(request.url).searchParams.get('month') || ''
    const input = {...body,month}
    const result = remove
      ? await unscheduleCreative(auth.user,id,creativeId,body?.expectedRevision,input)
      : await scheduleCreative(auth.user,id,creativeId,body?.expectedRevision,input)
    return json(result)
  } catch(error) {
    if (error instanceof CreativeRevisionError) return json({error:error.code},error.status)
    console.error('[creative-schedule] request failed',error instanceof Error?error.name:'unknown')
    return json({error:'creative_schedule_unavailable'},503)
  }
}
export const POST = (request:Request,context:Context) => handle(request,context,false)
export const DELETE = (request:Request,context:Context) => handle(request,context,true)
