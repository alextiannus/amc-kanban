import {creativeDraftMarker} from './creativeDraftMarker'
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

// The rollout intentionally returns every previous selection to browsing.
// This server-owned version is only issued by a fresh choice or new >=90 match.
export const creativeSourceId=(item:any)=>item?.inspirationCreativeId||item?.source?.inspirationCreativeId||item?.nativeSourceSnapshot?.source?.inspirationCreativeId||null
export const CREATIVE_SELECTION_POLICY='creative-browser-v2'
export const creativeIsSelected=(item:any)=>creativeIsVisible(item)&&item?.creativeBrowserSelection?.policy===CREATIVE_SELECTION_POLICY&&['like','automatic_high_match'].includes(item.creativeBrowserSelection.reason)

/** Hide only untouched legacy selection placeholders; preserve real work and rows. */
export function returnedCreativePlaceholderFilters(workspace:any){
 return Object.values(workspace?.publishingCalendar?.months||{}).flat().filter((item:any)=>item?.calendarSelection?.draftId&&!creativeIsSelected(item)).map((item:any)=>({id:item.calendarSelection.draftId,caption:`内容创意：${item.title}`,agentNote:creativeDraftMarker('unscheduled',item.id),status:'planned_unimplemented',mediaUrls:{isEmpty:true},scheduledAt:null,publishedAt:null,assetRefs:{none:{}}}))
}
