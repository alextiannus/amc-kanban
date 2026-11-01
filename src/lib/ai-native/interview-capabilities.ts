import {defineCapability} from '@immedi/iaic-core/capabilities/index.js'
import {brandFor,nativeError,type NativeActor,type NativeIntent} from './contract'
import {interviewAnswers,interviewAnswersSchema,confirmsInterview} from './interview-contract'
import {readConversationInterview,saveConversationInterview} from './interview-store'
export function interviewCapabilities(getIntent:(actor:NativeActor,id?:string)=>Promise<NativeIntent>,getApp:()=>any,authorize:(actor:NativeActor)=>Promise<boolean>,adapters:{readPrevious?:(userId:string,brandId:string,taskId:string)=>Promise<any>}={}){
 const check=async(actor:NativeActor,id?:string)=>{const intent=await getIntent(actor,id);if(intent.kind!=='conversation'||!id||intent.brandId!==brandFor(actor))throw nativeError('conversation_task_required',403);return intent}
 const prepare=async(input:any,actor:NativeActor,taskId?:string)=>{
  const intent=await check(actor,taskId)
  if(!await authorize(actor))throw nativeError('ai_access_denied',403)
  const history=await getApp().tasks.history(actor,taskId)
  const skill=intent.topic==='brand_planning'?'amc-marketing-expert/SKILL.md':'amc-conversation/SKILL.md'
  if(!history.calls.some((c:any)=>c.capability==='assistant.skills.read'&&c.status==='succeeded'&&c.input?.id===skill))throw nativeError('interview_skill_required',422)
  if(!history.calls.some((c:any)=>c.capability==='amc.interview.read'&&c.status==='succeeded'&&c.result?.revision===input.expectedRevision))throw nativeError('read_interview_revision_first',422)
  if(input.mode==='confirm_previous'){
   if(!intent.afterTaskId||!confirmsInterview(intent.goal)||input.answers!==undefined)throw nativeError('explicit_interview_confirmation_required',422)
   const readPrevious=adapters.readPrevious||(await import('./service')).readNativeTask
   const previous=await readPrevious(actor.subjectId,intent.brandId,intent.afterTaskId)
   if(previous.status!=='succeeded'||!previous.report?.interviewDraft)throw nativeError('previous_interview_draft_required',422)
   return {intent,answers:interviewAnswers(previous.report.interviewDraft.answers),sourceTaskId:intent.afterTaskId}
  }
  const answers=interviewAnswers(input.answers)
  if(/不要保存|先不保存|不用保存|只讨论|do not save|don.t save|without saving/i.test(intent.goal))throw nativeError('interview_save_not_requested',422)
  if(answers.length!==1||answers[0].answer!==intent.goal.trim())throw nativeError('copy_entire_current_user_message',422)
  return {intent,answers}
 }
 return [defineCapability({name:'amc.interview.read',description:'Read saved merchant interview answers and current revision before asking or saving. No Growth report required; other positioning/profile sources remain distinct.',effect:'read',authorize,input:{type:'object',properties:{},additionalProperties:false},output:{type:'object'},implementation:{kind:'function',execute:async(_,{actor,taskId})=>{await check(actor as NativeActor,taskId);return readConversationInterview(brandFor(actor as NativeActor))}},revalidate:async(_,_prior,{actor,taskId})=>{await check(actor as NativeActor,taskId);return readConversationInterview(brandFor(actor as NativeActor))}}),
 defineCapability({name:'amc.interview.save',description:'Save merchant interview answers inside chat. user_answers only saves one verbatim copy of the ENTIRE CURRENT user message, preserving every qualification and negation, never questions, requests or AI guesses. confirm_previous saves ONLY the preceding persisted interviewDraft after an unqualified explicit user confirmation; omit answers. Read amc.interview.read and required Skill first. Returns verified receipt or conflict. Does not modify strategy or publish.',effect:'write',retry:'idempotent',authorize,input:{type:'object',properties:{mode:{type:'string',enum:['user_answers','confirm_previous']},expectedRevision:{type:'string',pattern:'^[a-f0-9]{64}$'},answers:interviewAnswersSchema},required:['mode','expectedRevision'],additionalProperties:false},output:{type:'object'},preflight:async(input,{actor,taskId})=>{try{await prepare(input,actor as NativeActor,taskId);return {valid:true}}catch(e){return {valid:false,feedback:e instanceof Error?e.message:'interview_input_invalid'}}},implementation:{kind:'function',execute:async(input:any,{actor,taskId})=>{
  const data=await prepare(input,actor as NativeActor,taskId)
  try{return await saveConversationInterview({brandId:brandFor(actor as NativeActor),userId:(actor as NativeActor).subjectId,taskId:taskId!,sourceTaskId:data.sourceTaskId,expectedRevision:input.expectedRevision,answers:data.answers})}catch(e){if((e as any).statusCode===409)return {state:'conflict',verified:false,code:(e as any).code,instructions:'Not saved. Read the current interview and discuss the conflict; do not overwrite or claim completion.'};throw e}
 }}})]
}
export function interviewReceipt(calls:readonly any[]){return calls.findLast(c=>c.capability==='amc.interview.save'&&c.status==='succeeded')?.result||null}
