import type {InsightReport} from './insight-report'
export type ChatFile={id:string;title:string;format:'pdf'|'markdown';url:string;kind:'insight'|'planning'}
export function insightDownloads(brandId:string,report:InsightReport|null):ChatFile[]{
 if(!report?.id)return []
 const base=`/api/brands/${encodeURIComponent(brandId)}/insight`,version=encodeURIComponent(report.id)
 return [...(report.pdfPath?[{id:`insight-${report.id}-pdf`,title:report.title,format:'pdf' as const,url:`${base}/pdf?version=${version}&download=1`,kind:'insight' as const}]:[]),...(report.content?.trim()?[{id:`insight-${report.id}-markdown`,title:report.title,format:'markdown' as const,url:`${base}/document?version=${version}`,kind:'insight' as const}]:[])]
}
export function markdownDownload(content:string,name:string){
 return new Response(content,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="${name.replace(/[^a-zA-Z0-9_-]/g,'_')}.md"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}
export function insightDocument(report:InsightReport|null,version:string|null){
 if(!report||version!==report.id)return Response.json({error:'report_version_changed'},{status:409})
 if(!report.content?.trim())return Response.json({error:'report_document_missing'},{status:404})
 return markdownDownload(report.content,`brand-insight-${report.id}`)
}
