import {isUiPage,parseUiAction,type UiAction,type UiPage} from './ui-navigation'
import {PLANNING_STAGES,planningScope,validatePlanningDraft,type PlanningScope,type PlanningDraft} from './planning-workspace-contract'
import {checkPlanningBudget,type PlanningBudget} from './planning-budget'
import { createHash } from 'node:crypto'
import { stableJson, validateCreativePatch } from '../brand-plan/creativeRevisionContract'
import type {SkuBinding} from '../brand-plan/creativeSkuContract'

export const CORE_VERSION = '0.1.0-candidate.114'
export const CORE_ARCHIVE_SHA = '1eb1b87bcef1c1191eff788ca77cee678a1ac979c91ac0bcbecc77a525d79f24'
export const USAGE_POLICY = {enforced:false,taskAllowance:null,dailyAllowance:null,mode:"meter_only"} as const
export type NativeActor = { scopeId:string; subjectId:string }
export type CreativeIntent = {kind:'creative';editMode?:'materials';draftScript?:string;draftMaterialRequirements?:string[];autopilotRunId?:string;requireMaterials?:boolean;adaptToBrand?:boolean;brandId:string;creativeId:string;month:string;goal:string;expectedRevision:string;artifactPath:string;requestKey:string;userId:string}
export type BriefIntent = {kind:'brand_brief';brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type PlanningBinding={id:string;month:string;platform:string;excludeCreativeIds:string[]}
export type DiscoveryIntent = {skuWorkflow?:true;planningRequest?:PlanningBinding;kind:'creative_discovery';requireMaterials?:boolean;poolIdeaId?:string;automaticDaily?:boolean;recoveryOfTaskId?:string;recoveryVersion?:string;brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type AutopilotIntent = {kind:'autopilot';runId:string;brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type ConversationIntent = {afterTaskId?:string;conversationId?:string;autoSavePlanning?:boolean;contextSessionId?:string;currentPage?:UiPage;planningDraftContext?:string;planningScope?:PlanningScope;kind:'conversation';topic:'general'|'brand_planning';history:Array<{role:'user'|'assistant';content:string}>;brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type SkuIntent = SkuBinding & {kind:'sku_proposal'|'creative_adaptation';decisionDigest?:string;autopilotRunId?:string;requireMaterials?:boolean;brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type NativeIntent = CreativeIntent | BriefIntent | DiscoveryIntent | AutopilotIntent | ConversationIntent | SkuIntent
export function nativeError(code:string,statusCode=400) { return Object.assign(new Error(code),{code,statusCode}) }
export function digest(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
// Bind a compact immutable reference; prose remains available through amc.context.
export function nativeIntentProjection(intent:NativeIntent){return {kind:intent.kind,brandId:intent.brandId,userId:intent.userId,payloadDigest:createHash('sha256').update(stableJson(intent)).digest('hex')}}
export function resolveNativeIntentProjection(intent:NativeIntent,binding:{schema:string;version:string}){
  if(binding.schema==='amc-creative-intent'&&binding.version==='1')return {...intent}
  if(binding.schema==='amc-intent-reference'&&binding.version==='2')return nativeIntentProjection(intent)
  throw nativeError('unsupported_intent_binding',409)
}
// Compare SKU JSON values, not their historical order-sensitive digest. JSONB
// reorders objects recursively; optional undefined fields disappear on storage.
// Keep every bound field (including source, decision and autopilot) and array
// order significant. Other intent kinds retain their original digest contract.
export function sameSkuIntent(left:NativeIntent,right:NativeIntent){
  return (left.kind==='sku_proposal'||left.kind==='creative_adaptation')&&left.kind===right.kind&&stableJson(left)===stableJson(right)
}
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
  if(intent.editMode==='materials'){
    if(typeof intent.draftScript!=='string'||!intent.draftScript.trim()||intent.draftScript.length>20000||Object.keys(c.patch).some(k=>!['planning','materialRequirements'].includes(k))||(c.patch.planning!==undefined&&c.patch.planning!==intent.draftScript)||!Array.isArray(c.patch.materialRequirements))throw nativeError('materials_only_patch_required')
    // Bind the script on the server: the model need not copy a long human draft.
    c.patch.planning=intent.draftScript
  }
  validateCreativePatch(c.patch,intent.month)
  if(intent.editMode==='materials')c.patch.planning=intent.draftScript
  return c as {kind:'creative_candidate';brandId:string;creativeId:string;month:string;expectedRevision:string;contextDigest:string;patch:Record<string,unknown>;rationale:string;sourceCreativeId:string|null;factsUsed:string[];skuIds?:string[]}
}
export function briefFrom(content:string,intent:BriefIntent){
  if(Buffer.byteLength(content)>32000)throw nativeError('report_too_large')
  const value=JSON.parse(content)
  if(value.kind!=='brand_brief'||value.brandId!==intent.brandId||typeof value.content!=='string'||!value.content.trim()||typeof value.title!=='string'||!value.title.trim()||!/^[a-f0-9]{64}$/.test(value.contextDigest)||!/^[a-f0-9]{64}$/.test(value.operationsDigest))throw nativeError('report_evidence_invalid')
  return value as {kind:'brand_brief';brandId:string;title:string;content:string;contextDigest:string;operationsDigest:string}
}

export function conversationFrom(content:string,intent:ConversationIntent){
  if(Buffer.byteLength(content)>(['marketing_plan','execution_checklist'].includes(intent.planningScope?.stage||'')?120000:32000))throw nativeError('reply_too_large')
  const value=JSON.parse(content)
  if(value.kind!=='conversation'||value.brandId!==intent.brandId||typeof value.content!=='string'||!value.content.trim()||!/^[a-f0-9]{64}$/.test(value.contextDigest))throw nativeError('reply_evidence_invalid')
  if(intent.planningScope&&(intent.planningScope.mode==='draft'||value.planningDraft!==undefined))value.planningDraft=validatePlanningDraft(value.planningDraft,{...intent.planningScope,mode:'draft'})
  else if(value.planningDraft!==undefined)throw nativeError('unexpected_planning_draft')
  if(value.planningDraft&&intent.planningScope?.stage==='quarter'){
    for(const content of [value.content,value.planningDraft.content]){
      const label=String(content).split('\n')[0].match(/年度第([1-4一二三四])季/)
      const ordinal=label?(Number(label[1])||'一二三四'.indexOf(label[1])+1):null
      if(ordinal&&ordinal!==intent.planningScope.quarter!+1)throw nativeError(`planning_reply_requires_annual_quarter_${intent.planningScope.quarter!+1}`)
    }
  }
  if(value.planningProgress!==undefined){
    const p=value.planningProgress
    if(intent.topic!=='brand_planning'||!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).some(k=>!['stage','summary'].includes(k))||!PLANNING_STAGES.includes(p.stage)||typeof p.summary!=='string'||!p.summary.trim()||p.summary.length>500)throw nativeError('invalid_planning_progress')
    if(intent.planningScope&&p.stage!==intent.planningScope.stage)throw nativeError('planning_progress_scope_mismatch')
  }
  if(value.uiAction!==undefined)value.uiAction=parseUiAction(value.uiAction)
  if(value.suggestedReplies!==undefined){
    if(!Array.isArray(value.suggestedReplies)||value.suggestedReplies.some((s:unknown)=>typeof s!=='string'||!s.trim()||s.length>200))throw nativeError('invalid_suggested_replies')
    // Display normalization only: do not spend another model turn rewriting a valid reply for a fourth chip.
    value.suggestedReplies=[...new Set((value.suggestedReplies as string[]).map(s=>s.trim()))].slice(0,3)
  }
  if(value.annualBudget&&!checkPlanningBudget(value.annualBudget).balanced)throw nativeError('annual_budget_unbalanced')
  return value as {planningProgress?:{stage:PlanningScope['stage'];summary:string};uiAction?:UiAction;suggestedReplies?:string[];planningDraft?:PlanningDraft;annualBudget?:PlanningBudget;kind:'conversation';brandId:string;content:string;contextDigest:string;title?:string}
}
export function conversationInput(body:any){
  if(body.afterTaskId!==undefined&&(typeof body.afterTaskId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.afterTaskId)))throw nativeError('invalid_previous_task')
  if(body.conversationId!==undefined&&(typeof body.conversationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.conversationId)))throw nativeError('invalid_conversation_id')
  if(body.autoSavePlanning!==undefined&&typeof body.autoSavePlanning!=='boolean')throw nativeError('invalid_auto_save')
  if(body.contextSessionId!==undefined&&(typeof body.contextSessionId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.contextSessionId)))throw nativeError('invalid_context_session')
  if(body.currentPage!==undefined&&!isUiPage(body.currentPage))throw nativeError('invalid_current_page')
  const history=body.history??[]
  if(!Array.isArray(history)||history.length>20||history.some((t:any)=>!t||!['user','assistant'].includes(t.role)||typeof t.content!=='string'||t.content.length>12000))throw nativeError('invalid_conversation_history')
  if(body.topic!==undefined&&!['general','brand_planning'].includes(body.topic))throw nativeError('invalid_conversation_topic')
  if(body.planningDraftContext!==undefined&&(typeof body.planningDraftContext!=='string'||body.planningDraftContext.length>32000||!body.planningScope))throw nativeError('invalid_planning_draft_context')
  const scope=body.planningScope===undefined?undefined:planningScope(body.planningScope)
  const topic=scope||body.topic==='brand_planning'||/AMC\s*营销专家|宣传重心|年度(?:推广|营销|行銷)计划|品牌(?:策划|规划|定位|访谈|营销|洞察)|卖点|营销(?:策划|方案|计划|策略)|推广(?:方案|计划|活动)|brand (?:planning|strategy|positioning|interview)|marketing (?:plan|strategy)|selling points|campaign plan|insight report/i.test(body.goal)?'brand_planning':'general'
  if(history.reduce((length:number,turn:{content:string})=>length+turn.content.length,0)>60000)throw nativeError('conversation_history_too_large',413)
  return {...(body.afterTaskId?{afterTaskId:body.afterTaskId}:{}),...(body.conversationId?{conversationId:body.conversationId}:{}),...(body.autoSavePlanning===true&&scope?.stage==='marketing_plan'?{autoSavePlanning:true}:{}),...(body.contextSessionId?{contextSessionId:body.contextSessionId}:{}),...(body.currentPage?{currentPage:body.currentPage}:{}),...(scope?{planningScope:scope}:{}),...(body.planningDraftContext!==undefined?{planningDraftContext:body.planningDraftContext}:{}),history:history.map(({role,content}:ConversationIntent['history'][number])=>({role,content})),topic} as Pick<ConversationIntent,'afterTaskId'|'conversationId'|'autoSavePlanning'|'contextSessionId'|'history'|'topic'|'planningScope'|'planningDraftContext'|'currentPage'>
}
