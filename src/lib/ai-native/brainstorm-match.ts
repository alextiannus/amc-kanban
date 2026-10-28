export const BRAINSTORM_KEYWORD_POLICY='brand-products-and-selling-points-v1'
const generic=new Set(['品牌','产品','商品','服务','特色','卖点','主打','招牌','新品','商家主推','热销','高复购','餐饮','美食','餐厅','品牌内容','内容','提供','我们','客户','消费者','以及','通过','可以','进行','优质','专业','体验','brand','product','products','service','services','food','restaurant','the','and','with','for','our','your','from','that','this','have','are'])
const segmenter=new Intl.Segmenter('zh',{granularity:'word'})
const text=(value:unknown)=>typeof value==='string'?value.trim().replace(/\s+/g,' '):''
function phrases(value:unknown):string[]{
 return text(value).split(/[,，;；\n。.!！?？|、]+/).flatMap(part=>{
  const phrase=part.trim().replace(/^(?:品牌特点|产品卖点|主要卖点|特色|卖点|主打产品|主打|主营|提供)\s*[:：]?\s*/,'')
  if(!phrase||/https?:|@|(?:不要|禁止|避免|不提供|不售卖|不适合|不包含|不使用)|\b(?:avoid|not|without)\b/i.test(phrase))return []
  if(phrase.length<=32)return [phrase]
  // Long prose is not a useful chip/query. Select only literal words from the
  // supplied facts, never inferred benefits, model proposals or research claims.
  return Array.from(segmenter.segment(phrase)).filter(s=>s.isWordLike).map(s=>s.segment).filter(s=>s.length>=2)
 }).filter(value=>value.length>=2&&!generic.has(value.toLowerCase())&&!/^\d[\d\s.$%+-]*$/.test(value))
}
export function brainstormMatchingTags(facts:any,keywords:string):string[]{
 if(keywords.trim())return [...new Set(keywords.split(/[,，;；\n]+/).map(s=>s.trim()).filter(Boolean))].slice(0,32)
 const catalog=Array.isArray(facts?.productCatalog)?facts.productCatalog:[]
 const priority=[...catalog].sort((a,b)=>Number(!!b.isSignature||!!b.isMerchantPick)-Number(!!a.isSignature||!!a.isMerchantPick)).slice(0,4)
 const products=priority.flatMap(s=>phrases(s.name)),features=priority.flatMap(s=>[...(s.tags||[]).flatMap(phrases),...phrases(s.description)]).slice(0,4)
 const candidates=[...products,...phrases(facts?.knowledge?.productAssumptions).slice(0,4),...features,...phrases(facts?.knowledge?.promotionFocus).slice(0,3),...phrases(facts?.description).slice(0,6)]
 const result:string[]=[],seen=new Set<string>();let length=0
 for(const phrase of candidates){const key=phrase.toLowerCase();if(seen.has(key)||length+phrase.length>280)continue;seen.add(key);result.push(phrase);length+=phrase.length+1;if(result.length===12)break}
 // Sparse profiles still use truthful identifying context instead of invented
 // products. Unverified research and AI strategy never enter this projection.
 if(!result.length)for(const value of [facts?.industry,facts?.name]){const v=text(value);if(v&&!result.includes(v))result.push(v)}
 return result.slice(0,12)
}
/** Shared by explicit refresh and nightly prefetch; no model calls or writes. */
export function brainstormMatchRequest(facts:any,keywords:string,requestId:string,excluded:string[],directionCounts?:Record<string,number>){
 const matching=keywords||brainstormMatchingTags(facts,'').join('，')
 return {merchantId:facts.id,merchantName:facts.name,merchantCategory:facts.industry||'',promotionPointId:requestId,
  promotionGoal:'寻找适合品牌的原创意，保留原脚本供创意浏览，不改写脚本。'+(matching?` 匹配主题关键词：${JSON.stringify(matching)}。`:''),
  sellingPoint:[matching,facts.name,facts.description,...(facts.productCatalog||[]).slice(0,8).map((s:any)=>s.name)].filter(Boolean).join('；').slice(0,4000),
  requestedCandidateCount:8,minimumMatchScore:75,requirePersistedCreative:true,excludeCreativeIds:excluded,
  platforms:['instagram','tiktok','xiaohongshu'],diversify:true,diversityMode:'prefer',...(directionCounts?{directionCounts}:{})}
}
