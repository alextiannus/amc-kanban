import {readBoundSkuContext} from '../brand-plan/creativeSkuDecision'
import {proposalFrom,adaptationFrom} from '../brand-plan/creativeSkuContract'
import {digest,nativeError,type SkuIntent} from './contract'

export async function skuTaskContext(intent:SkuIntent){
  const ctx=await readBoundSkuContext({id:intent.userId,type:'HUMAN'},intent)
  const adapting=intent.kind==='creative_adaptation',decision=ctx.current.current.skuDecision
  if(adapting&&!decision)throw nativeError('sku_confirmation_required',409)
  const bindings={kind:intent.kind,...ctx.binding,contextDigest:digest(ctx.facts),mode:ctx.catalog.length?'source_adaptation':'ordinary_brand_content',...(!ctx.catalog.length?{notice:'普通品牌内容，非爆款复刻'}:{})}
  return {intent,contextDigest:digest(ctx.facts),brand:{id:intent.brandId,name:ctx.facts.name,description:ctx.facts.description},source:ctx.source,productCatalog:adapting?ctx.catalog.filter(s=>decision.selectedSkuIds.includes(s.id)):ctx.catalog,decision:adapting?decision:null,artifactContract:{path:intent.artifactPath,instructions:adapting?'Use only the confirmed selected SKU IDs and exact names, consuming the fixed source and decision digest. Return every original source shot once in its original order, with full visual description, subject action, voiceover, onScreenText, sound and transition, plus materialRequirements. Preserve source timing/actions/story. Never include an unselected product. Empty catalog means ordinary brand content, NOT viral replication: sourceShotId must be null and notice must be 普通品牌内容，非爆款复刻. Do not save or publish.':'Recommend 2–4 real catalog SKUs, or one only if the catalog has one. Each requires skuId, exact skuName, roles, rationale and real sourceShotIds. Return ONLY a proposal; no planning, finalScript or materials. Empty catalog requires no recommendations and notice 普通品牌内容，非爆款复刻. Human confirmation is a separate operation.',example:adapting?{...bindings,decisionDigest:intent.decisionDigest,title:'Brand title',aiCaption:'Verified brand copy',materialRequirements:['Film the selected subject and action'],shots:[{sourceShotId:ctx.source?.timeline[0]?.id||null,skuIds:decision.selectedSkuIds,visualDescription:'Complete visual description with exact selected names',subjectAction:'Complete action',voiceover:'',onScreenText:'',sound:'',transition:''}]}:{...bindings,recommendations:ctx.catalog.length?[{skuId:'exact catalog id',skuName:'exact catalog name',roles:['hero'],rationale:'Why this SKU fits the source action',sourceShotIds:['exact source shot ID']}]:[]}}}
}
export async function validateSkuArtifact(content:string,intent:SkuIntent){
  const ctx=await readBoundSkuContext({id:intent.userId,type:'HUMAN'},intent)
  const result=intent.kind==='sku_proposal'?proposalFrom(content,intent,ctx.catalog,ctx.source):adaptationFrom(content,{...intent,decisionDigest:intent.decisionDigest||''},ctx.catalog,ctx.source,ctx.current.current.skuDecision)
  if(result.contextDigest!==digest(ctx.facts))throw nativeError('brand_context_changed',409)
  return {result,ctx}
}
