import type {InsightReport} from './insight-report'

export function reportSourceHref(report:InsightReport,brandId:string,value:string){
 try{
  const u=new URL(value,'https://amc-growth.immedi.ai')
  if(!/^\/dashboard\/jobs\/[a-f0-9-]{36}$/.test(u.pathname))return value
  const source=u.searchParams.get('source'),version=u.searchParams.get('version')
  if(!report.sourceRefs?.some(ref=>ref.source_id===source&&ref.version===version))return value
  return `/api/brands/${encodeURIComponent(brandId)}/insight/source?report_version_id=${report.id}&source=${source}&version=${version}`
 }catch{return value}
}
export function presentInsight(report:InsightReport,brandId:string){
 return {...report,content:report.content.replace(/(?:https?:\/\/[^\s<>)]*)?\/dashboard\/jobs\/[^\s<>)]*/g,value=>reportSourceHref(report,brandId,value)),
  ...(report.pdfPath?{pdfUrl:`/api/brands/${encodeURIComponent(brandId)}/insight/pdf?version=${encodeURIComponent(report.id)}`}:{})}
}

// Change only link destinations in a response copy; saved PDF bytes stay immutable.
export async function presentReportPdf(bytes:Uint8Array,report:InsightReport,brandId:string,origin:string){
 if(!report.sourceRefs?.length)return bytes
 const {PDFDocument,PDFName,PDFDict,PDFArray,PDFString,PDFHexString}=await import('pdf-lib')
 const pdf=await PDFDocument.load(bytes)
 for(const page of pdf.getPages()){
  const annotations=page.node.lookup(PDFName.of('Annots'))
  if(!(annotations instanceof PDFArray))continue
  for(let i=0;i<annotations.size();i++){
   const annotation=annotations.lookup(i)
   if(!(annotation instanceof PDFDict))continue
   const action=annotation.lookup(PDFName.of('A'))
   if(!(action instanceof PDFDict))continue
   const uri=action.lookup(PDFName.of('URI'))
   if(!(uri instanceof PDFString||uri instanceof PDFHexString))continue
   const old=uri.decodeText(),next=reportSourceHref(report,brandId,old)
   if(next!==old)action.set(PDFName.of('URI'),PDFString.of(new URL(next,origin).href))
  }
 }
 return pdf.save()
}

export function sourcePage(source:{title?:string;content?:string;url?:string}){
 const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
 return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(source.title)}</title><style>body{max-width:900px;margin:2rem auto;padding:1rem;font:16px/1.7 sans-serif}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>${escape(source.title)}</h1><pre>${escape(source.content)}</pre></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",'X-Content-Type-Options':'nosniff'}})
}
