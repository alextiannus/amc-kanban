import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {canSessionAccessBrandProject} from '@/lib/brandAccess'
import {readAvailableInsight} from '@/lib/brand-plan/insight-service'
import {renderResearchMarkdownPage} from '@/lib/researchMarkdownPage'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await resolveSessionOrApiKey(request)
 if(!auth)return Response.json({error:'Unauthorized'},{status:401})
 const {id}=await params
 if(!await canSessionAccessBrandProject(id,auth.user.id,auth.user.type,auth.user.role))return Response.json({error:'Not found'},{status:404})
 try{
  const q=new URL(request.url).searchParams,value=await readAvailableInsight(id,{version:q.get('version')||undefined,language:q.get('language')||'zh'}),report=value.report
  if(!report)return Response.json({error:'report_not_found'},{status:404})
  const markdown=(value.liveStatus==='unavailable'?'> Latest status unavailable. Showing the saved report.\n\n':'')+report.content
  return new Response(renderResearchMarkdownPage({brandName:report.title,markdown,hasPdf:!!report.pdfPath,downloadBase:'/api/brands/'+encodeURIComponent(id)+'/research-report?version='+encodeURIComponent(report.id)}),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'}})
 }catch{return Response.json({error:'report_read_failed'},{status:502})}
}
