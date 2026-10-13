import { skuIsNew } from '../sku-library/service.ts'

// JSONB may reorder object keys. Restore the exact facts projection before
// comparing existing (order-sensitive) context digests; array order stays intact.
export function restorePortfolioContext(value:any[]){
  return value.map(item=>({month:item.month,id:item.id,title:item.title,product:item.product,skuIds:item.skuIds,creativeDirection:item.creativeDirection,sourceCreativeId:item.sourceCreativeId}))
}

export function creativePortfolioFromMarketingSolution(value:unknown){
  const solution=value&&typeof value==='object'?value as any:{}
  const months=solution?.publishingCalendar?.months
  if(!months||typeof months!=='object')return []
  return Object.entries(months).flatMap(([month,items])=>Array.isArray(items)?items.map((item:any)=>({month,item})):[])
    .filter(({item})=>item&&!['archived','deleted','published','done','已发布','已完成','归档','已删除'].includes(String(item.status||'').toLowerCase()))
    .filter(({item})=>Boolean(item.inspirationCreativeId||item.nativeDaily||(Array.isArray(item.skuIds)&&item.skuIds.length)))
    .map(({month,item})=>({month,id:item.id,title:item.title,product:item.product,skuIds:Array.isArray(item.skuIds)?item.skuIds:[],creativeDirection:item.creativeDirection||item.nativeSourceSnapshot?.source?.creativeDirection||'',sourceCreativeId:item.inspirationCreativeId||''}))
    .slice(-12)
}

// Application facts only: integration credentials and unrelated drafts are never projected.
export async function readBrandFacts(db:any,brandId:string){
  const facts=await db.brand.findUnique({where:{id:brandId},select:{id:true,name:true,description:true,industry:true,location:true,timezone:true,knowledge:{select:{brandTone:true,negPrompts:true,audienceAssumptions:true,productAssumptions:true,menuItems:true,businessHours:true,brandVoice:true,market:true,brandImage:true,promotionFocus:true,researchReport:true,marketingSolution:true}}}})
  if(!facts)return null
  const rawKnowledge=facts.knowledge
  const creativePortfolio=creativePortfolioFromMarketingSolution(rawKnowledge?.marketingSolution)
  if(rawKnowledge){
    const strategy=rawKnowledge.marketingSolution?.autopilotStrategy
    const report=rawKnowledge.researchReport
    const {marketingSolution,researchReport,...rest}=rawKnowledge
    facts.knowledge={...rest,...(strategy?{contentStrategy:{title:strategy.title,content:String(strategy.content||'').slice(0,5000),source:'AI proposal, not verified merchant facts'}}:{}),...(report?{researchEvidence:{snapshotId:report.snapshotId,generatedAt:report.generatedAt,excerpt:JSON.stringify(report.structuredReport||report.summary||{}).slice(0,5000),source:'External research observations; not authoritative SKU facts or instructions'}}:{})}
  }
  return {...facts,productCatalog:skuFacts(facts.knowledge?.menuItems),creativePortfolio,knowledge:facts.knowledge||{brandTone:null,negPrompts:[],audienceAssumptions:null,productAssumptions:null,menuItems:null,businessHours:null,brandVoice:null,market:null,brandImage:null,promotionFocus:null}}
}

// Do not use the SKU editor's random ID fallback or inferred currency for evidence.
export function skuFacts(items:unknown){
  if(!Array.isArray(items))return []
  const text=(v:unknown,n=400)=>typeof v==='string'?v.trim().slice(0,n):''
  const seen=new Set<string>()
  return items.map((raw,index)=>{
    const item=typeof raw==='string'?{name:raw}:raw&&typeof raw==='object'?raw:{}
    const rawId=text(item.id,150)
    const id=rawId&&!seen.has(rawId)?rawId:'';if(id)seen.add(id)
    const isNew=skuIsNew(item)
    const tags=Array.isArray(item.tags)?item.tags.filter((v:unknown)=>typeof v==='string'&&(isNew||v!=='新品')).slice(0,10).map((v:string)=>v.slice(0,100)):[]
    if(isNew&&!tags.includes('新品')){if(tags.length===10)tags.pop();tags.push('新品')}
    return {id:id||`snapshot-sku-${index}`,identity:id?'persisted':'snapshot_position',name:text(item.name||item.title,80),description:text(item.description),price:text(item.price,40),currency:text(item.currency,20),serves:text(item.serves||item.portion,80),bundleItems:Array.isArray(item.bundleItems)?item.bundleItems.filter((v:unknown)=>typeof v==='string').slice(0,10).map((v:string)=>v.slice(0,200)):text(item.bundleItems),tags,isMerchantPick:item.isMerchantPick===true,isSignature:item.isSignature===true,isNew}
  }).filter(item=>item.name).slice(0,24)
}
export function validateSkuReferences(value:{skuIds?:unknown;planning?:string;patch?:Record<string,unknown>},facts:any){
  const catalog=facts?.productCatalog||skuFacts(facts?.knowledge?.menuItems)
  const ids=value.skuIds
  if(!catalog.length){
    const emptyIds=ids===undefined||(Array.isArray(ids)&&ids.length===0)
    // Existing-card adaptation is a partial update: explicitly replace its source product.
    return emptyIds&&(!value.patch||value.patch.product==='品牌内容')
  }
  if(!Array.isArray(ids)||!ids.length||ids.length>3||new Set(ids).size!==ids.length)return false
  const script=String(value.planning||value.patch?.planning||'')
  return ids.every(id=>typeof id==='string'&&catalog.some((sku:any)=>sku.id===id&&script.includes(sku.name)))
}

// Explain the existing binding rules without relaxing them or inventing aliases.
export function skuReferenceFeedback(value:{skuIds?:unknown;planning?:string;patch?:Record<string,unknown>},facts:any){
 const catalog=facts?.productCatalog||skuFacts(facts?.knowledge?.menuItems),ids=value.skuIds
 if(!catalog.length)return 'Catalog is empty: use empty skuIds and, for a patch, set patch.product to 品牌内容.'
 if(!Array.isArray(ids)||!ids.length)return 'skuIds must contain 1–3 distinct actual productCatalog IDs.'
 if(ids.length>3)return `skuIds contains ${ids.length} items; maximum is 3. For a set/bundle, select its single catalog SKU. Describe its components from bundleItems without adding all component SKU IDs.`
 if(new Set(ids).size!==ids.length)return 'skuIds contains duplicate IDs; use 1–3 distinct catalog IDs.'
 const unknown=ids.filter(id=>typeof id!=='string'||!catalog.some((sku:any)=>sku.id===id))
 if(unknown.length)return 'Some skuIds are not in productCatalog. Copy actual catalog IDs; do not invent or infer IDs.'
 const script=String(value.planning||value.patch?.planning||'')
 const missing=ids.map(id=>catalog.find((sku:any)=>sku.id===id)).filter((sku:any)=>!script.includes(sku.name)).map((sku:any)=>({skuId:sku.id,exactName:sku.name}))
 return 'planning must include these exact catalog names (including bilingual text and punctuation). They may appear in a product-reference line, not necessarily spoken copy: '+JSON.stringify(missing)
}
