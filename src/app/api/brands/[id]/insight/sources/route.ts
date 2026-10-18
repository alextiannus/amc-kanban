import {NextResponse} from 'next/server'
import {allowedRoleWriteOrigin} from '@/lib/role-permissions/request-origin'
import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {canSessionAccessBrandProject,canSessionWriteBrandProject} from '@/lib/brandAccess'
import {readInsightSources,saveInsightSources} from '@/lib/brand-plan/insight-sources'
export const dynamic='force-dynamic'
export const maxDuration=60
type Context={params:Promise<{id:string}>}
async function handle(request:Request,{params}:Context,write=false){
 if(write&&(!allowedRoleWriteOrigin(request)||request.headers.get('sec-fetch-site')==='cross-site'))return NextResponse.json({error:'Forbidden'},{status:403})
 const auth=await resolveSessionOrApiKey(request);if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {id}=await params,canEdit=await canSessionWriteBrandProject(id,auth.user.id,auth.user.type)
 if(!(write?canEdit:await canSessionAccessBrandProject(id,auth.user.id,auth.user.type,auth.user.role)))return NextResponse.json({error:'Not found'},{status:404})
 try{let body:any={};if(write){const raw=await request.text();if(Buffer.byteLength(raw)>1000000)return NextResponse.json({error:'payload_too_large'},{status:413});try{body=JSON.parse(raw)}catch{return NextResponse.json({error:'invalid_json'},{status:400})}}
 const data=write?await saveInsightSources(id,auth.user.id,body):await readInsightSources(id,new URL(request.url).searchParams.get('reportVersion')||undefined)
 return NextResponse.json({...data,canEdit},{headers:{'Cache-Control':'no-store'}})
 }catch(e){const error=e as any;return NextResponse.json({error:error.code||error.message||'sources_unavailable'},{status:[400,404,409,413,422].includes(error.status||error.statusCode)?error.status||error.statusCode:503,headers:{'Cache-Control':'no-store'}})}
}
export const GET=(r:Request,c:Context)=>handle(r,c)
export const PUT=(r:Request,c:Context)=>handle(r,c,true)
