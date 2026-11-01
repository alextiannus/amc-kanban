import {insightDownloads,type ChatFile} from '../brand-plan/report-download'
import {marketingPlanMarkdown} from './planning-workspace-contract'
/** URLs come from authorized source artifacts, never model-provided download metadata. */
export function conversationFiles(brandId:string,taskId:string,goal:string,report:any,source:any):ChatFile[]{
 const files=/报告|调研|research|report|insight/i.test(goal)||report?.content?.includes(`/api/brands/${encodeURIComponent(brandId)}/insight/`)||report?.planningDraft?.scope?.stage==='insight'?insightDownloads(brandId,source?.report||null):[]
 if(report?.planningDraft?.content?.trim())files.push({id:`planning-${taskId}`,title:report.planningDraft.title,kind:'planning',format:'markdown',url:`/api/brands/${encodeURIComponent(brandId)}/ai/tasks/${encodeURIComponent(taskId)}/document`})
 return files
}
export function planningDocument(report:any){
 const draft=report?.planningDraft
 if(!draft||typeof draft.content!=='string'||!draft.content.trim())return null
 if(draft.scope?.stage==='execution_checklist'&&Array.isArray(draft.data?.items)){
  const items=draft.data.items.map((item:any)=>`- ${item.month} · ${item.action}\n  ${item.plannedTime}`).join('\n\n')
  const gaps=Array.isArray(draft.data.informationToSupplement)&&draft.data.informationToSupplement.length?'\n\n## 待补充\n\n'+draft.data.informationToSupplement.map((item:string)=>'- '+item).join('\n'):''
  return {title:draft.title,content:`# ${draft.title}\n\n${draft.content}\n\n${items}${gaps}`}
 }
 return {title:draft.title,content:draft.scope?.stage==='marketing_plan'&&draft.data?marketingPlanMarkdown(draft.data,!/[\u4e00-\u9fff]/.test(draft.title+draft.content)):draft.content}
}
