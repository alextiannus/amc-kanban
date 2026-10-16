import {creativeDigest, CreativeRevisionError} from './creativeRevisionContract.ts'
import {SOURCE_ADAPTATION_CHANGE_REASONS, type AdaptedCreativeShotV2} from './creativeWorkspaceContract.ts'
export {SOURCE_ADAPTATION_CHANGE_REASONS} from './creativeWorkspaceContract.ts'
export type {AdaptedCreativeShotV2} from './creativeWorkspaceContract.ts'

export type CatalogSku={id:string;name:string;description:string;price:string;currency:string;serves:string;bundleItems:string[];tags:string[]}
export type SkuRecommendation={skuId:string;skuName:string;roles:string[];rationale:string;sourceShotIds:string[]}
export type SkuSource={inspirationCreativeId:string;sourceRevision:string;sourceDigest:string;evidenceStatus:string;timeline:Array<Record<string,any>>}
export type SkuBinding={brandId:string;creativeId:string;month:string;expectedRevision:string;catalogDigest:string;sourceRevision:string|null;sourceDigest:string|null}
export type ConfirmedSkuDecision={status:'confirmed'|'adjusted';mode:'source_adaptation'|'ordinary_brand_content';recommendations:SkuRecommendation[];selectedSkuIds:string[];adjustmentNote:string|null;decidedBy:string;decidedAt:string;catalogDigest:string;sourceRevision:string|null;sourceDigest:string|null;source:SkuSource|null;basedOnRevision:string;digest:string}
function fail(code:string,status=400):never{throw new CreativeRevisionError(code,status)}
const text=(v:unknown,max=2000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max
const unique=(v:unknown,max:number):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(x=>text(x,200))&&new Set(v).size===v.length
export function skuCatalog(facts:any):CatalogSku[]{
  const items=facts?.knowledge?.menuItems
  if(!Array.isArray(items))return []
  const ids=new Set<string>()
  return items.flatMap(item=>{
    if(!item||typeof item!=='object'||item.brandId&&item.brandId!==facts.id||!text(item.id,150)||!text(item.name||item.title,500)||item.deletedAt||item.active===false||['deleted','archived','inactive'].includes(String(item.status||'').toLowerCase()))return []
    if(ids.has(item.id))fail('sku_catalog_ambiguous',409)
    ids.add(item.id)
    return [{id:item.id,name:item.name||item.title,description:typeof item.description==='string'?item.description:'',price:typeof item.price==='string'||typeof item.price==='number'?String(item.price):'',currency:typeof item.currency==='string'?item.currency:'',serves:typeof(item.serves||item.portion)==='string'?(item.serves||item.portion):'',bundleItems:Array.isArray(item.bundleItems)?item.bundleItems.filter((x:unknown)=>typeof x==='string'):typeof item.bundleItems==='string'?[item.bundleItems]:[],tags:Array.isArray(item.tags)?item.tags.filter((x:unknown)=>typeof x==='string'):[]}]
  }).sort((a,b)=>a.id.localeCompare(b.id))
}
export const catalogDigest=(catalog:CatalogSku[])=>creativeDigest(catalog)
export function checkSkuBinding(input:Pick<SkuBinding,'catalogDigest'|'sourceRevision'|'sourceDigest'>,catalog:CatalogSku[],source:SkuSource|null){
  if(input.catalogDigest!==catalogDigest(catalog))fail('sku_catalog_changed',409)
  if(catalog.length){
    if(!source||source.evidenceStatus!=='full_source'||!source.timeline.length)fail('sku_complete_source_required',409)
    if(input.sourceRevision!==source.sourceRevision||input.sourceDigest!==source.sourceDigest)fail('creative_source_changed',409)
  }else if(input.sourceRevision!==null||input.sourceDigest!==null)fail('ordinary_content_source_binding_invalid')
}
function recommendations(value:unknown,catalog:CatalogSku[],source:SkuSource|null):SkuRecommendation[]{
  if(!Array.isArray(value)||value.length>4)fail('sku_recommendations_invalid')
  const ids=new Set<string>(),shots=new Set(source?.timeline.map(s=>s.id)||[])
  for(const r of value){
    if(!r||Object.keys(r).some(k=>!['skuId','skuName','roles','rationale','sourceShotIds'].includes(k))||ids.has(r.skuId)||!catalog.some(s=>s.id===r.skuId&&s.name===r.skuName)||!unique(r.roles,8)||!r.roles.length||!text(r.rationale))fail('sku_recommendation_invalid')
    if(!unique(r.sourceShotIds,10000)||!r.sourceShotIds.length||r.sourceShotIds.some((id:string)=>!shots.has(id)))fail('sku_shot_invalid')
    ids.add(r.skuId)
  }
  return value
}
export function confirmSkuDecision(input:any,catalog:CatalogSku[],source:SkuSource|null,userId:string,expectedRevision:string):ConfirmedSkuDecision{
  checkSkuBinding(input,catalog,source)
  if(!unique(input.selectedSkuIds,4)||catalog.length&&!input.selectedSkuIds.length||!catalog.length&&input.selectedSkuIds.length||input.selectedSkuIds.some((id:string)=>!catalog.some(s=>s.id===id)))fail('sku_selection_invalid')
  const rows=recommendations(input.recommendations,catalog,source)
  if(rows.length!==input.selectedSkuIds.length||rows.some(r=>!input.selectedSkuIds.includes(r.skuId)))fail('sku_selection_mapping_required')
  if(input.adjustmentNote!==undefined&&input.adjustmentNote!==null&&(typeof input.adjustmentNote!=='string'||input.adjustmentNote.length>2000))fail('sku_adjustment_note_invalid')
  const value={status:input.adjustmentNote?.trim()?'adjusted' as const:'confirmed' as const,mode:catalog.length?'source_adaptation' as const:'ordinary_brand_content' as const,recommendations:rows,selectedSkuIds:[...input.selectedSkuIds],adjustmentNote:input.adjustmentNote?.trim()||null,decidedBy:userId,decidedAt:new Date().toISOString(),catalogDigest:catalogDigest(catalog),sourceRevision:source?.sourceRevision||null,sourceDigest:source?.sourceDigest||null,source,basedOnRevision:expectedRevision}
  return {...value,digest:creativeDigest(value)}
}
export function assertConfirmedDecision(decision:any,binding:Pick<SkuBinding,'catalogDigest'|'sourceRevision'|'sourceDigest'>&{decisionDigest:string},catalog:CatalogSku[],source:SkuSource|null):asserts decision is ConfirmedSkuDecision{
  if(typeof binding.decisionDigest!=='string'||!/^[a-f0-9]{64}$/.test(binding.decisionDigest))fail('sku_confirmation_required',409)
  if(!decision||!['confirmed','adjusted'].includes(decision.status)||decision.digest!==binding.decisionDigest||!decision.decidedBy)fail('sku_confirmation_required',409)
  const {digest,...value}=decision
  if(creativeDigest(value)!==digest)fail('sku_decision_changed',409)
  checkSkuBinding(binding,catalog,source)
  if(decision.catalogDigest!==binding.catalogDigest||decision.sourceRevision!==binding.sourceRevision||decision.sourceDigest!==binding.sourceDigest)fail('sku_decision_changed',409)
}
function artifact(content:string,intent:SkuBinding&{kind:string},keys:string[]){
  if(Buffer.byteLength(content)>2*1024*1024)fail('sku_artifact_too_large',413)
  const v=JSON.parse(content)
  if(!v||Object.keys(v).some(k=>!['kind','brandId','creativeId','month','expectedRevision','catalogDigest','sourceRevision','sourceDigest','contextDigest','mode',...keys].includes(k)))fail('sku_proposal_or_adaptation_invalid')
  for(const k of ['kind','brandId','creativeId','month','expectedRevision','catalogDigest','sourceRevision','sourceDigest'] as const)if(v[k]!==intent[k])fail('sku_artifact_binding_mismatch',409)
  if(!/^[a-f0-9]{64}$/.test(v.contextDigest))fail('sku_context_digest_invalid')
  return v
}
export function proposalFrom(content:string,intent:SkuBinding&{kind:string},catalog:CatalogSku[],source:SkuSource|null){
  const v=artifact(content,intent,['recommendations','notice'])
  checkSkuBinding(intent,catalog,source)
  const expectedMode=catalog.length?'source_adaptation':'ordinary_brand_content'
  if(v.mode!==expectedMode||!catalog.length&&v.notice!=='普通品牌内容，非爆款复刻')fail('sku_proposal_mode_invalid')
  const rows=recommendations(v.recommendations,catalog,source)
  if(rows.length<Math.min(2,catalog.length)||rows.length>Math.min(4,catalog.length))fail('sku_proposal_count_invalid')
  return {...v,recommendations:rows}
}
export function adaptationFrom(content:string,intent:SkuBinding&{kind:string;decisionDigest:string},catalog:CatalogSku[],source:SkuSource|null,decision:ConfirmedSkuDecision){
  assertConfirmedDecision(decision,intent,catalog,source)
  const v=artifact(content,intent,['decisionDigest','title','aiCaption','materialRequirements','shots','notice'])
  if(v.decisionDigest!==intent.decisionDigest||v.mode!==decision.mode)fail('sku_decision_changed',409)
  if(!text(v.title,100)||typeof v.aiCaption!=='string'||v.aiCaption.length>800||!Array.isArray(v.materialRequirements)||!v.materialRequirements.length||v.materialRequirements.length>100||v.materialRequirements.some((s:unknown)=>!text(s,2000))||!Array.isArray(v.shots)||!v.shots.length)fail('adapted_script_required')
  if(!catalog.length&&v.notice!=='普通品牌内容，非爆款复刻')fail('ordinary_content_notice_required')
  if(catalog.length&&v.shots.length!==source!.timeline.length)fail('adaptation_shot_coverage_invalid')
  const seen=new Set<string>(),used=new Set<string>()
  const fields=['visualDescription','subjectAction','spokenText','overlayText','soundDesign','transition','narrativePurpose'] as const
  for(const [index,shot] of v.shots.entries()){
    if(!shot||Object.keys(shot).some(k=>!['contractVersion','sourceShotId','skuIds','captionMode','continuityRequirements','sourcePreservation',...fields].includes(k))||shot.contractVersion!==2||!['mirror_spoken','off'].includes(shot.captionMode)||!unique(shot.skuIds,4)||shot.skuIds.some((id:string)=>!decision.selectedSkuIds.includes(id))||!text(shot.visualDescription,10000)||!text(shot.subjectAction,10000)||fields.some(k=>typeof shot[k]!=='string'||shot[k].length>10000)||!Array.isArray(shot.continuityRequirements)||shot.continuityRequirements.length>100||shot.continuityRequirements.some((s:unknown)=>!text(s,2000)))fail('adaptation_shot_invalid')
    const preservation=shot.sourcePreservation
    if(!preservation||Object.keys(preservation).some(k=>!['hookRole','narrativeRole','pacingRole','changeReasons'].includes(k))||!['preserved','adapted','not_applicable'].includes(preservation.hookRole)||!['preserved','adapted'].includes(preservation.narrativeRole)||!['preserved','adapted'].includes(preservation.pacingRole)||!unique(preservation.changeReasons,7)||preservation.changeReasons.some((r:string)=>!Object.hasOwn(SOURCE_ADAPTATION_CHANGE_REASONS,r)))fail('source_preservation_invalid')
    if([preservation.hookRole,preservation.narrativeRole,preservation.pacingRole].includes('adapted')&&!preservation.changeReasons.length)fail('source_change_reason_required')
    if(catalog.length&&(shot.sourceShotId!==source!.timeline[index]?.id||seen.has(shot.sourceShotId)))fail('adaptation_shot_coverage_invalid')
    if(catalog.length){
      const assigned=decision.recommendations.filter(r=>r.sourceShotIds.includes(shot.sourceShotId)).map(r=>r.skuId)
      if(assigned.length!==shot.skuIds.length||assigned.some(id=>!shot.skuIds.includes(id)))fail('adaptation_shot_sku_mapping_changed')
      const original=source!.timeline[index]
      for(const [aliases,field,reason,error] of [
        [['spokenText','voiceover','voiceoverText'],'spokenText','voiceover_removed_for_visual_storytelling','source_voiceover_required'],
        [['overlayText','onScreenText'],'overlayText','overlay_removed_for_visual_storytelling','source_overlay_required'],
        [['soundDesign','sound'],'soundDesign','sound_removed_for_visual_storytelling','source_sound_required'],
        [['transition'],'transition','transition_removed_for_visual_storytelling','source_transition_required'],
      ] as const){
        if(aliases.some(k=>text(original[k],Infinity))&&!shot[field].trim()&&!preservation.changeReasons.includes(reason))fail(error)
      }
      if(text(original.narrativePurpose,Infinity)&&!shot.narrativePurpose.trim())fail('source_narrative_required')
      if(Array.isArray(original.continuityRequirements)&&original.continuityRequirements.some((s:unknown)=>text(s,Infinity))&&!shot.continuityRequirements.length)fail('source_continuity_required')
    }
    if(!shot.spokenText.trim()&&shot.captionMode!=='off')fail('silent_caption_mode_invalid')
    if(!catalog.length&&shot.sourceShotId!==null)fail('ordinary_content_source_claim_invalid')
    seen.add(shot.sourceShotId);shot.skuIds.forEach((id:string)=>used.add(id))
  }
  if(catalog.length&&v.shots.length!==source!.timeline.length||decision.selectedSkuIds.some(id=>!used.has(id)))fail('adaptation_shot_coverage_invalid')
  const rendered=JSON.stringify({title:v.title,aiCaption:v.aiCaption,shots:v.shots,materials:v.materialRequirements})
  const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase()
  let unselectedText=normalize(rendered)
  for(const s of catalog.filter(s=>decision.selectedSkuIds.includes(s.id)).sort((a,b)=>b.name.length-a.name.length))unselectedText=unselectedText.split(normalize(s.name)).join('')
  if(catalog.some(s=>!decision.selectedSkuIds.includes(s.id)&&unselectedText.includes(normalize(s.name))))fail('adaptation_unselected_sku',409)
  for(const id of decision.selectedSkuIds){
    const name=catalog.find(s=>s.id===id)!.name
    if(!v.shots.some((s:AdaptedCreativeShotV2)=>s.skuIds.includes(id)&&fields.some(k=>s[k].includes(name))))fail('adaptation_sku_name_required')
  }
  const shots: Array<AdaptedCreativeShotV2 & {startSec?:number;endSec?:number;shotScale?:string;cameraMovement?:string}>=v.shots.map((s:AdaptedCreativeShotV2,i:number)=>({...s,...(source?{startSec:source.timeline[i].startSec,endSec:source.timeline[i].endSec,shotScale:source.timeline[i].shotScale,cameraMovement:source.timeline[i].cameraMovement}:{})}))
  const planning=[...(catalog.length?[]:['普通品牌内容，非爆款复刻']),...shots.map((s,i)=>`${i+1}. ${s.sourceShotId||'品牌镜头'}${source?` [${s.startSec}–${s.endSec}s] ${s.shotScale||''} ${s.cameraMovement||''}`:''}\n${fields.map(k=>`${k}: ${s[k]}`).join('\n')}\ncaptionMode: ${s.captionMode}\ncontinuityRequirements: ${s.continuityRequirements.join('；')}\nhookRole: ${s.sourcePreservation.hookRole}\nnarrativeRole: ${s.sourcePreservation.narrativeRole}\npacingRole: ${s.sourcePreservation.pacingRole}\nchangeReasons: ${s.sourcePreservation.changeReasons.map(r=>`${r}（${SOURCE_ADAPTATION_CHANGE_REASONS[r]}）`).join('；')}`)].join('\n\n')
  if(planning.length>20000)fail('adaptation_script_too_large',413)
  return {...v,shots,skuIds:decision.selectedSkuIds,patch:{title:v.title,planning,aiCaption:v.aiCaption,materialRequirements:v.materialRequirements}}
}
