/** Narrow optimization for reading existing records; never classify an edit as a lookup. */
export function savedInterviewQuery(intent:{kind?:string;goal?:string;planningScope?:{mode:string}}){
 const goal=intent.goal||''
 return intent.kind==='conversation'&&intent.planningScope?.mode!=='draft'
  && /访谈|訪談|interview/i.test(goal)
  && /现在|目前|已有|已保存|查看|有什么|哪些|内容|內容|怎么样|怎麼樣|进度|進度|状态|狀態|完成了吗|完成了嗎|status|progress|finished|current|saved|existing|show|what|summari[sz]e/i.test(goal)
  && !/生成|修改|更新|优化|優化|重新|新增|补充|補充|写入|保存|制定|策略|计划|方案|generate|create|update|edit|revise|strategy|plan/i.test(goal.replace(/已保存/g,''))
}
export const SAVED_INTERVIEW_INSTRUCTIONS='This turn asks to read existing interview records. Summarize the saved merchantInterview and coCreation.interview / positioningInputs separately, with source and available update dates. A missing raw interview is not proof that saved positioning or supplements are empty; unconfirmed is not missing. Do not infer absence from confirmation flags or hashes. Read errors are unavailable, not empty. Do not generate a strategy or fetch Growth for this lookup. Answer in the user language, with no internal field names or hashes. Include a suggest-mode uiAction for the allowed brand_story page to view the saved material. Do not auto-open it. Only describe actually available sources.'

/** Durable history, not an in-memory counter: at most two repairs after the first rejection. */
export function assertConversationRepairBudget(events:readonly {kind:string;data?:any}[]){
 let failures=0
 for(const event of events){
  if(event.kind==='input'||event.kind==='verification'&&event.data?.verified===true)failures=0
  else if(event.kind==='verification'&&event.data?.verified===false)failures++
 }
 if(failures>=3)throw Object.assign(new Error('Conversation reply verification failed three times; original task retained'),{code:'INVALID_MODEL_ACTION'})
}
