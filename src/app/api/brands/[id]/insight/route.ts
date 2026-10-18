import {allowedRoleWriteOrigin} from '@/lib/role-permissions/request-origin'
import {NextResponse} from 'next/server'
import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {canSessionAccessBrandProject,canSessionWriteBrandProject} from '@/lib/brandAccess'
import {readAvailableInsight,requestInsight,reconcileInsight} from '@/lib/brand-plan/insight-service'
export const dynamic='force-dynamic'
export const maxDuration=60
type Context={params:Promise<{id:string}>}
async function handle(request:Request,context:Context,write:boolean){
 if(write&&(!allowedRoleWriteOrigin(request)||request.headers.get('sec-fetch-site')==='cross-site'))return NextResponse.json({error:'Forbidden'},{status:403})
 const auth=await resolveSessionOrApiKey(request)
 if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {id}=await context.params
 const canWrite=await canSessionWriteBrandProject(id,auth.user.id,auth.user.type)
 if(!(write?canWrite:await canSessionAccessBrandProject(id,auth.user.id,auth.user.type,auth.user.role)))return NextResponse.json({error:'Not found'},{status:404})
 try{
  if(write){let input:any={};try{input=await request.json()}catch{return NextResponse.json({error:'invalid_json'},{status:400})}
   await requestInsight(id,auth.user.id,undefined,{refresh:input.refresh===true,previousRequestId:input.previousRequestId??null,sourceRevision:input.sourceRevision})}
  // Polling only reads provider state and materializes completed artifacts; never starts a report.
  let refreshUnavailable=false
  if(canWrite)try{await reconcileInsight(id)}catch{refreshUnavailable=true}
  const latest=await readAvailableInsight(id)
  return NextResponse.json({...latest,refreshUnavailable:refreshUnavailable||latest.liveStatus==='unavailable'},{headers:{'Cache-Control':'no-store'}})
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:(e as any).statusCode||503})}
}
export const GET=(r:Request,c:Context)=>handle(r,c,false)
export const POST=(r:Request,c:Context)=>handle(r,c,true)
