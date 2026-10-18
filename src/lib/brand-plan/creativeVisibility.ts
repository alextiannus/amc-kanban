/** Keep brand decisions beside the saved creative; never erase source/history. */
export function dislikedCreativeSources(workspace:any):Set<string>{
 const items:any[]=Object.values(workspace?.publishingCalendar?.months||{}).flat() as any[]
 return new Set(items.filter(i=>i?.brandDismissal?.decision==='dislike').flatMap(i=>[i.brandDismissal.sourceId,i.inspirationCreativeId,i.source?.inspirationCreativeId,i.nativeSourceSnapshot?.source?.inspirationCreativeId]).filter((id:any)=>typeof id==='string'&&/^cre_[a-zA-Z0-9_-]+$/.test(id)))
}
export const creativeIsVisible=(item:any)=>!!item&&item.brandDismissal?.decision!=='dislike'
/** Decision history outlives calendar buckets and also covers browsing dislikes. */
export async function readDislikedCreativeSources(db:any,brandId:string,workspace:any){
 const result=dislikedCreativeSources(workspace)
 const rows=await db.brandMarketingSolution.findMany({where:{brandId,kind:'BRAINSTORM_DECISION',input:{path:['decision'],equals:'dislike'}},select:{period:true},distinct:['period']})
 for(const row of rows)if(typeof row.period==='string'&&/^cre_[a-zA-Z0-9_-]+$/.test(row.period))result.add(row.period)
 return new Set([...result].sort())
}
