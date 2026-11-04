export type InsightReport={id:string;type:'research'|'management';title:string;periodEnd:string|null;completedAt:string|null;content:string;source:string;pdfPath?:string;pdfUrl?:string;reportVersionId?:string;supplementQuestions?:string[];language?:string;templateId?:string;templateRevision?:string;templateHash?:string;growthBrandKey?:string;structuredReport?:Record<string,unknown>;sourceRefs?:Array<{source_id:string;version:string;title?:string}>}
const text=(v:unknown)=>typeof v==='string'?v.trim():''
const date=(v:unknown)=>{const s=text(v);return s&&Number.isFinite(Date.parse(s))?s:null}
/** Only actual saved artifacts qualify; reading failures must be handled by the caller. */
export function insightReport(id:string,type:InsightReport['type'],value:any):InsightReport|null{
 if(!value||typeof value!=='object'||(value.status&&!['completed','COMPLETED','PUBLISHED','CONFIRMED'].includes(value.status)))return null
 const content=text(value.reportMarkdown)||text(value.reportContent)||text(value.content)||text(value.summary)
 const pdfPath=text(value.pdfPath)||text(value.pdfDownloadPath)||text(value.pdfReportPath)
 if(!content&&!pdfPath)return null
 return {structuredReport:value.structuredReport,language:value.language||'zh',templateId:value.templateId,templateRevision:value.templateRevision,templateHash:value.templateHash,growthBrandKey:value.growthBrandKey,sourceRefs:value.sourceRefs,id:text(value.reportVersionId)||id,type,...(Array.isArray(value.supplementQuestions)?{supplementQuestions:value.supplementQuestions.filter((v:unknown)=>typeof v==='string')}:{}),...(pdfPath?{pdfPath}:{}),...(text(value.reportVersionId)?{reportVersionId:text(value.reportVersionId)}:{}),title:text(value.title)||(type==='management'?'Management Report':'品牌摸底报告'),periodEnd:date(value.periodEnd),completedAt:date(value.completedAt)||date(value.generatedAt),content,source:type==='research'?'AMC Growth':'AMC Management Report'}
}
export function latestInsightReport(reports:(InsightReport|null)[],language='zh'){
 return reports.filter((r):r is InsightReport=>!!r).sort((a,b)=>Number(b.language===language)-Number(a.language===language)||(Date.parse(b.completedAt||'')||0)-(Date.parse(a.completedAt||'')||0)||(/^\d+$/.test(a.id)&&/^\d+$/.test(b.id)?(BigInt(a.id)>BigInt(b.id)?-1:BigInt(a.id)<BigInt(b.id)?1:0):a.id.localeCompare(b.id)))[0]||null
}

/** Use the canonical human report, never flatten operational JSON into customer copy. */
export function growthInsightReport(value:any):InsightReport|null{
 const result=value?.result||{},version=String(value?.report_version_id||'')
 if(!/^\d+$/.test(version))return null
 const content=text(value.report_content)||text(value.reportMarkdown)||text(result.report_markdown)||text(result.report_content)
 const rawPdf=text(value.pdf_download_path)||text(value.pdf_download_url)||text(result.pdf_download_path)||text(result.pdf_download_url)||text(result.pdf_report_path)
 // Only Growth's documented PDF artifact paths; never forward credentials to an arbitrary URL.
 const pdfPath=/^\/(?:public\/)?downloads\/brand-intelligence-intake\/(?!.*\.\.)[A-Za-z0-9_./-]+\.pdf$/.test(rawPdf)?rawPdf:''
 const management=/management|monthly/i.test(String(value.tier||result.report_type||value.report_type||''))
 return insightReport(version,management?'management':'research',{reportVersionId:version,structuredReport:result.structured_report,language:value.language||result.preferred_language||'zh',templateId:result.template_id,templateRevision:result.template_revision,templateHash:result.template_hash,growthBrandKey:value.brand_key,sourceRefs:result.generation_metadata?.cited_sources||[],title:text(value.title)||(management?'Management Report':'品牌摸底报告'),content,pdfPath,supplementQuestions:value.missing_questions||result.missing_questions||result.missingQuestions,generatedAt:value.created_at,periodEnd:value.period_end||result.period_end})
}
