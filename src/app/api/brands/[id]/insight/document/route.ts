import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {canSessionAccessBrandProject} from '@/lib/brandAccess'
import {readAvailableInsight} from '@/lib/brand-plan/insight-service'
import {insightDocument} from '@/lib/brand-plan/report-download'
export const dynamic='force-dynamic'
export const maxDuration=90
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await resolveSessionOrApiKey(request)
 if(!auth)return Response.json({error:'Unauthorized'},{status:401})
 const {id}=await params
 if(!await canSessionAccessBrandProject(id,auth.user.id,auth.user.type,auth.user.role))return Response.json({error:'Not found'},{status:404})
 try{return insightDocument((await readAvailableInsight(id)).report,new URL(request.url).searchParams.get('version'))}
 catch{return Response.json({error:'report_read_failed'},{status:502})}
}
