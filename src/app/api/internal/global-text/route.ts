import { NextResponse } from 'next/server'
import { currentBinding, jobBinding, signBinding, verifyBinding, executeBound, connectionFor, PROTOCOL_VERSION } from '@/lib/global-text/policy'
export const maxDuration=120
export const dynamic='force-dynamic'
function authorized(request:Request){const token=process.env.CONTENT_SERVICE_INTERNAL_TOKEN;return Boolean(token&&request.headers.get('x-content-service-token')===token)}
export async function GET(request:Request){
  if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401})
  try {
    const params=new URL(request.url).searchParams
    const source=params.get('source')||'content'
    if(!['kanban','content','mm'].includes(source))throw new Error('Invalid source')
    const incoming=request.headers.get('x-amc-text-binding')
    const b=incoming?{...verifyBinding(incoming),source}:params.get('jobId')?await jobBinding(source,params.get('jobId')!):await currentBinding(source)
    const c=b.enabled?await connectionFor(b):null
    return NextResponse.json({protocolVersion:PROTOCOL_VERSION,binding:signBinding(b),enabled:b.enabled,version:b.version,connectionId:b.connectionId,target:c?{displayName:c.displayName,provider:c.provider,modelName:c.modelName}:null},{headers:{'Cache-Control':'no-store'}})
  }catch{return NextResponse.json({error:'Global text policy unavailable'},{status:503})}
}
export async function POST(request:Request){
  if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401})
  try {
    const body=await request.json();const binding=verifyBinding(String(body.binding||''))
    if(!binding.enabled)return NextResponse.json({error:'Bound policy is disabled'},{status:409})
    const result=await executeBound(binding,{messages:body.messages,maxTokens:body.maxTokens,temperature:body.temperature,tools:body.tools,toolChoice:body.toolChoice,task:body.task,timeoutMs:body.timeoutMs,signal:request.signal})
    return NextResponse.json({...result,protocolVersion:PROTOCOL_VERSION})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Global text call failed'},{status:502})}
}
