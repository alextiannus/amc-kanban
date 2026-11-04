import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {canSessionAccessBrandProject} from '@/lib/brandAccess'
import {readAvailableInsight} from '@/lib/brand-plan/insight-service'
import {GET as pdf} from '../insight/pdf/route'
import {markdownDownload} from '@/lib/brand-plan/report-download'
export const dynamic='force-dynamic'
export const maxDuration=90
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const auth=await resolveSessionOrApiKey(request)
 if(!auth)return Response.json({error:'Unauthorized'},{status:401})
 const {id}=await context.params
 if(!await canSessionAccessBrandProject(id,auth.user.id,auth.user.type,auth.user.role))return Response.json({error:'Not found'},{status:404})
 try{
  const u=new URL(request.url),version=u.searchParams.get('version')||undefined
  const {report}=await readAvailableInsight(id,{version,language:u.searchParams.get('language')||'zh'})
  if(!report)return Response.json({error:'report_not_found'},{status:404})
  if(u.searchParams.get('format')==='pdf'){
   u.searchParams.set('version',report.id);return pdf(new Request(u,request),context)
  }
  if(u.searchParams.get('format')==='json')return report.structuredReport?new Response(JSON.stringify(report.structuredReport),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename=merchant-report-'+report.id+'.json','Cache-Control':'private, no-store'}}):Response.json({error:'Structured report not available'},{status:404})
  return markdownDownload(report.content,'merchant-report-'+report.id)
 }catch{return Response.json({error:'report_read_failed'},{status:502})}
}
