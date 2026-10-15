import {prisma} from '../prisma'
import {readBrandFacts} from '../ai-native/facts'
import {readCreativeRevisions,saveCreativeRevision} from './creativeRevisions'
import {readCreativeSource} from './creativeSource'
import {CreativeRevisionError} from './creativeRevisionContract'
import {skuCatalog,catalogDigest,assertConfirmedDecision,checkSkuBinding,type SkuBinding} from './creativeSkuContract'

type Actor={id:string;type:string}
export async function readSkuContext(actor:Actor,brandId:string,month:string,creativeId:string,db=prisma){
  const current=await readCreativeRevisions(actor,brandId,month,creativeId,undefined,db)
  const item=current.current
  if(!item||!current.expectedRevision)throw new CreativeRevisionError('creative_not_found_or_ambiguous',404)
  const facts=await readBrandFacts(db,brandId),catalog=skuCatalog(facts)
  // An empty catalog explicitly selects ordinary content; it never claims a source.
  const source=catalog.length?await readCreativeSource(actor,brandId,month,creativeId):null
  if(source&&source.evidenceStatus!=='full_source')throw new CreativeRevisionError('sku_complete_source_required',409)
  return {current:{...current,current:item},facts,catalog,source,binding:{brandId,creativeId,month,expectedRevision:current.expectedRevision,catalogDigest:catalogDigest(catalog),sourceRevision:source?.sourceRevision||null,sourceDigest:source?.sourceDigest||null}}
}
export async function readSkuDecision(actor:Actor,brandId:string,month:string,creativeId:string){
  const ctx=await readSkuContext(actor,brandId,month,creativeId)
  return {ok:true,...ctx.binding,catalog:ctx.catalog,source:ctx.source,decision:ctx.current.current.skuDecision||null,adaptationStatus:ctx.current.current.adaptationStatus||null,canConfirm:actor.type==='HUMAN'&&ctx.current.canOverwrite}
}
export async function saveSkuDecision(actor:Actor,brandId:string,creativeId:string,expectedRevision:string,input:any,db=prisma){
  if(actor.type!=='HUMAN')throw new CreativeRevisionError('human_sku_confirmation_required',403)
  const allowed=['month','idempotencyKey','catalogDigest','sourceRevision','sourceDigest','selectedSkuIds','recommendations','adjustmentNote']
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!allowed.includes(k)))throw new CreativeRevisionError('invalid_sku_decision')
  const ctx=await readSkuContext(actor,brandId,input.month,creativeId,db)
  return saveCreativeRevision(actor,brandId,input.month,creativeId,{expectedRevision,idempotencyKey:input.idempotencyKey,patch:{}},db,undefined,undefined,{input,source:ctx.source})
}
export async function readBoundSkuContext(actor:Actor,binding:SkuBinding&{decisionDigest?:string}){
  const ctx=await readSkuContext(actor,binding.brandId,binding.month,binding.creativeId)
  if(ctx.binding.expectedRevision!==binding.expectedRevision)throw new CreativeRevisionError('creative_revision_conflict',409)
  checkSkuBinding(binding,ctx.catalog,ctx.source)
  if(binding.decisionDigest)assertConfirmedDecision(ctx.current.current.skuDecision,{...binding,decisionDigest:binding.decisionDigest},ctx.catalog,ctx.source)
  return ctx
}
