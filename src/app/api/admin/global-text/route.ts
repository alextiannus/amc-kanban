import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { applyPolicy, policyOverview } from '@/lib/global-text/policy'
import { validateGlobalConnection } from '@/lib/global-text/validation'
export const maxDuration=300
export const dynamic='force-dynamic'
async function admin(){const s=await getSession();return s?.user?.role==='ADMIN'?s.user:null}
export async function GET(){
  if(!await admin())return NextResponse.json({error:'Forbidden'},{status:403})
  try{return NextResponse.json(await policyOverview(),{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Global text policy unavailable; verify migration and database connectivity'},{status:503})}
}
export async function POST(request:Request){
  const actor=await admin();if(!actor)return NextResponse.json({error:'Forbidden'},{status:403})
  try{
    const body=await request.json()
    if(body.action==='test'||body.action==='preflight')return NextResponse.json(await validateGlobalConnection(String(body.connectionId||''),body.action==='preflight'))
    if(body.action!=='apply'||!Number.isInteger(body.expectedVersion)||typeof body.enabled!=='boolean')return NextResponse.json({error:'Invalid policy operation'},{status:400})
    return NextResponse.json(await applyPolicy({expectedVersion:body.expectedVersion,enabled:body.enabled,connectionId:body.connectionId||null,validationId:body.validationId},String(actor.id)))
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Policy operation failed'},{status:409})}
}
