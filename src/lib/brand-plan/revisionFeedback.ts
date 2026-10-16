import {CreativeRevisionError,record,stableJson,validateCreativePatch} from './creativeRevisionContract'
import {normalizeCreativeWorkspaceItem} from './creativeWorkspaceContract'
import {revisionReasons} from '../creativeReviewContract'
import {boundedEditDistance} from '../feedbackDistance'

export const REVISION_REASONS=revisionReasons.map(([key])=>key)
export const CANDIDATE_FEEDBACK_KIND='CREATIVE_CANDIDATE_FEEDBACK'
export const FEEDBACK_WINDOW=2000
export const FEEDBACK_DIMENSION_KEYS=50
export const FEEDBACK_TEXT_LENGTH=512
export const FEEDBACK_DISTANCE_CELLS=4_000_000
export const VIDEO_FEEDBACK_FIELDS=['spokenText','overlayText','visualDescription','subjectAction','soundDesign','transition','narrativePurpose'] as const
type VideoTextField=typeof VIDEO_FEEDBACK_FIELDS[number]
type ReceiptChange={beforeId:string|null;afterId:string|null}
export type VideoFeedback={sourceShotId?:string;textChanges?:Array<{field:VideoTextField;before:string;after:string}>;captionMismatchBlocked?:boolean;voiceReceiptChange?:ReceiptChange;musicReceiptChange?:ReceiptChange}
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const identifier=(value:unknown):value is string=>typeof value==='string'&&value.length<=200&&!!value.trim()&&value===value.trim()&&safeKey(value)
/** Trusted producers must persist exact evidence; the public save API cannot write it. */
export function readVideoFeedback(value:unknown):VideoFeedback|null{
  if(!object(value)||!Object.keys(value).length||Object.keys(value).some(k=>!['sourceShotId','textChanges','captionMismatchBlocked','voiceReceiptChange','musicReceiptChange'].includes(k)))return null
  if('sourceShotId' in value&&!identifier(value.sourceShotId))return null
  if('captionMismatchBlocked' in value&&typeof value.captionMismatchBlocked!=='boolean')return null
  if('textChanges' in value){
    if(!Array.isArray(value.textChanges)||value.textChanges.length>VIDEO_FEEDBACK_FIELDS.length)return null
    const seen=new Set<string>()
    for(const c of value.textChanges){
      if(!object(c)||Object.keys(c).length!==3||Object.keys(c).some(k=>!['field','before','after'].includes(k))||!VIDEO_FEEDBACK_FIELDS.includes(c.field)||seen.has(c.field))return null
      for(const text of [c.before,c.after])if(typeof text!=='string'||text.length>FEEDBACK_TEXT_LENGTH*2||Array.from(text).length>FEEDBACK_TEXT_LENGTH)return null
      seen.add(c.field)
    }
  }
  for(const name of ['voiceReceiptChange','musicReceiptChange'])if(name in value){
    const pair=value[name]
    if(!object(pair)||Object.keys(pair).length!==2||!Object.hasOwn(pair,'beforeId')||!Object.hasOwn(pair,'afterId')||[pair.beforeId,pair.afterId].some(v=>v!==null&&!identifier(v)))return null
  }
  return value as VideoFeedback
}
const rate=(numerator:number,denominator:number)=>({numerator,denominator,rate:denominator?numerator/denominator:null})
function qualityAttempts(input:Record<string,any>){
  const ai=record(input.ai),quality=record(input.qualityReview||ai.qualityReview),taskId=input.taskId||ai.taskId
  if(!identifier(taskId)||quality.version!==1||!Array.isArray(quality.attempts)||quality.attempts.length>2)return []
  return quality.attempts.flatMap((raw:unknown)=>{
    const a=record(raw),artifact=record(a.artifact),classification=record(a.classification),review=record(a.review)
    if(!identifier(artifact.digest)||!identifier(artifact.path)||!Number.isInteger(artifact.revision)||artifact.revision<1||classification.candidateDigest!==artifact.digest||!['passed','failed'].includes(review.status))return []
    const shots=record(a.adapted).shots
    const shotIds=Array.isArray(shots)&&shots.length<=100?keys(shots.filter(s=>record(s).contractVersion===2).map(s=>record(s).sourceShotId)):[]
    return [{id:stableJson([taskId,artifact.path,artifact.revision,artifact.digest]),passed:review.status==='passed',shotIds}]
  })
}
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
export function creativeCandidateChanges(base:unknown,candidatePatch:unknown,final:unknown,month:string,preserveTags=false){
  const original=record(base),candidate={...original,...validateCreativePatch(candidatePatch,month)}
  if(preserveTags)candidate.aiTags=Array.isArray(original.aiTags)?original.aiTags:[]
  // Compare complete effective contents under the same fixed base. Metadata and
  // copy-only lineage/schedule changes are not edits to the generated candidate.
  return creativeChanges(candidate,final).filter(change=>['title','planning','materialRequirements','aiCaption','aiTags','product','contentType'].includes(change.field))
}
const keys=(value:unknown):string[]=>[...new Set((Array.isArray(value)?value.slice(0,100):[]).filter((v):v is string=>typeof v==='string'&&v.length<=200&&v.trim().length>0).map(v=>v.trim()))]
export function creativeFeedbackDimensions(value:unknown,source?:unknown){
  const item=record(value),reference=record(item.source),oldSource=record(source),decision=record(item.skuDecision)
  return {source:keys([reference.inspirationCreativeId||oldSource.creativeId||item.inspirationCreativeId]),sku:keys(decision.selectedSkuIds||item.skuIds),platform:keys(item.platformTargets||[item.platformSlug||item.platform]).map(platform),contentType:keys([item.contentType])}
}
const safeKey=(key:string)=>key!=='other'&&!['__proto__','constructor','prototype'].includes(key)&&!/[\u0000-\u001f]/.test(key)
type Counts={reviewedScripts:number;directlyAdoptedScripts:number;editedScripts:number;discardedCandidates:number}
function counter(){return {reviewed:new Set<string>(),direct:new Set<string>(),edited:new Set<string>(),discarded:new Set<string>()}}
type Counter=ReturnType<typeof counter>
function counts(value:Counter):Counts{return {reviewedScripts:value.reviewed.size,directlyAdoptedScripts:value.direct.size,editedScripts:value.edited.size,discardedCandidates:value.discarded.size}}
const changedFields=(value:unknown)=>[...new Set((Array.isArray(value)?value.slice(0,100):[]).map(c=>record(c).field).filter((f):f is string=>typeof f==='string'&&([...FEEDBACK_FIELDS,'date','platform'] as string[]).includes(f)))]
export function summarizeCreativeFeedback(rows:any[]){
  const window=rows.slice(0,FEEDBACK_WINDOW),fidelity=new Map<string,boolean>()
  for(const row of window){
    if(row.kind!=='CREATIVE_ITEM'&&row.kind!=='CREATIVE_FIDELITY_REVIEW')continue
    for(const a of qualityAttempts(record(row.input)))fidelity.set(a.id,(fidelity.get(a.id)??true)&&a.passed)
  }
  const editDistanceByField:Record<string,{total:number;comparisons:number;excludedPairs:number}>={}
  let captionMismatchBlocks=0,voiceNumerator=0,voiceDenominator=0,musicNumerator=0,musicDenominator=0,cellsLeft=FEEDBACK_DISTANCE_CELLS
  const fields:Record<string,number>={},reasons:Record<string,number>={},total=counter()
  const events=window.flatMap(row=>{
    const input=record(row.input)
    if(input.actor?.type!=='HUMAN'||row.version===0||typeof input.creativeId!=='string')return []
    const discarded=row.kind===CANDIDATE_FEEDBACK_KIND&&input.event==='candidate_discarded'
    if(row.kind&&row.kind!=='CREATIVE_ITEM'&&!discarded)return []
    const video=!discarded?readVideoFeedback(input.videoFeedback):null
    const videoEdited=!!video?.textChanges?.some(c=>c.before!==c.after)||[video?.voiceReceiptChange,video?.musicReceiptChange].some(c=>c&&c.beforeId!==c.afterId)
    const changes=changedFields(input.changes),ai=record(input.ai)
    // Missing legacy changes are unknown, not proof of unchanged adoption.
    const reviewChanges=Array.isArray(ai.reviewChanges)?changedFields(ai.reviewChanges):null
    const direct=!discarded&&!videoEdited&&(input.ai?reviewChanges?.length===0:Array.isArray(input.changes)&&changes.length===0)
    const edited=!discarded&&(videoEdited||(reviewChanges!==null?reviewChanges.length>0:changes.length>0))
    const rawDimensions=record(input.dimensions||creativeFeedbackDimensions(row.output,input.source))
    const dimensions:Record<string,unknown>={...rawDimensions,platform:keys(rawDimensions.platform).map(platform),sourceShot:keys([video?.sourceShotId,...qualityAttempts(input).flatMap(a=>a.shotIds)])}
    return [{input,id:stableJson([input.month||'',input.creativeId]),discarded,direct,edited,changes,dimensions,video,videoEdited}]
  })
  const dimensionNames=['source','sku','platform','contentType','sourceShot'] as const
  const allowed=Object.fromEntries(dimensionNames.map(name=>[name,new Set(events.flatMap(e=>keys(e.dimensions[name])).filter(safeKey).sort().filter((v,i,a)=>i===0||v!==a[i-1]).slice(0,FEEDBACK_DIMENSION_KEYS-1))]))
  const dimensions=Object.fromEntries(dimensionNames.map(name=>[name,new Map<string,Counter>()]))
  for(const event of events){
    const apply=(target:Counter,edited=event.edited)=>{
      target.reviewed.add(event.id)
      if(event.direct)target.direct.add(event.id)
      if(edited)target.edited.add(event.id)
      if(event.discarded&&typeof event.input.candidateKey==='string')target.discarded.add(event.input.candidateKey)
    }
    apply(total)
    if(event.video){
      if(event.video.captionMismatchBlocked)captionMismatchBlocks++
      for(const c of event.video.textChanges||[]){
        const metric=editDistanceByField[c.field]??={total:0,comparisons:0,excludedPairs:0}
        const measured=boundedEditDistance(c.before,c.after,FEEDBACK_TEXT_LENGTH,cellsLeft)
        if(!measured){metric.excludedPairs++;continue}
        metric.total+=measured.distance;metric.comparisons++;cellsLeft-=measured.cells
      }
      for(const [name,pair] of [['voice',event.video.voiceReceiptChange],['music',event.video.musicReceiptChange]] as const){
        if(!pair)continue
        const replaced=pair.beforeId!==null&&pair.afterId!==null&&pair.beforeId!==pair.afterId
        if(name==='voice'){voiceDenominator++;if(replaced)voiceNumerator++}else{musicDenominator++;if(replaced)musicNumerator++}
      }
    }
    for(const field of event.changes)fields[field]=(fields[field]||0)+1
    for(const reason of new Set((Array.isArray(event.input.feedback?.reasons)?event.input.feedback.reasons.slice(0,10):[]).map(reasonKey)))reasons[reason as string]=(reasons[reason as string]||0)+1
    for(const name of dimensionNames){
      const raw=keys(event.dimensions[name]),buckets=new Set(raw.length?raw.map(key=>allowed[name].has(key)?key:'other'):['other'])
      const editedShot=event.video?.sourceShotId
      const editedBucket=editedShot?(allowed.sourceShot.has(editedShot)?editedShot:'other'):null
      for(const key of buckets){
        if(!dimensions[name].has(key))dimensions[name].set(key,counter())
        apply(dimensions[name].get(key)!,name==='sourceShot'?event.videoEdited&&editedBucket===key:event.edited)
      }
    }
  }
  const project=(name:string)=>Object.fromEntries([...dimensions[name]].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>[key,counts(value)]))
  return {...counts(total),fields:Object.fromEntries(Object.entries(fields).sort()),reasons:Object.fromEntries(Object.entries(reasons).sort()),bySource:project('source'),bySku:project('sku'),byPlatform:project('platform'),byContentType:project('contentType'),bySourceShot:project('sourceShot'),editDistanceByField:Object.fromEntries(Object.entries(editDistanceByField).sort()),captionMismatchBlocks,fidelityPassRate:rate([...fidelity.values()].filter(Boolean).length,fidelity.size),voiceReplacementRate:rate(voiceNumerator,voiceDenominator),musicReplacementRate:rate(musicNumerator,musicDenominator)}
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
