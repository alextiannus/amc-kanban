import {interviewAnswersSchema} from './interview-contract'
import type {ConversationIntent} from './contract'
import {planningArtifactSchema} from './planning-artifact-schema'
import type {PlanningScope} from './planning-workspace-contract'
import type {Completion} from '../global-text/transport'

const workspaceWriter=(tool:any)=>{const p=tool?.parameters?.properties;return !!(p?.path&&p?.content&&p?.expectedRevision)}
/** The inner reply is typed as an object too: content is prose, never a nested envelope. */
export function conversationArtifactSchema(intent:ConversationIntent){
 const text={type:'string',minLength:1}
 return {type:'object',additionalProperties:false,required:['kind','brandId','content','contextDigest',...(intent.topic==='brand_planning'?['planningProgress']:[])],properties:{
  kind:{type:'string',const:'conversation'},brandId:{type:'string',const:intent.brandId},
  content:{...text,description:'The complete user-visible reply in Markdown as ONE STRING. Do not nest reply, planningProgress, suggestedReplies or uiAction here. These are root-level siblings.'},
  contextDigest:{type:'string',pattern:'^[a-f0-9]{64}$',description:'Copy the exact amc.context.contextDigest.'},
  title:{...text,maxLength:200},
  ...(intent.topic==='brand_planning'?{planningProgress:{type:'object',additionalProperties:false,required:['stage','summary'],properties:{stage:{type:'string',...(intent.planningScope?{const:intent.planningScope.stage}:{enum:['insight','interview','direction','marketing_plan','execution_checklist','focus','selling_points','annual','quarter']})},summary:{...text,maxLength:500}}},planningDraft:{type:'object',description:'Only when explicitly requested. Copy optionalPlanningDraftContract / artifactContract exactly.',additionalProperties:true},annualBudget:{type:'object',description:'Only for an explicit budget, validated with amc.planning_budget.',additionalProperties:true}}:{}),
  interviewDraft:{type:'object',additionalProperties:false,required:['answers'],properties:{answers:interviewAnswersSchema},description:'Optional UNSAVED interview summary/proposal for explicit confirmation. Also show these exact answers in visible content. Never claims a save.'},
  suggestedReplies:{type:'array',maxItems:3,items:{...text,maxLength:200}},
  uiAction:{type:'object',additionalProperties:false,required:['page','mode'],properties:{page:{...text,description:'An exact authorized key from amc.context.uiCapabilities.pages.'},mode:{type:'string',enum:['open','suggest']},month:{type:'string',pattern:'^[0-9]{4}-[0-9]{2}$'}}}
 }}
}
export function nativeWireTools(tools:any[],structuredWorkspace=false,scope?:PlanningScope,binding?:ConversationIntent){
 return tools.filter(tool=>tool.name!=='iaic_wait').map(tool=>{
  if(structuredWorkspace&&workspaceWriter(tool))return {...tool,description:tool.description+' For this reply artifact, supply content as a complete JSON OBJECT matching artifactContract, not as a JSON-encoded string. For progressive display, emit outer path first, then content; inside content emit kind and brandId before the user-visible content string, and put other metadata after that string. Never delay the visible reply behind metadata. The host serializes it losslessly before the normal workspace write and verification.',parameters:{...tool.parameters,properties:{path:tool.parameters.properties.path,content:scope?planningArtifactSchema(scope):binding?conversationArtifactSchema(binding):{type:'object',description:'Complete planning reply artifact as a JSON object; follow the trusted artifactContract.',additionalProperties:true},...Object.fromEntries(Object.entries(tool.parameters.properties).filter(([key])=>key!=='path'&&key!=='content')),...(tool.parameters.properties.mediaType?{mediaType:{type:'string',const:'application/json'}}:{})}}}
  return tool.name==='iaic_finish'?{...tool,description:tool.description+' Complete the current reply, putting necessary questions and next user steps in the artifact; never wait for human interaction or claim unfinished business operations succeeded. Supply literal JSON: {"result":{"summary":"Candidate ready","artifacts":[{"path":"COPY EXACT RECEIPT PATH","revision":1,"digest":"COPY EXACT RECEIPT DIGEST"}]}}. Copy actual workspace reference values. Use a short summary, not the candidate document. No JavaScript expressions, concatenation, markdown fences or ellipses.'}:tool
 })
}
export function nativeWireCall(call:any,result:Completion,tools:any[]=[],structuredWorkspace=false,binding?:ConversationIntent){
 const original=call?.function?.arguments
 try{
  if(typeof call?.function?.name!=='string'||!call.function.name)throw new Error('tool_call_required')
  // Some compatible providers already return a parsed object. Normalize its
  // representation, without changing values or repairing malformed strings.
  let args=typeof original==='string'?JSON.parse(original):original
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('object_required')
  // Identify the workspace writer from the trusted advertised schema, including aliases.
  const properties=tools.find(tool=>tool.name===call.function.name)?.parameters?.properties
  if(properties?.path&&properties?.content&&properties?.expectedRevision&&(args.mediaType==='application/json'||binding?.kind==='conversation'&&args.path===binding.artifactPath)){
   // Fixed envelope metadata belongs to the admitted task, including ordinary replies.
   // Explicit mismatches and all evidence/business content remain untouched.
   if(binding?.kind==='conversation'&&args.path===binding.artifactPath){
    const document=typeof args.content==='string'?JSON.parse(args.content):args.content
    if(document&&typeof document==='object'&&!Array.isArray(document)){
     const bound={...document,...(document.kind===undefined?{kind:'conversation'}:{}),...(document.brandId===undefined?{brandId:binding.brandId}:{})}
     args={...args,content:typeof args.content==='string'?JSON.stringify(bound):bound}
    }
   }
   if(structuredWorkspace){
    let document=typeof args.content==='string'?JSON.parse(args.content):args.content
    // Fill only transport metadata from the trusted admission or the generated
    // summary. Never alter strategy data, source digests, scope or revisions.
    if(binding?.kind==='conversation'&&binding.topic==='brand_planning'&&args.path===binding.artifactPath&&document&&typeof document==='object'&&!Array.isArray(document)&&document.planningDraft){
     document={...document,...(document.kind===undefined?{kind:'conversation'}:{}),...(document.brandId===undefined?{brandId:binding.brandId}:{}),...(document.content===undefined&&typeof document.planningDraft.content==='string'?{content:document.planningDraft.content}:{}),...(document.planningProgress===undefined&&binding.planningScope?{planningProgress:{stage:binding.planningScope.stage,summary:String(document.planningDraft.content||'Draft prepared').slice(0,500)}}:{})}
    }
    if(document&&typeof document==='object'&&!Array.isArray(document))args={...args,content:JSON.stringify(document)}
   }
   if(typeof args.content!=='string')throw new Error('json_document_string_required')
   JSON.parse(args.content)
  }
  return {...call,function:{...call.function,arguments:JSON.stringify(args)}}
 }catch(error){
  const position=Number(String((error as Error).message).match(/position (\d+)/)?.[1])
  const syntax={tool:/^[a-zA-Z0-9_-]{1,64}$/.test(call?.function?.name||'')?call.function.name:"unknown",argumentType:typeof original,chars:typeof original==='string'?original.length:null,position:Number.isFinite(position)?position:null,shape:typeof original==='string'&&Number.isFinite(position)?original.slice(Math.max(0,position-25),position+25).replace(/[^{}\[\]":,\\\n\r\t` ]/gu,'x'):null}
  console.warn('[amc-ai-invalid-tool-json]',JSON.stringify(syntax))
  throw Object.assign(new Error('Tool arguments must be one valid JSON object. '+(typeof original==='string'&&Number.isFinite(position)?`JSON parser stopped at character ${position} of ${original.length}; include every closing brace/bracket and a complete final value. `:'')+(structuredWorkspace?'For structured workspace writes supply content as a complete JSON OBJECT matching the advertised schema, not as an escaped string. ':'For workspace writes with mediaType application/json, content must contain a complete valid JSON document serialized as a string. Escape inner quotes and newlines; no trailing commas. ')+ ' Do not use JavaScript expressions, concatenation or markdown. For iaic_finish send {"result":{"summary":"Candidate ready","artifacts":[{"path":"copy actual path","revision":1,"digest":"copy actual digest"}]}} with actual literal reference values; do not include the full document in summary.'),{code:'INVALID_MODEL_ACTION',invalidAction:true,usage:{inputTokens:result.usage?.input_tokens??null,outputTokens:result.usage?.output_tokens??null,cachedInputTokens:result.usage?.input_tokens_details?.cached_tokens??null,reasoningOutputTokens:result.usage?.output_tokens_details?.reasoning_tokens??null},usageEvidence:{rawUsage:result.rawUsage,providerReference:result.providerReference},providerCompleted:true})
 }
}

export function nativeWireCalls(calls:unknown,result:Completion,tools:any[]=[],structuredWorkspace=false,binding?:ConversationIntent){
 // Rejected provider structures must preserve already observed usage as well.
 if(!Array.isArray(calls)||!calls.length)return [nativeWireCall(null,result,tools,structuredWorkspace,binding)]
 return calls.map(call=>nativeWireCall(call,result,tools,structuredWorkspace,binding))
}
