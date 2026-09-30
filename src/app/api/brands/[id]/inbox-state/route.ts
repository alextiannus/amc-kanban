import {NextResponse} from 'next/server'
import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {inboxState} from '@/lib/notification/inbox'
export const dynamic='force-dynamic'
async function handle(request:Request,{params}:{params:Promise<{id:string}>}){
 const headers={'Cache-Control':'no-store'}
 try{
  const context=await resolveSessionOrApiKey(request)
  if(!context?.user)return NextResponse.json({error:'Unauthorized'},{status:401,headers})
  if(request.method==='POST'&&request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Forbidden'},{status:403,headers})
  let body;try{body=request.method==='POST'?await request.json():undefined}catch{return NextResponse.json({error:'Invalid body'},{status:400,headers})}
  if(request.method==='POST'&&(!body||typeof body!=='object'))return NextResponse.json({error:'Invalid body'},{status:400,headers})
  const {id}=await params
  return NextResponse.json(await inboxState(context.user.id,id,body),{headers})
 }catch(e:any){return NextResponse.json({error:e.status?e.message:'Inbox unavailable'},{status:e.status||500,headers})}
}
export const GET=handle
export const POST=handle
