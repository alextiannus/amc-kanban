/** Shared by explicit refresh and nightly prefetch; no model calls or writes. */
export function brainstormMatchRequest(facts:any,keywords:string,requestId:string,excluded:string[],directionCounts?:Record<string,number>){
 return {merchantId:facts.id,merchantName:facts.name,merchantCategory:facts.industry||'',promotionPointId:requestId,
  promotionGoal:'寻找适合品牌的原创意，保留原脚本供创意浏览，不改写脚本。'+(keywords?` 匹配主题关键词：${JSON.stringify(keywords)}。`:''),
  sellingPoint:[keywords,facts.name,facts.description,...(facts.productCatalog||[]).slice(0,8).map((s:any)=>s.name)].filter(Boolean).join('；').slice(0,4000),
  requestedCandidateCount:8,minimumMatchScore:75,requirePersistedCreative:true,excludeCreativeIds:excluded,
  platforms:['instagram','tiktok','xiaohongshu'],diversify:true,...(directionCounts?{directionCounts}:{})}
}
