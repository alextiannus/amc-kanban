export type InsightReport={id:string;type:'research'|'management';title:string;periodEnd:string|null;completedAt:string|null;content:string;source:string}
const text=(v:unknown)=>typeof v==='string'?v.trim():''
const date=(v:unknown)=>{const s=text(v);return s&&Number.isFinite(Date.parse(s))?s:null}
/** Only actual saved artifacts qualify; reading failures must be handled by the caller. */
export function insightReport(id:string,type:InsightReport['type'],value:any):InsightReport|null{
 if(!value||typeof value!=='object'||(value.status&&!['completed','COMPLETED','PUBLISHED','CONFIRMED'].includes(value.status)))return null
 const content=text(value.reportMarkdown)||text(value.reportContent)||text(value.content)||(value.structuredReport?structuredInsightMarkdown(value.structuredReport):'')||text(value.summary)
 if(!content)return null
 return {id,type,title:text(value.title)||(type==='management'?'Management Report':'品牌摸底报告'),periodEnd:date(value.periodEnd),completedAt:date(value.completedAt)||date(value.generatedAt),content,source:type==='research'?'AMC Growth':'AMC Management Report'}
}
export function latestInsightReport(reports:(InsightReport|null)[]){
 return reports.filter((r):r is InsightReport=>!!r).sort((a,b)=>(Date.parse(b.periodEnd||b.completedAt||'')||0)-(Date.parse(a.periodEnd||a.completedAt||'')||0)||(Date.parse(b.completedAt||'')||0)-(Date.parse(a.completedAt||'')||0)||a.id.localeCompare(b.id))[0]||null
}

/** Render supplied structured sections as a document without inventing an executive summary. */
export function structuredInsightMarkdown(value:unknown,depth=1):string{
 if(value===null||value===undefined)return ''
 if(typeof value!=='object')return String(value)
 if(depth>8)return JSON.stringify(value)
 if(Array.isArray(value))return value.map(item=>typeof item==='object'?structuredInsightMarkdown(item,depth+1):`- ${String(item)}`).filter(Boolean).join('\n\n')
 return Object.entries(value as Record<string,unknown>).map(([key,item])=>`${'#'.repeat(Math.min(depth+1,6))} ${key.replaceAll('_',' ')}\n\n${structuredInsightMarkdown(item,depth+1)}`).join('\n\n')
}
