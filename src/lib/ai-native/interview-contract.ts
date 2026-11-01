export type InterviewAnswer={question:string;answer:string}
export type InterviewDraft={answers:InterviewAnswer[]}
const invalid=()=>Object.assign(new Error('invalid_interview_answers'),{code:'invalid_interview_answers',statusCode:422})
export const interviewAnswersSchema={type:'array',minItems:1,maxItems:10,items:{type:'object',properties:{question:{type:'string',minLength:1,maxLength:300},answer:{type:'string',minLength:1,maxLength:4000}},required:['question','answer'],additionalProperties:false}}
export function interviewAnswers(value:unknown):InterviewAnswer[]{
 if(!Array.isArray(value)||!value.length||value.length>10)throw invalid()
 return value.map(v=>{if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['question','answer'].includes(k))||typeof v.question!=='string'||!v.question.trim()||v.question.length>300||typeof v.answer!=='string'||!v.answer.trim()||v.answer.length>4000)throw invalid();return {question:v.question.trim(),answer:v.answer.trim()}})
}
/** Only an unqualified confirmation can approve the preceding persisted proposal. */
export function confirmsInterview(goal:string){
 const text=goal.trim().replace(/[。.!！]+$/,'').trim()
 if(/^(?:对|是的|以上都对|全部确认|yes|confirm|confirm and save|save the confirmed interview)$/i.test(text))return true
 // Accept natural unqualified approval, but never partial approval, edits, questions or negation.
 return /^(?:(?:好的|好|可以)[，,\s]*)?(?:确认(?:并)?保存|确认(?:以上访谈)?(?:并保存)?|确认(?:这份|以上|上述)(?:整理内容|访谈内容|访谈记录)(?:[，,、\s]*(?:并)?保存(?:为访谈记录)?)?|(?:确认[，,\s]*)?按(?:这份|上面(?:的)?|上一条|这版)(?:[\s]*(?:精简版[\s]*)?v\d+(?:\.\d+)*[\s]*)?(?:草案|访谈|整理内容)?(?:确认)?保存|确认保存上一条草案)$/i.test(text)
}
/** Recover ONLY the complete, ordered standard body verbatim from a persisted reply.
 * No inference, source lookup, or reconstruction from a user-supplied transcript. */
export function visibleInterviewDraft(content:string):InterviewDraft|undefined{
 if(/品牌访谈标准模板|模板规则/.test(content))return undefined
 const labels=['品牌','定位','经营目标','目标顾客','选择理由与阻碍','竞争与差异','产品与服务','表达要求','待补充']
 const pattern=/^\s*(?:[-*]\s+|\d+[.、]\s*)?(?:#{1,4}\s*)?(?:\*\*)?(品牌|定位|经营目标|目标顾客|选择理由与阻碍|竞争与差异|产品与服务|表达要求|待补充)(?:\*\*)?[：:](?:\*\*)?\s*/gm
 const matches=[...content.matchAll(pattern)]
 if(matches.length!==labels.length||matches.some((m,i)=>m[1]!==labels[i]))return undefined
 const answers=matches.map((m,i)=>{
  let answer=content.slice(m.index!+m[0].length,matches[i+1]?.index??content.length).trim()
  if(i===labels.length-1)answer=answer.split(/\n\s*(?:\*\*)?待确认(?:\*\*)?[：:]/)[0].trim()
  return {question:labels[i],answer}
 })
 try{return {answers:interviewAnswers(answers)}}catch{return undefined}
}
export const INTERVIEW_INSTRUCTIONS='Complete brand interviews inside this conversation. Read amc.interview.read first to reuse saved answers. Ask at most 1-3 material missing questions; do not invent suggested answers when the user asks to answer interview questions. When the user supplies actual interview facts, save them with amc.interview.save in user_answers mode: supply exactly one answer containing the ENTIRE current user message verbatim, including negations and qualifications. Do not extract substrings or paraphrase. Unknowns remain unknown. Do not save questions, instructions, negations of saving, or unrelated conversation. If proposing a summary or answers for confirmation, always include interviewDraft {answers:[{question,answer}]} and show the exact same answers in the visible reply; this is unsaved until confirmed. When the current user explicitly confirms the preceding interviewDraft, read current revision and use confirm_previous mode with no supplied answers; the host loads the real previous task. Do not ask users to repeat a valid confirmation or use a magic phrase. Missing persisted draft is a system issue, not missing user permission. Mixed confirmation plus edits must be discussed as a revised draft, never blanket-confirmed. Only a successful verified save receipt proves a save. After saving reread amc.context for fresh facts and contextDigest. Keep previous answers; state which answers were saved and any remaining gaps. A partial interview is useful and does not require all fields or Growth research. Do not instruct the user to open Brand Planning to complete, confirm or save the interview. Page viewing/editing is optional only on explicit request. Do not emit a brand_story uiAction for routine interview discussion. Do not generate or overwrite strategy as a side effect.'
