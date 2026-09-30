import { createHash } from 'node:crypto'
import { validateCreativePatch } from '../brand-plan/creativeRevisionContract'

export const CORE_VERSION = '0.1.0-candidate.114'
export const CORE_ARCHIVE_SHA = '1eb1b87bcef1c1191eff788ca77cee678a1ac979c91ac0bcbecc77a525d79f24'
export const TASK_ALLOWANCE = 600000
export const DAILY_ALLOWANCE = 3000000
export type NativeActor = { scopeId:string; subjectId:string }
export type CreativeIntent = {kind:'creative';autopilotRunId?:string;requireMaterials?:boolean;adaptToBrand?:boolean;brandId:string;creativeId:string;month:string;goal:string;expectedRevision:string;artifactPath:string;requestKey:string;userId:string}
export type BriefIntent = {kind:'brand_brief';brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type DiscoveryIntent = {kind:'creative_discovery';requireMaterials?:boolean;poolIdeaId?:string;automaticDaily?:boolean;brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type AutopilotIntent = {kind:'autopilot';runId:string;brandId:string;goal:string;artifactPath:string;requestKey:string;userId:string}
export type NativeIntent = CreativeIntent | BriefIntent | DiscoveryIntent | AutopilotIntent
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
