import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {canSessionAccessBrandProject} from '@/lib/brandAccess'
import {readAvailableInsight} from '@/lib/brand-plan/insight-service'
import {readGrowthReportSource} from '@/lib/growthDataCenter'
import {sourcePage} from '@/lib/brand-plan/report-presentation'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await resolveSessionOrApiKey(request)
 if(!auth)return Response.json({error:'Unauthorized'},{status:401})
 const {id}=await params
 if(!await canSessionAccessBrandProject(id,auth.user.id,auth.user.type,auth.user.role))return Response.json({error:'Not found'},{status:404})
 const q=new URL(request.url).searchParams,reportId=q.get('report_version_id')||'',source=q.get('source')||'',version=q.get('version')||''
 try{
  if(!/^\d+$/.test(reportId))return Response.json({error:'report_source_not_found'},{status:404})
  const {report}=await readAvailableInsight(id,{version:reportId})
  if(!report||!report.sourceRefs?.some(ref=>ref.source_id===source&&ref.version===version))return Response.json({error:'report_source_not_found'},{status:404})
  return sourcePage(await readGrowthReportSource(reportId,source,version))
 }catch{return Response.json({error:'report_source_unavailable'},{status:502})}
}
