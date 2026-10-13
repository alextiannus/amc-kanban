import { createHash } from 'node:crypto'
import { validateCreativePatch } from '../brand-plan/creativeRevisionContract'

export const CORE_VERSION = '0.1.0-candidate.114'
export const CORE_ARCHIVE_SHA = '1eb1b87bcef1c1191eff788ca77cee678a1ac979c91ac0bcbecc77a525d79f24'
export const USAGE_POLICY = {enforced:false,taskAllowance:null,dailyAllowance:null,mode:"meter_only"} as const
export type NativeActor = { scopeId:string; subjectId:string }
export type CreativeIntent = {kind:'creative';draftScript?:string;draftMaterialRequirements?:string[];autopilotRunId?:string;requireMaterials?:boolean;adaptToBrand?:boolean;brandId:string;creativeId:string;month:string;goal:string;expectedRevision:string;artifactPath:string;requestKey:string;userId:string}
export type BriefIntent = {kind:'brand_brief';brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type PlanningBinding={id:string;month:string;platform:string;excludeCreativeIds:string[]}
export type DiscoveryIntent = {planningRequest?:PlanningBinding;kind:'creative_discovery';requireMaterials?:boolean;poolIdeaId?:string;automaticDaily?:boolean;recoveryOfTaskId?:string;recoveryVersion?:string;brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type AutopilotIntent = {kind:'autopilot';runId:string;brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type ConversationIntent = {kind:'conversation';topic:'general'|'brand_planning';history:Array<{role:'user'|'assistant';content:string}>;brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type NativeIntent = CreativeIntent | BriefIntent | DiscoveryIntent | AutopilotIntent | ConversationIntent
export function nativeError(code:string,statusCode=400) { return Object.assign(new Error(code),{code,statusCode}) }
export function digest(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
export function actorFor(brandId:string,userId:string):NativeActor {
  if(!brandId||!userId||brandId.length>150||userId.length>150)throw nativeError('invalid_scope')
  return {scopeId:JSON.stringify(['amc-mm','user_ai',brandId]),subjectId:userId}
}
export function dailyActorFor(brandId:string,userId:string):NativeActor {const actor=actorFor(brandId,userId);return {...actor,scopeId:JSON.stringify(['amc-mm','brand_daily',brandId])}}
export function isDailyActor(actor:NativeActor){try{return JSON.parse(actor.scopeId)[1]==='brand_daily'}catch{return false}}
export function brandFor(actor:NativeActor){
  let scope:unknown;try{scope=JSON.parse(actor.scopeId)}catch{throw nativeError('invalid_scope',403)}
  if(!Array.isArray(scope)||scope.length!==3||scope[0]!=='amc-mm'||!['user_ai','brand_daily'].includes(scope[1])||typeof scope[2]!=='string')throw nativeError('invalid_scope',403)
  return scope[2] as string
}
export function requestKey(value:unknown){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(value))throw nativeError('invalid_request_key');return value}
export function candidateFrom(content:string,intent:CreativeIntent){
  if(Buffer.byteLength(content)>32000)throw nativeError('candidate_too_large')
  const c=JSON.parse(content)
  if(c?.kind!=='creative_candidate'||c.brandId!==intent.brandId||c.creativeId!==intent.creativeId||c.month!==intent.month||c.expectedRevision!==intent.expectedRevision||typeof c.rationale!=='string'||!Array.isArray(c.factsUsed))throw nativeError('candidate_binding_mismatch',409)
  if(typeof c.contextDigest!=='string'||!/^[a-f0-9]{64}$/.test(c.contextDigest)||c.factsUsed.length>30||c.factsUsed.some((v:unknown)=>typeof v!=='string'||v.length>500))throw nativeError('candidate_evidence_invalid')
  if(!c.patch||Object.keys(c.patch).some(k=>!['title','planning','aiCaption','aiTags','product','materialRequirements'].includes(k))||!Object.keys(c.patch).length)throw nativeError('candidate_patch_invalid')
  if(c.patch.materialRequirements===undefined&&c.materialRequirements!==undefined)c.patch.materialRequirements=c.materialRequirements
  if(intent.adaptToBrand&&(!c.patch.planning?.trim()||!c.patch.title?.trim()||typeof c.patch.aiCaption!=='string'||!Array.isArray(c.skuIds)||(intent.requireMaterials&&(!Array.isArray(c.patch.materialRequirements)||!c.patch.materialRequirements.some((item:unknown)=>typeof item==='string'&&item.trim())))))throw nativeError('adapted_script_required')
  validateCreativePatch(c.patch,intent.month)
  return c as {kind:'creative_candidate';brandId:string;creativeId:string;month:string;expectedRevision:string;contextDigest:string;patch:Record<string,unknown>;rationale:string;sourceCreativeId:string|null;factsUsed:string[];skuIds?:string[]}
}
export function briefFrom(content:string,intent:BriefIntent){
  if(Buffer.byteLength(content)>32000)throw nativeError('report_too_large')
  const value=JSON.parse(content)
  if(value.kind!=='brand_brief'||value.brandId!==intent.brandId||typeof value.content!=='string'||!value.content.trim()||typeof value.title!=='string'||!value.title.trim()||!/^[a-f0-9]{64}$/.test(value.contextDigest)||!/^[a-f0-9]{64}$/.test(value.operationsDigest))throw nativeError('report_evidence_invalid')
  return value as {kind:'brand_brief';brandId:string;title:string;content:string;contextDigest:string;operationsDigest:string}
}

export function conversationFrom(content:string,intent:ConversationIntent){
  if(Buffer.byteLength(content)>32000)throw nativeError('reply_too_large')
  const value=JSON.parse(content)
  if(value.kind!=='conversation'||value.brandId!==intent.brandId||typeof value.content!=='string'||!value.content.trim()||!/^[a-f0-9]{64}$/.test(value.contextDigest))throw nativeError('reply_evidence_invalid')
  return value as {kind:'conversation';brandId:string;content:string;contextDigest:string;title?:string}
}
export function conversationInput(body:any){
  const history=body.history??[]
  if(!Array.isArray(history)||history.length>20||history.some((t:any)=>!t||!['user','assistant'].includes(t.role)||typeof t.content!=='string'||t.content.length>12000))throw nativeError('invalid_conversation_history')
  if(body.topic!==undefined&&!['general','brand_planning'].includes(body.topic))throw nativeError('invalid_conversation_topic')
  const topic=body.topic==='brand_planning'||/品牌(?:策划|规划|定位|访谈|营销|洞察)|卖点|营销(?:策划|方案|计划|策略)|推广(?:方案|计划|活动)|brand (?:planning|strategy|positioning|interview)|marketing (?:plan|strategy)|selling points|campaign plan|insight report/i.test(body.goal)?'brand_planning':'general'
  if(history.reduce((length:number,turn:{content:string})=>length+turn.content.length,0)>60000)throw nativeError('conversation_history_too_large',413)
  return {history:history.map(({role,content}:ConversationIntent['history'][number])=>({role,content})),topic} as Pick<ConversationIntent,'history'|'topic'>
}
