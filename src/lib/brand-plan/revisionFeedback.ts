import {CreativeRevisionError,record,stableJson,validateCreativePatch} from './creativeRevisionContract'
import {normalizeCreativeWorkspaceItem} from './creativeWorkspaceContract'

export const REVISION_REASONS=['sku_mismatch','selling_point','transitions','visual_description','voiceover','subtitle','platform_style','material_feasibility','brand_facts','other'] as const
export const CANDIDATE_FEEDBACK_KIND='CREATIVE_CANDIDATE_FEEDBACK'
export const FEEDBACK_WINDOW=2000
export const FEEDBACK_DIMENSION_KEYS=50
export const FEEDBACK_FIELDS=['title','status','platformTargets','contentType','product','planning','materialRequirements','aiCaption','aiTags','skuDecision','source','schedule'] as const
export function validateCreativeFeedback(value:any){
  if(value===undefined||value===null)return null
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['reasons','note'].includes(k))||!Array.isArray(value.reasons)||value.reasons.length>10||value.reasons.some((r:any)=>r!=='sku'&&!REVISION_REASONS.includes(r))||typeof value.note!=='string'||value.note.length>2000)throw new CreativeRevisionError('invalid_creative_feedback')
  // Preserve the legacy representation so old idempotency hashes still match.
  return {reasons:[...new Set(value.reasons)] as string[],note:value.note.trim()}
}
const reasonKey=(value:unknown)=>value==='sku'?'sku_mismatch':REVISION_REASONS.includes(value as any)?String(value):'other'
export function readCreativeFeedback(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))return null
  const input=record(value)
  return {reasons:[...new Set((Array.isArray(input.reasons)?input.reasons:[]).map(reasonKey))],note:typeof input.note==='string'?input.note:''}
}
const platform=(value:string)=>({ig:'instagram','tik tok':'tiktok','google business':'google_business',google:'google_business',gbp:'google_business','google maps':'google_business','小红书':'xiaohongshu'}[value.trim().toLowerCase()]||value.trim().toLowerCase())
function comparison(value:unknown):Record<string,unknown>{
  const raw=record(value),normalized=normalizeCreativeWorkspaceItem(raw)
  return {...normalized,product:raw.product??null,platformTargets:[...new Set(normalized.platformTargets.map(platform))].sort()}
}
export function creativeChanges(before:unknown,after:unknown){
  const left=comparison(before),right=comparison(after)
  return FEEDBACK_FIELDS.filter(field=>stableJson(left[field])!==stableJson(right[field])).map(field=>({field,before:left[field]??null,after:right[field]??null}))
}
export function creativeCandidateChanges(before:unknown,after:unknown,month:string){
  return creativeChanges(validateCreativePatch(before,month),validateCreativePatch(after,month))
}
const keys=(value:unknown):string[]=>[...new Set((Array.isArray(value)?value:[]).filter((v):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=200).map(v=>v.trim()))].slice(0,100)
export function creativeFeedbackDimensions(value:unknown,source?:unknown){
  const item=record(value),reference=record(item.source),oldSource=record(source),decision=record(item.skuDecision)
  return {source:keys([reference.inspirationCreativeId||oldSource.creativeId||item.inspirationCreativeId]),sku:keys(decision.selectedSkuIds||item.skuIds),platform:keys(item.platformTargets||[item.platformSlug||item.platform]).map(platform),contentType:keys([item.contentType])}
}
const safeKey=(key:string)=>key!=='other'&&!['__proto__','constructor','prototype'].includes(key)&&!/[\u0000-\u001f]/.test(key)
type Counts={reviewedScripts:number;directlyAdoptedScripts:number;editedScripts:number;discardedCandidates:number}
function counter(){return {reviewed:new Set<string>(),direct:new Set<string>(),edited:new Set<string>(),discarded:new Set<string>()}}
type Counter=ReturnType<typeof counter>
function counts(value:Counter):Counts{return {reviewedScripts:value.reviewed.size,directlyAdoptedScripts:value.direct.size,editedScripts:value.edited.size,discardedCandidates:value.discarded.size}}
const changedFields=(value:unknown)=>[...new Set((Array.isArray(value)?value:[]).map(c=>record(c).field).filter((f):f is string=>typeof f==='string'&&([...FEEDBACK_FIELDS,'date','platform'] as string[]).includes(f)))]
export function summarizeCreativeFeedback(rows:any[]){
  const fields:Record<string,number>={},reasons:Record<string,number>={},total=counter()
  const events=rows.slice(0,FEEDBACK_WINDOW).flatMap(row=>{
    const input=record(row.input)
    if(input.actor?.type!=='HUMAN'||row.version===0||typeof input.creativeId!=='string')return []
    const discarded=row.kind===CANDIDATE_FEEDBACK_KIND&&input.event==='candidate_discarded'
    if(row.kind&&row.kind!=='CREATIVE_ITEM'&&!discarded)return []
    const changes=changedFields(input.changes),ai=record(input.ai)
    // Missing legacy changes are unknown, not proof of unchanged adoption.
    const reviewChanges=Array.isArray(ai.reviewChanges)?changedFields(ai.reviewChanges):null
    const direct=!discarded&&(input.ai?reviewChanges?.length===0:Array.isArray(input.changes)&&changes.length===0)
    const edited=!discarded&&(reviewChanges!==null?reviewChanges.length>0:changes.length>0)
    const rawDimensions=input.dimensions||creativeFeedbackDimensions(row.output,input.source)
    const dimensions={...rawDimensions,platform:keys(rawDimensions.platform).map(platform)}
    return [{input,id:stableJson([input.month||'',input.creativeId]),discarded,direct,edited,changes,dimensions}]
  })
  const dimensionNames=['source','sku','platform','contentType'] as const
  const allowed=Object.fromEntries(dimensionNames.map(name=>[name,new Set(events.flatMap(e=>keys(e.dimensions[name])).filter(safeKey).sort().filter((v,i,a)=>i===0||v!==a[i-1]).slice(0,FEEDBACK_DIMENSION_KEYS-1))]))
  const dimensions=Object.fromEntries(dimensionNames.map(name=>[name,new Map<string,Counter>()]))
  for(const event of events){
    const apply=(target:Counter)=>{
      target.reviewed.add(event.id)
      if(event.direct)target.direct.add(event.id)
      if(event.edited)target.edited.add(event.id)
      if(event.discarded&&typeof event.input.candidateKey==='string')target.discarded.add(event.input.candidateKey)
    }
    apply(total)
    for(const field of event.changes)fields[field]=(fields[field]||0)+1
    for(const reason of new Set((Array.isArray(event.input.feedback?.reasons)?event.input.feedback.reasons:[]).map(reasonKey)))reasons[reason as string]=(reasons[reason as string]||0)+1
    for(const name of dimensionNames){
      const raw=keys(event.dimensions[name]),buckets=new Set(raw.length?raw.map(key=>allowed[name].has(key)?key:'other'):['other'])
      for(const key of buckets){if(!dimensions[name].has(key))dimensions[name].set(key,counter());apply(dimensions[name].get(key)!)}
    }
  }
  const project=(name:string)=>Object.fromEntries([...dimensions[name]].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>[key,counts(value)]))
  return {...counts(total),fields:Object.fromEntries(Object.entries(fields).sort()),reasons:Object.fromEntries(Object.entries(reasons).sort()),bySource:project('source'),bySku:project('sku'),byPlatform:project('platform'),byContentType:project('contentType')}
}
export function feedbackCursor(row:{createdAt:Date;id:string}){return Buffer.from(JSON.stringify([row.createdAt.toISOString(),row.id])).toString('base64url')}
export function parseFeedbackCursor(value:string|null|undefined):{createdAt:Date;id:string}|null{
  if(!value)return null
  try{
    if(value.length>300||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error()
    const parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8'))
    if(!Array.isArray(parsed)||parsed.length!==2||typeof parsed[0]!=='string'||typeof parsed[1]!=='string'||!parsed[1]||parsed[1].length>100)throw new Error()
    const createdAt=new Date(parsed[0]);if(createdAt.toISOString()!==parsed[0])throw new Error()
    return {createdAt,id:parsed[1]}
  }catch{throw new CreativeRevisionError('invalid_feedback_cursor')}
}
