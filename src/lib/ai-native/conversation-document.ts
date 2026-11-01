import type {ConversationIntent} from './contract'

export const CONVERSATION_DOCUMENT_INSTRUCTIONS='For this ordinary conversation, deliver your final user-visible reply directly as plain Markdown text so it can stream immediately. Do not wrap ordinary prose in JSON or call the workspace writer just to deliver prose; the host binds brand, path and source digest and submits the exact text to the existing verifier. Use the available business/read tools whenever needed BEFORE your final answer. Only verified tool receipts justify claims that a business action was saved or executed. Continue following the required Skill and user instructions. Use the workspace writer only when the reply needs structured metadata such as uiAction or a nonstandard interviewDraft. A standard nine-field interview draft can be plain Markdown and remains unsaved until the user confirms. Do not output a separate progress preamble; deliver the substantive answer.'
export function conversationDocumentBinding(request:any,intent:ConversationIntent|undefined){
 if(intent?.kind!=='conversation'||intent.planningScope?.mode==='draft'||request.billingContext?.capability!=='agent.work')return null
 if(!request.tools?.some((t:any)=>t.name==='my_write_workspace'||t.parameters?.properties?.path&&t.parameters?.properties?.content&&t.parameters?.properties?.expectedRevision))return null
 let data:any;try{data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user')?.content)}catch{return null}
 if(!Array.isArray(data?.calls))return null
 const context=data.calls.findLast((c:any)=>c.capability==='amc.context'&&c.status==='succeeded')?.result
 if(context?.intent?.brandId!==intent.brandId||context?.intent?.artifactPath!==intent.artifactPath||!/^[a-f0-9]{64}$/.test(context.contextDigest||''))return null
 const required=intent.topic==='brand_planning'?'amc-marketing-expert/SKILL.md':'amc-conversation/SKILL.md'
 if(!data.calls.some((c:any)=>c.capability==='assistant.skills.read'&&c.status==='succeeded'&&c.input?.id===required&&!c.input.resource))return null
 const writes=data.calls.filter((c:any)=>c.capability==='my_write_workspace'&&c.status==='succeeded'&&c.result?.reference?.path===intent.artifactPath)
 const revision=writes.length?writes.at(-1).result.reference.revision:0
 if(!Number.isInteger(revision)||revision<0)return null
 return {intent,digest:context.contextDigest,revision}
}
export function conversationDocumentCall(text:unknown,binding:NonNullable<ReturnType<typeof conversationDocumentBinding>>,writer:string){
 if(!writer||typeof writer!=='string')throw Error('conversation_document_writer_unavailable')
 if(typeof text!=='string'||!text.trim()||text.length>24000)throw Error('conversation_document_empty_or_too_long')
 return {function:{name:writer,arguments:JSON.stringify({path:binding.intent.artifactPath,expectedRevision:binding.revision,mediaType:'application/json',content:JSON.stringify({kind:'conversation',brandId:binding.intent.brandId,contextDigest:binding.digest,content:text})})}}
}
