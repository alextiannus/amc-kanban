import {creativeWorkspace,creativeDigest} from '../brand-plan/creativeRevisionContract'
import {nativeError} from './contract'
import {creativeDraftMarker,hasCreativeDraftMarker} from '../brand-plan/creativeDraftMarker'
// Called inside the existing authorized content-save transaction, after receipt,
// asset and creative-revision validation. Never schedules or publishes.
export async function reuseIdeaDraft(tx:any,brandId:string,creative:any,generationId:string,data:any){
 const draftId=creative?.calendarSelection?.draftId
 if(!draftId)return null
 await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId"=${brandId} FOR UPDATE`
 const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}}),workspace=creativeWorkspace(knowledge)
 const matches=(Object.values(workspace.publishingCalendar?.months||{}).flat() as any[]).filter(item=>item?.id===creative.id)
 if(matches.length!==1||creativeDigest(matches[0])!==creativeDigest(creative))throw nativeError('autopilot_creative_changed',409)
 await tx.$queryRaw`SELECT "id" FROM "ContentDraft" WHERE "id"=${draftId} FOR UPDATE`
 const draft=await tx.contentDraft.findUnique({where:{id:draftId}})
 if(!draft||draft.brandId!==brandId||!hasCreativeDraftMarker(draft.agentNote,'unscheduled',creative.id))throw nativeError('selected_idea_draft_changed',409)
 if(draft.viralCopyScriptProvenance?.selectedIdeaGeneration===generationId)return draft.id
 if(draft.status!=='planned_unimplemented'||draft.scheduledAt||draft.mediaUrls.length||draft.caption!==`内容创意：${creative.title}`)throw nativeError('selected_idea_draft_changed',409)
 await tx.contentDraft.update({where:{id:draftId},data:{...data,status:'draft',scheduledAt:null,agentNote:creativeDraftMarker('unscheduled',creative.id),viralCopyScriptProvenance:{...data.viralCopyScriptProvenance,selectedIdeaGeneration:generationId}}})
 return draftId
}
