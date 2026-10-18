import {NextResponse} from 'next/server'
import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {canSessionAccessBrandProject} from '@/lib/brandAccess'
import {readAvailableInsight} from '@/lib/brand-plan/insight-service'
import {readGrowthReportArtifact} from '@/lib/growthDataCenter'
export const dynamic='force-dynamic'
export const maxDuration=90
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await resolveSessionOrApiKey(request)
 if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {id}=await params
 if(!await canSessionAccessBrandProject(id,auth.user.id,auth.user.type,auth.user.role))return NextResponse.json({error:'Not found'},{status:404})
 try{
  const {report}=await readAvailableInsight(id),query=new URL(request.url).searchParams
  if(!report||query.get('version')!==report.id)return NextResponse.json({error:'report_version_changed'},{status:409})
  if(!report.pdfPath)return NextResponse.json({error:'report_pdf_missing'},{status:404})
  const artifact=await readGrowthReportArtifact(report.pdfPath)
  const bytes=new Uint8Array(artifact.body)
  if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')return NextResponse.json({error:'report_pdf_invalid'},{status:502})
  return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`${query.get('download')==='1'?'attachment':'inline'}; filename="brand-insight-${report.id.replace(/[^a-zA-Z0-9_-]/g,'')}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
 }catch{return NextResponse.json({error:'report_pdf_read_failed'},{status:502})}
}
