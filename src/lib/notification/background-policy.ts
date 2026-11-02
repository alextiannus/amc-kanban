/** Only final, user-actionable outcomes. Provider progress/retries never become alerts. */
export type Outcome='completed'|'failed'|'attention'|'silent'|null
export function backgroundOutcome(kind:string,value:any):Outcome{
 if(!value)return 'silent'
 const status=String(value.status||'').toLowerCase()
 if(['cancelled','canceled','deleted'].includes(status))return 'silent'
 if(kind==='video'){
  if(value.historyDeletedAt)return 'silent'
  if(['completed','complete'].includes(status))return value.finalVideoUrl?'completed':null
  return ['failed','error'].includes(status)?'failed':null
 }
 if(kind==='insight')return status==='completed'?(value.reportReady?'completed':null):status==='failed'?'failed':status==='review_required'?'attention':null
 if(kind==='publish'){
  if(value.draftStatus==='published'&&value.postId)return 'completed'
  return status==='failed'||value.draftStatus==='failed'?'failed':null
 }
 if(kind==='ai'){
  if(status==='succeeded')return value.durationMs<15000?'silent':value.resultReady?'completed':null
  if(status==='failed')return 'failed'
  return status==='waiting'&&value.waitingReason==='input'?'attention':null
 }
 return null
}
export function backgroundMessage(kind:string,outcome:Exclude<Outcome,null|'silent'>){
 const label=({video:'视频制作',insight:'AI Insight 调研报告',publish:'内容发布',ai:'AI 任务'} as Record<string,string>)[kind]||'后台任务'
 return {title:label+(outcome==='completed'?'已完成':outcome==='failed'?'未完成':'需要你处理'),message:outcome==='completed'?'结果已准备好，点击查看。':outcome==='failed'?'本次任务未完成。点击查看任务并选择下一步。':'任务需要你补充信息或确认，点击继续。'}
}
