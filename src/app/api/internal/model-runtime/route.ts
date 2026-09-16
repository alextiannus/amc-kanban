import { NextResponse } from 'next/server'
import { runtimeConfig } from '@/lib/model-management/registry'
import { recordExecution } from '@/lib/model-management/runtime'
import { verifyBinding } from '@/lib/global-text/policy'
export const dynamic='force-dynamic'
function authorized(request:Request){const token=process.env.CONTENT_SERVICE_INTERNAL_TOKEN;return !!token&&request.headers.get('x-content-service-token')===token}
export async function GET(request:Request){
  if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401})
  try {
    const params=new URL(request.url).searchParams,source=params.get('source')||'content'
    if(!['content','mm','kanban'].includes(source))throw new Error('Invalid source')
    const binding=request.headers.get('x-amc-text-binding')
    const version=binding?verifyBinding(binding).modelRevision:params.has('version')?Number(params.get('version')):undefined
    const delegated=params.get('delegatedSource')
    const bindingSource=binding?verifyBinding(binding).source:undefined
    if(delegated&&(!binding||bindingSource!==delegated||delegated!=='kanban'))throw new Error('Invalid delegated source')
    const config=await runtimeConfig({version,source,jobId:params.get('jobId')||undefined,secrets:true})
    return NextResponse.json({...config,...(delegated?{bindingSource}:{})},{headers:{'Cache-Control':'no-store'}})
  } catch {return NextResponse.json({error:'Central model configuration unavailable'},{status:503})}
}
export async function POST(request:Request){
  if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401})
  try{await recordExecution(await request.json());return NextResponse.json({ok:true})}catch{return NextResponse.json({error:'Invalid execution record'},{status:400})}
}
