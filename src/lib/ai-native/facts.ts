// Application facts only: integration credentials and unrelated drafts are never projected.
export async function readBrandFacts(db:any,brandId:string){
  const facts=await db.brand.findUnique({where:{id:brandId},select:{id:true,name:true,description:true,industry:true,location:true,timezone:true,knowledge:{select:{brandTone:true,negPrompts:true,audienceAssumptions:true,productAssumptions:true,menuItems:true,businessHours:true,brandVoice:true,market:true,brandImage:true,promotionFocus:true}}}})
  if(!facts)return null
  return {...facts,productCatalog:skuFacts(facts.knowledge?.menuItems),knowledge:facts.knowledge||{brandTone:null,negPrompts:[],audienceAssumptions:null,productAssumptions:null,menuItems:null,businessHours:null,brandVoice:null,market:null,brandImage:null,promotionFocus:null}}
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
    return {id:id||`snapshot-sku-${index}`,identity:id?'persisted':'snapshot_position',name:text(item.name||item.title,80),description:text(item.description),price:text(item.price,40),currency:text(item.currency,20),serves:text(item.serves||item.portion,80),bundleItems:Array.isArray(item.bundleItems)?item.bundleItems.filter((v:unknown)=>typeof v==='string').slice(0,10).map((v:string)=>v.slice(0,200)):text(item.bundleItems),tags:Array.isArray(item.tags)?item.tags.filter((v:unknown)=>typeof v==='string').slice(0,10).map((v:string)=>v.slice(0,100)):[],isMerchantPick:item.isMerchantPick===true,isSignature:item.isSignature===true}
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
