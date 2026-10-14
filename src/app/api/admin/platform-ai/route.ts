import {authenticateCurrentRequest,isAdmin} from '@/lib/auth-v2'
import {allowedRoleWriteOrigin} from '@/lib/role-permissions/request-origin'
import {reportPool} from '@/lib/platform-ai/bug-reports'
import {engineeringConfig} from '@/lib/platform-ai/engineering-store'
import {getPlatformTeam} from '@/lib/platform-ai/worker'
import {PLATFORM_ACTOR} from '@/lib/platform-ai/engineering-capabilities'
import {prisma} from '@/lib/prisma'
import {nativeJson} from '@/lib/ai-native/http'
export const dynamic='force-dynamic'
export async function GET(){
  const actor=await authenticateCurrentRequest()
  if(!actor||!isAdmin(actor))return nativeJson({error:'Forbidden'},403)
  const pool=await reportPool(),config=await engineeringConfig(pool)
  return nativeJson({configured:!!config,enabled:!!config?.enabled,reports:(await pool.query('SELECT id,status,task_id,created_at,result FROM public.amc_bug_reports ORDER BY created_at DESC LIMIT 50')).rows})
}
export async function POST(request:Request){
  const actor=await authenticateCurrentRequest()
  if(!actor||!isAdmin(actor)||!allowedRoleWriteOrigin(request)||request.headers.get('sec-fetch-site')==='cross-site')return nativeJson({error:'Forbidden'},403)
  try{
    const raw=await request.text();if(raw.length>10000)return nativeJson({error:'payload_too_large'},413)
    const body=JSON.parse(raw)
    if(!/^[0-9a-f-]{36}$/.test(body.reportId)||!['resume','cancel','provide_input'].includes(body.action)||! /^[a-zA-Z0-9_-]{8,100}$/.test(body.requestKey))return nativeJson({error:'invalid_control'},400)
    const pool=await reportPool(),row=(await pool.query('SELECT task_id FROM public.amc_bug_reports WHERE id=$1',[body.reportId])).rows[0]
    if(!row?.task_id)return nativeJson({error:'task_not_found'},404)
    await prisma.auditLog.create({data:{actorId:actor.userId,actorType:actor.actorType,action:'platform.task.control_requested',resourceType:'PlatformEngineering',resourceId:body.reportId,newValue:{action:body.action,requestKey:body.requestKey}}})
    const team=await getPlatformTeam(),result=await team.dispatcher.invoke(`platform.team.tasks.${body.action}`,{id:row.task_id,...(body.action==='provide_input'?{input:body.input}:{})},{actor:PLATFORM_ACTOR,callId:body.requestKey})
    await pool.query('UPDATE public.amc_bug_reports SET status=$2 WHERE id=$1 AND result IS NULL',[body.reportId,body.action==='cancel'?'cancelled':'queued'])
    return nativeJson({accepted:true,result})
  }catch{return nativeJson({error:'platform_control_unavailable'},503)}
}
