import {NextResponse} from 'next/server'
import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {canSessionAccessBrandProject} from '@/lib/brandAccess'
import {readProfileOverview} from '@/lib/profile-overview'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const started=performance.now(),auth=await resolveSessionOrApiKey(request)
 if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {id}=await params
 if(!await canSessionAccessBrandProject(id,auth.user.id,auth.user.type,auth.user.role))return NextResponse.json({error:'Not found'},{status:404})
 const readStarted=performance.now(),overview=await readProfileOverview(id)
 return NextResponse.json(overview||{error:'Not found'},{status:overview?200:404,headers:{'Cache-Control':'private, no-store','Server-Timing':`auth;dur=${(readStarted-started).toFixed(1)}, saved_read;dur=${(performance.now()-readStarted).toFixed(1)}`}})
}
