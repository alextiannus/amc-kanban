import {CREATIVE_SELECTION_POLICY,creativeSourceId} from './creativeVisibility'
import {resolveCreativeMonth} from './creativeAddress.ts'
import {MATCH_REQUEST_KIND,planningHash,openTargets,requestTargets} from './matchingContract'
import {validateCreativeFeedback,readCreativeFeedback,creativeChanges,creativeCandidateChanges,creativeFeedbackDimensions,CANDIDATE_FEEDBACK_KIND,FEEDBACK_WINDOW,VIDEO_EDIT_FEEDBACK_KIND,VIDEO_FEEDBACK_MAX_BYTES,feedbackCursor,parseFeedbackCursor,summarizeCreativeFeedback} from './revisionFeedback'
import {creativeDirection,duplicateCreative,exceedsCreativeSubjectLimit} from '../ai-native/creative-diversity.ts'
import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma.ts'
import { readBrandFacts, restorePortfolioContext } from '../ai-native/facts.ts'
import { createHash } from 'node:crypto'
import { readPolicies } from '../role-permissions/store.ts'
import { effectiveGrants } from '../role-permissions/contract.ts'
import { principalFromUser } from '../auth-v2/types.ts'
import { canUserAccessBrand } from '../user-management/brandAccess.ts'
import { CREATIVE_REVISION_KIND, CreativeRevisionError, creativeDigest, creativeWorkspace, findCreative, monthItems, originalSource, record, revisionPeriod, revisionSource, validateCreativeAddress, validateCreativeId, validateCreativePatch } from './creativeRevisionContract.ts'
import { normalizeCreativeWorkspaceItem, validateCreativeRevisionClientPatch, validateCreativeWorkspacePatch } from './creativeWorkspaceContract.ts'
import { syncConfirmedCreativeCollection } from './creativeCollections.ts'
import {canonicalCreativeSource} from './creativeSourceReference'
import {confirmSkuDecision, assertConfirmedDecision, skuCatalog, type SkuSource, type SkuBinding} from './creativeSkuContract'
import {beginFidelityAttempt,completeFidelityAttempt,assertPassedQualityReview,type CreativeQualityReview} from './creativeFidelity.ts'

export { CreativeRevisionError } from './creativeRevisionContract.ts'
type Actor = { id: string; type: string }
type AiProvenance = { candidatePatch?:Record<string,unknown>; reviewChanges?:ReturnType<typeof creativeChanges>; adoptionRequest?:{requestKey:string;payloadDigest:string}; skuBinding?:SkuBinding & {decisionDigest:string}; skuSource?:SkuSource|null; contextPortfolio?:any[]; instruction?:string;planningRequest?:{id:string;targetId:string;month:string}; autopilotRunId?:string;automaticDaily?:boolean;poolIdeaId?:string; taskId:string; agentId:string; requestedBy:string; contextDigest:string; artifact:{path:string;revision:number;digest:string} }

async function canEditScript(db: any, user: any, permission='draft.update') {
  const principal = principalFromUser(user, 'session')
  if (principal.globalRoles.includes('ADMIN')) return true
  const { policies } = await readPolicies(db)
  return effectiveGrants((principal.permissionRoleIds || []).filter(id => Object.hasOwn(policies, id)), policies).includes(permission)
}
async function authorize(db: any, actor: Actor, brandId: string, write = false) {
  if (!await canUserAccessBrand(brandId, actor.id, write ? 'WRITE' : 'READ', db)) throw new CreativeRevisionError('creative_access_denied',404)
  const user = await db.user.findUnique({ where: { id: actor.id }, select: { id:true, email:true, authVersion:true, nickname:true, type:true, role:true, status:true, businessRoles:{select:{role:true}}, owner:{select:{id:true,role:true,businessRoles:{select:{role:true}}}} } })
  if (!user || user.status !== 'ACTIVE') throw new CreativeRevisionError('creative_access_denied',404)
  if (write && !await canEditScript(db, user)) throw new CreativeRevisionError('creative_edit_forbidden',403)
  return user
}
function present(row: any) {
  const input = record(row.input)
  return { id:row.id, revision:row.version, parentRevisionId:input.parentRevisionId || null, originalRevisionId:input.originalRevisionId || row.id, createdAt:row.createdAt.toISOString(), actor:input.actor || null, principals:input.principals || [], brand:input.brand, origin:input.origin, ai:input.ai || null, source:revisionSource(record(row.output),input.source,row.createdAt.toISOString()), feedback:readCreativeFeedback(input.feedback), changes:input.changes||[], content:row.output, workspaceItem:normalizeCreativeWorkspaceItem(row.output,{brandId:input.brand?.id,currentRevisionId:row.id,createdAt:row.createdAt.toISOString(),updatedAt:row.createdAt.toISOString()}), contentHash:creativeDigest(row.output) }
}
export async function readCreativeRevisions(actor: Actor, brandId: string, month: string, creativeId: string, revisionId?: string, db = prisma, beforeVersion?: number) {
  validateCreativeId(creativeId)
  if(month)validateCreativeAddress(month, creativeId)
  if (beforeVersion !== undefined && (!Number.isSafeInteger(beforeVersion) || beforeVersion < 0)) throw new CreativeRevisionError('invalid_revision_cursor')
  const reader=await authorize(db,actor,brandId)
  const resolvedKnowledge = !month ? await db.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true,brandPlan:true}}) : undefined
  if(!month)month=await resolveCreativeMonth(db,brandId,creativeId,resolvedKnowledge)
  const brandWrite=await canUserAccessBrand(brandId,actor.id,'WRITE',db)
  const canWrite=brandWrite&&await canEditScript(db,reader)
  const canSchedule=brandWrite&&await canEditScript(db,reader,'content.schedule')
  const period = revisionPeriod(month,creativeId)
  const [knowledge, revisions, brand] = await Promise.all([
    resolvedKnowledge !== undefined ? resolvedKnowledge : db.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true,brandPlan:true}}),
    db.brandMarketingSolution.findMany({where:{brandId,kind:CREATIVE_REVISION_KIND,period,...(revisionId ? {id:revisionId}:beforeVersion !== undefined ? {version:{lt:beforeVersion}}:{})},orderBy:{version:'desc'},take:101}),
    db.brand.findUnique({where:{id:brandId},select:{id:true,name:true}}),
  ])
  if (revisionId && !revisions.length) throw new CreativeRevisionError('creative_revision_not_found',404)
  const latest = revisionId || beforeVersion !== undefined
    ? await db.brandMarketingSolution.findFirst({where:{brandId,kind:CREATIVE_REVISION_KIND,period},orderBy:{version:'desc'}})
    : revisions[0]
  const items = monthItems(creativeWorkspace(knowledge),month)
  const current = items.find(item=>item.id===creativeId) || null
  if (!current && !revisions.length) throw new CreativeRevisionError('creative_not_found_or_ambiguous',404)
  return {ok:true, brand, creativeId, month, current, capabilities:{canSchedule}, workspaceItem:current?normalizeCreativeWorkspaceItem(current,{brandId,currentRevisionId:latest?.id,createdAt:current.createdAt,updatedAt:latest?.createdAt?.toISOString()}):null, currentUser:{id:reader.id,name:reader.nickname||reader.id}, canSaveAsNew:canWrite, canOverwrite:canWrite&&(!current?.scriptOwner?.id||current.scriptOwner.id===actor.id), source:current?revisionSource(current,record(latest?.input).source,new Date().toISOString()):revisions[0]?record(revisions[0].input).source:null, expectedRevision:current ? creativeDigest(current):null, revisions:revisions.slice(0,100).map(present), hasMore:!revisionId && revisions.length>100, nextBeforeVersion:!revisionId && revisions.length>100 ? revisions[99].version : null}
}

const FIDELITY_REVIEW_KIND='CREATIVE_FIDELITY_REVIEW'
const fidelityPeriod=(actor:Actor,taskId:string)=>creativeDigest([actor.id,taskId])
export async function readCreativeQualityReview(actor:Actor,brandId:string,taskId:string,db=prisma):Promise<CreativeQualityReview|null>{
  await authorize(db,actor,brandId)
  const row=await db.brandMarketingSolution.findFirst({where:{brandId,kind:FIDELITY_REVIEW_KIND,period:fidelityPeriod(actor,taskId)},orderBy:{version:'desc'}})
  return record(row?.input).qualityReview||null
}
// Operational review evidence only: this never changes a creative, SKU decision,
// source binding, schedule or draft. Every stage is append-only revision input.
async function mutateCreativeQualityReview(actor:Actor,brandId:string,month:string,creativeId:string,taskId:string,mutate:(previous:CreativeQualityReview|null)=>CreativeQualityReview,db=prisma){
  validateCreativeAddress(month,creativeId)
  return db.$transaction(async (tx:Prisma.TransactionClient)=>{
    await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId" = ${brandId} FOR UPDATE`
    const user=await authorize(tx,actor,brandId,true)
    const period=fidelityPeriod(actor,taskId)
    const previous=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:FIDELITY_REVIEW_KIND,period},orderBy:{version:'desc'}})
    const input=record(previous?.input),state:CreativeQualityReview|null=input.qualityReview||null
    if(previous&&(input.creativeId!==creativeId||input.month!==month||input.taskId!==taskId))throw new CreativeRevisionError('fidelity_binding_changed',409)
    const qualityReview=mutate(state)
    if(state&&creativeDigest(qualityReview)===creativeDigest(state))return state
    await tx.brandMarketingSolution.create({data:{brandId,kind:FIDELITY_REVIEW_KIND,period,version:(previous?.version||0)+1,status:'DRAFT',generationMode:'AI_FIDELITY_REVIEW',createdById:user.id,input:{taskId,creativeId,month,actor:{id:actor.id,type:actor.type},qualityReview:qualityReview as unknown as Prisma.InputJsonValue},output:{}}})
    return qualityReview
  })
}
export async function prepareCreativeQualityReview(actor:Actor,brandId:string,month:string,creativeId:string,taskId:string,source:SkuSource|null,adapted:Parameters<typeof beginFidelityAttempt>[2],artifact:Parameters<typeof beginFidelityAttempt>[3],db=prisma){
  return mutateCreativeQualityReview(actor,brandId,month,creativeId,taskId,previous=>beginFidelityAttempt(previous,source,adapted,artifact),db)
}
export async function classifyCreativeQualityReview(actor:Actor,brandId:string,month:string,creativeId:string,taskId:string,classification:unknown,db=prisma){
  return mutateCreativeQualityReview(actor,brandId,month,creativeId,taskId,previous=>{
    if(!previous)throw new CreativeRevisionError('fidelity_candidate_required',409)
    return completeFidelityAttempt(previous,classification)
  },db)
}
export async function rejectCreativeQualityRepair(actor:Actor,brandId:string,month:string,creativeId:string,taskId:string,content:string,artifact:Parameters<typeof beginFidelityAttempt>[3],issue:string,db=prisma){
  return mutateCreativeQualityReview(actor,brandId,month,creativeId,taskId,previous=>{
    if(!previous)throw new CreativeRevisionError('fidelity_candidate_required',409)
    if(previous.status==='needs_revision'&&previous.attempts.at(-1)?.artifact.digest===artifact.digest)return previous
    if(previous.status!=='repair_required')throw new CreativeRevisionError('fidelity_repair_limit',409)
    const pending=beginFidelityAttempt(previous,previous.attempts[0].source,{shots:[],rawArtifact:content,validationError:issue},artifact)
    return completeFidelityAttempt(pending,{candidateDigest:artifact.digest,dimensions:pending.attempts[0].review!.dimensions.map(d=>({key:d.key,status:'failed',issues:[issue]}))})
  },db)
}

export async function saveCreativeRevision(actor: Actor, brandId: string, month: string, creativeId: string, body: any, db = prisma, ai?:AiProvenance & {qualityReview?:CreativeQualityReview}, seed?:Record<string,any>, skuConfirmation?:{input:any;source?:SkuSource|null;resolveSource?:()=>Promise<SkuSource|null>}) {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['expectedRevision','idempotencyKey','patch','feedback','saveMode'].includes(key)))throw new CreativeRevisionError('invalid_creative_revision_request')
  validateCreativeAddress(month,creativeId)
  if (typeof body?.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedRevision) || typeof body?.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) throw new CreativeRevisionError('creative_revision_and_request_key_required')
  if(body?.saveMode!==undefined&&!['copy','overwrite'].includes(body.saveMode))throw new CreativeRevisionError('invalid_script_save_mode')
  const copy=body.saveMode==='copy'
  if(copy&&seed)throw new CreativeRevisionError('invalid_script_save_mode')
  const sourceCreativeId=creativeId
  const clientPatch = skuConfirmation ? {patch:{}} : ai ? {patch:seed?validateCreativeWorkspacePatch(body.patch):validateCreativePatch(body.patch,month)} : validateCreativeRevisionClientPatch(body.patch,month)
  const patch: Record<string, any> = clientPatch.patch
  const feedback=validateCreativeFeedback(body.feedback)
  const requestKey = creativeDigest([actor.id,body.idempotencyKey])
  if(copy)creativeId=`script_${creativeDigest([brandId,month,sourceCreativeId,requestKey]).slice(0,32)}`
  // Derived review metadata and instruction never change pre-upgrade retry hashes.
  const {instruction:_instruction,reviewChanges:_reviewChanges,candidatePatch:_candidatePatch,...hashAi}=ai||{}
  const requestHash = creativeDigest({...(body.saveMode?{saveMode:body.saveMode,sourceCreativeId}:{}),expectedRevision:body.expectedRevision,patch,...(skuConfirmation?{skuConfirmation:skuConfirmation.input}:{}),...('legacyProduct' in clientPatch?{legacyProduct:clientPatch.legacyProduct}:{}),...(feedback?{feedback}:{}),...(ai?{ai:hashAi}:{}),...(seed?{month,creativeId}:{})})
  const period = revisionPeriod(month,creativeId)
  const saved = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Internal library enrollment uses the same lock, revision chain and audit as manual edits.
    if(seed){
      await authorize(tx,actor,brandId,true)
      await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,negPrompts:[]},update:{brandId}})
    }
    // All saves for this brand serialize before reading the current card or version.
    await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId" = ${brandId} FOR UPDATE`
    const user = await authorize(tx,actor,brandId,true)
    if(skuConfirmation&&user.type!=='HUMAN')throw new CreativeRevisionError('human_sku_confirmation_required',403)
    // Every candidate adoption (including automatic paths) shares this brand
    // lock with discard. Task/artifact identity is authoritative across copies.
    if(ai&&await tx.brandMarketingSolution.findFirst({where:{brandId,kind:CANDIDATE_FEEDBACK_KIND,AND:[{input:{path:['taskId'],equals:ai.taskId}},{input:{path:['artifact','digest'],equals:ai.artifact.digest}}]}}))throw new CreativeRevisionError('candidate_already_discarded',409)
    const existing = await tx.brandMarketingSolution.findFirst({where:{brandId,kind:CREATIVE_REVISION_KIND,...(seed||body.saveMode?{}:{period}),input:{path:['requestKey'],equals:requestKey}}})
    if (existing) {
      if (record(existing.input).requestHash !== requestHash) throw new CreativeRevisionError('creative_request_key_reused',409)
      return {ok:true,replayed:true,receipt:present(existing)}
    }
    let currentFacts:any=null
    if(ai){
      await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "id" = ${brandId} FOR SHARE`
      currentFacts=await readBrandFacts(tx,brandId)
      // A batch adds to its own portfolio. Revalidate merchant facts against the
      // trusted original portfolio; current duplicates/SKU limits are checked below.
      const evidenceFacts=ai.planningRequest&&Array.isArray(ai.contextPortfolio)?{...currentFacts,creativePortfolio:restorePortfolioContext(ai.contextPortfolio)}:currentFacts
      if(createHash('sha256').update(JSON.stringify(evidenceFacts)).digest('hex')!==ai.contextDigest)throw new CreativeRevisionError('brand_context_changed',409)
    }
    const knowledge = await tx.brandKnowledge.findUnique({where:{brandId}})
    const workspace = creativeWorkspace(knowledge)
    if(ai?.planningRequest){
      const binding=ai.planningRequest
      const request=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:MATCH_REQUEST_KIND,period:month},orderBy:{version:'desc'}})
      const input=record(request?.input)
      if(!seed||request?.id!==binding.id||input.requestedBy!==actor.id||input.planHash!==planningHash(workspace))throw new CreativeRevisionError('planning_request_changed',409)
      const brand=await tx.brand.findUniqueOrThrow({where:{id:brandId},select:{status:true}})
      if(brand.status!=='ACTIVE')throw new CreativeRevisionError('planning_request_changed',409)
      const targets=openTargets(requestTargets(input),monthItems(workspace,month))
      if(!targets.some(target=>target.id===binding.targetId&&patch.platformTargets?.includes(target.platform)))throw new CreativeRevisionError('planning_target_filled',409)
      const existing=Object.values(workspace.publishingCalendar?.months||{}).flat() as any[]
      if(existing.some(item=>duplicateCreative(seed,item)))throw new CreativeRevisionError('planning_duplicate_source',409)
    }
    if(ai?.autopilotRunId){
      const granted:any[]=await tx.$queryRaw`SELECT s.brand_id FROM amc_iaic.autopilot_settings s JOIN amc_iaic.autopilot_runs r ON r.brand_id=s.brand_id WHERE r.id=${ai.autopilotRunId} AND s.brand_id=${brandId} AND s.enabled=true AND s.owner_id=${actor.id} AND r.owner_id=${actor.id} AND r.account_id=s.account_id FOR SHARE OF s`
      if(!granted.length||!await tx.crewMember.findFirst({where:{userId:actor.id,active:true,role:{in:['PRINCIPAL','OWNER']},crew:{brandId,brand:{status:'ACTIVE'}}}}))throw new CreativeRevisionError('autopilot_authority_revoked',403)
    }
    if(ai?.automaticDaily){
      if(!seed||!ai.poolIdeaId||!await tx.crewMember.findFirst({where:{userId:actor.id,active:true,role:{in:['PRINCIPAL','OWNER']},crew:{brandId,brand:{status:'ACTIVE'}}}}))throw new CreativeRevisionError('daily_planning_authority_revoked',403)
      const active:any[]=await tx.$queryRaw`SELECT id,source FROM amc_iaic.brand_ideas WHERE brand_id=${brandId} AND replaced_at IS NULL FOR SHARE`
      if(!active.some(row=>row.id===ai.poolIdeaId))throw new CreativeRevisionError('daily_idea_replaced',409)
      const ids=new Set(active.map(row=>row.id))
      await retireDailyPlans(tx,workspace,brandId,user,ids)
    }
    if(ai&&seed){
      const retained=monthItems(workspace,month).filter((item:any)=>item&&!['archived','deleted','published','done','已发布','已完成','归档','已删除'].includes(String(item.status||'').toLowerCase())) as any[]
      const reviewedSeed={...seed,...patch}
      if(retained.some(item=>duplicateCreative(reviewedSeed,item)))throw new CreativeRevisionError('creative_duplicate',409)
      if(exceedsCreativeSubjectLimit(reviewedSeed,retained,currentFacts?.productCatalog||[]))throw new CreativeRevisionError('creative_subject_limit',409)
      if(ai.automaticDaily&&retained.filter(item=>creativeDirection(item)===creativeDirection(reviewedSeed)).length>=2)throw new CreativeRevisionError('creative_direction_limit',409)
    }
    const known = monthItems(workspace,month).find(item=>item.id===creativeId)
    if(seed&&known)throw new CreativeRevisionError('recommendation_already_saved',409)
    const current = seed || findCreative(workspace,month,sourceCreativeId)
    if(!copy&&current.scriptOwner?.id&&current.scriptOwner.id!==actor.id)throw new CreativeRevisionError('script_owner_required',403)
    if (creativeDigest(current) !== body.expectedRevision) throw new CreativeRevisionError('creative_revision_conflict',409)
    // The same brand knowledge row contains the authoritative catalog. Validation
    // happens under its write lock, after current permissions and CAS, before audit.
    const confirmationCatalog=skuConfirmation?skuCatalog(await readBrandFacts(tx,brandId)):null
    const confirmationSource=skuConfirmation&&confirmationCatalog!.length?(skuConfirmation.resolveSource?await skuConfirmation.resolveSource():skuConfirmation.source||null):null
    const skuDecision=skuConfirmation ? confirmSkuDecision(skuConfirmation.input,confirmationCatalog!,confirmationSource,user.id,body.expectedRevision) : null
    if(ai?.autopilotRunId&&!ai.skuBinding)throw new CreativeRevisionError('sku_confirmation_required_use_creative_adaptation',409)
    if(ai?.skuBinding){
      assertConfirmedDecision(current.skuDecision,ai.skuBinding,skuCatalog(currentFacts),ai.skuSource||null)
      assertPassedQualityReview(ai.qualityReview,ai.artifact.digest)
      if(creativeDigest(validateCreativePatch(ai.qualityReview!.attempts.at(-1)!.adapted.patch,month))!==creativeDigest(patch))throw new CreativeRevisionError('creative_fidelity_candidate_changed',409)
    }
    if(ai&&!ai.skuBinding&&!seed&&['awaiting_sku','sku_confirmed'].includes(current.adaptationStatus)&&patch.planning!==undefined&&patch.planning!==current.planning)throw new CreativeRevisionError('sku_confirmation_required_use_creative_adaptation',409)
    const brand = await tx.brand.findUnique({
      where: { id: brandId },
      select: { id: true, name: true, crew: { select: {
        id: true,
        members: {
          where: { active: true, role: {in:['PRINCIPAL','OWNER']}, user: { type: 'HUMAN', status: 'ACTIVE' } },
          select: { id: true, userId: true, role: true, updatedAt: true, user: { select: { nickname: true } } },
        },
      } } },
    })
    if (!brand) throw new CreativeRevisionError('creative_access_denied',404)
    const principals = (brand.crew?.members || []).map(member=>({membershipId:member.id,crewId:brand.crew!.id,userId:member.userId,name:member.user.nickname || member.userId,role:member.role,relationUpdatedAt:member.updatedAt.toISOString()}))
    const brandSnapshot = {id:brand.id,name:brand.name}
    let parent = await tx.brandMarketingSolution.findFirst({where:{brandId,kind:CREATIVE_REVISION_KIND,period},orderBy:{version:'desc'}})
    if (!parent) {
      parent = await tx.brandMarketingSolution.create({data:{brandId,kind:CREATIVE_REVISION_KIND,period,version:0,status:'BASELINE',generationMode:seed?'AI_LIBRARY_RECOMMENDATION':'LEGACY_SNAPSHOT',input:{creativeId,month,brand:brandSnapshot,actor:null,principals:[],origin:seed?'library_recommendation':'legacy_unknown',source:originalSource(current,new Date().toISOString())},output:current as Prisma.InputJsonValue}})
    }
    const parentInput = record(parent.input)
    const revision = parent.version+1
    const normalized = normalizeCreativeWorkspaceItem(current,{brandId})
    const verifiedSource=skuConfirmation
      ? canonicalCreativeSource(confirmationSource,current.inspirationCreativeId,new Date().toISOString(),normalized.source||record(current.nativeSourceSnapshot))
      : seed&&ai ? canonicalCreativeSource(record(current.nativeSourceSnapshot).source,current.inspirationCreativeId,record(current.nativeSourceSnapshot).retrievedAt||new Date().toISOString(),record(current.nativeSourceSnapshot))
      : ai?.skuBinding&&!normalized.source ? canonicalCreativeSource(ai.skuSource,current.inspirationCreativeId,new Date().toISOString(),record(current.nativeSourceSnapshot)) : null
    const next:Record<string,any> = {...current,...patch,brandId,
      status:patch.status || normalized.status,
      platformTargets:patch.platformTargets || (patch.platform ? [patch.platform] : normalized.platformTargets),
      source:verifiedSource||normalized.source,skuDecision:skuDecision||normalized.skuDecision,
      schedule:normalized.schedule,derivedFromCreativeId:normalized.derivedFromCreativeId,
      ...(normalized.legacy?{legacy:normalized.legacy}:{}),
      ...('legacyProduct' in clientPatch?{product:clientPatch.legacyProduct}:{}),
      createdAt:normalized.createdAt || new Date().toISOString(),updatedAt:new Date().toISOString(),
      ...((current.nativeDaily||current.planningRequest)&&!ai?.automaticDaily&&!ai?.autopilotRunId&&!ai?.planningRequest?{nativeReviewStatus:'reviewed'}:{})}
    if(skuDecision){next.skuIds=skuDecision.selectedSkuIds;next.product=skuDecision.recommendations.map(r=>r.skuName).join(' / ')||'品牌内容';next.adaptationStatus='sku_confirmed'}
    if(ai?.skuBinding)next.adaptationStatus='adapted'
    // Calendar fields are historical input. A revision is an undated creative until
    // the explicit scheduling service links a real draft and its revision.
    for(const key of ['date','platform','platformSlug'])delete next[key]
    if(body.saveMode)next.aiTags=Array.isArray(current.aiTags)?current.aiTags:[]
    if(copy){
      next.id=creativeId
      next.aiTags=Array.isArray(current.aiTags)?current.aiTags:[]
      next.scriptOwner={id:user.id,name:user.nickname||user.id}
      next.copiedFrom={creativeId:sourceCreativeId,month,contentHash:body.expectedRevision}
      next.derivedFromCreativeId=sourceCreativeId
      next.createdAt=new Date().toISOString()
      next.schedule=null
      next.status='idea_pending'
      // A new creative inherits lineage and source evidence, never the source
      // card's historical calendar placement or status.
      for(const key of ['legacy','nativeDaily','planningRequest','nativeReviewStatus','draftId','publishedAt'])delete next[key]
    }else if(body.saveMode==='overwrite'&&!next.scriptOwner){next.scriptOwner={id:user.id,name:user.nickname||user.id}}
    if((next.nativeDaily||next.planningRequest)&&next.adaptationStatus!=='awaiting_sku'&&!skuConfirmation&&!next.materialRequirements?.some((item:string)=>item.trim()))throw new CreativeRevisionError('material_requirements_required')
    const automatic=ai?.automaticDaily===true||!!ai?.autopilotRunId||!!ai?.planningRequest
    if(seed&&automatic&&typeof current.nativeSourceSnapshot?.source?.matchScore==='number'&&current.nativeSourceSnapshot.source.matchScore>=90&&!Object.values(workspace.publishingCalendar?.months||{}).flat().some((i:any)=>creativeSourceId(i)===creativeSourceId(current)))next.creativeBrowserSelection={policy:CREATIVE_SELECTION_POLICY,reason:'automatic_high_match',at:new Date().toISOString(),by:user.id}
    const revisionActor=automatic?{id:'amc-mm-user-ai',name:'AMC-MM AI User Assistant',type:'AI',authorizedBy:user.id}:{id:user.id,name:user.nickname || user.id,type:user.type,roles:[user.role,...user.businessRoles.map((role:{role:string})=>role.role)]}
    const sourceReference=revisionSource(next,parentInput.source,new Date().toISOString())
    const {candidatePatch,...aiMetadata}=ai||{}
    const persistedAi=ai?{...aiMetadata,...(candidatePatch?{reviewChanges:creativeCandidateChanges(current,candidatePatch,next,month,!!body.saveMode)}:{})}:undefined
    const entry = await tx.brandMarketingSolution.create({data:{brandId,kind:CREATIVE_REVISION_KIND,period,version:revision,status:'DRAFT',generationMode:ai?.planningRequest?'AI_PLAN_MATCHING':ai?.autopilotRunId?'AI_AUTOPILOT_ADAPTATION':automatic?'AI_DAILY_ADAPTATION':'MANUAL_EDIT',createdById:user.id,input:{creativeId,month,brand:brandSnapshot,actor:revisionActor,principals,origin:ai?.planningRequest?'plan_matching':ai?.autopilotRunId?'automatic_user_ai_adaptation':automatic?'automatic_daily_adaptation':ai?'ai_assisted':user.type==='HUMAN'?'human':'agent',...(persistedAi?{ai:persistedAi}:{}),feedback:feedback||null,changes:creativeChanges(current,next),dimensions:creativeFeedbackDimensions(next,sourceReference),source:sourceReference,parentRevisionId:parent.id,originalRevisionId:parentInput.originalRevisionId || parent.id,requestKey,requestHash},output:next as Prisma.InputJsonValue}})
    const nextWorkspace = {...workspace,publishingCalendar:{...workspace.publishingCalendar,months:{...workspace.publishingCalendar?.months,[month]:(seed||copy ? [...monthItems(workspace,month),next] : monthItems(workspace,month).map(item=>item.id===creativeId ? next : item))}}}
    await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:nextWorkspace as Prisma.InputJsonValue}})
    await tx.auditLog.create({data:{actorId:user.id,actorType:automatic?'AI':user.type,actorName:automatic?'AMC-MM AI User Assistant':user.nickname,action:'CREATIVE_REVISION_SAVED',resourceType:'BrandCreative',resourceId:creativeId,oldValue:{hash:body.expectedRevision,parentRevisionId:parent.id},newValue:{revisionId:entry.id,revision,hash:creativeDigest(next)},metadata:{brandId,month,...(persistedAi?{ai:persistedAi}:{}),principalIds:principals.map(member=>member.userId),sourceCreativeId:sourceReference.creativeId || null}}})
    return {ok:true,replayed:false,receipt:present(entry)}
  },{maxWait:10000,timeout:15000})
  if (db === prisma) {
    try {
      await syncConfirmedCreativeCollection({
        brandId,
        creativeId,
        creativeVersion: saved.receipt.revision,
        month,
        creative: saved.receipt.content,
        createdById: actor.id,
      })
    } catch (error) {
      console.error('[creative asset collection] sync failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }
  return saved
}

// Only bounded explicit text-change evidence and minimal review/shot metadata
// cross the database boundary. Never load planning, snapshots, notes or prompts.
export async function readCreativeFeedbackSummary(actor:Actor,brandId:string,cursor?:string|null,db=prisma){
  await authorize(db,actor,brandId)
  const before=parseFeedbackCursor(cursor)
  const rows:any[]=await db.$queryRaw`
    WITH revision_window AS (
      SELECT * FROM (
        (SELECT id,kind,version,"createdAt",input,output FROM "BrandMarketingSolution"
         WHERE "brandId"=${brandId} AND kind=${CREATIVE_REVISION_KIND}
         AND (${before?.createdAt??null}::timestamp IS NULL OR ("createdAt",id)<(${before?.createdAt??null}::timestamp,${before?.id??''}))
         ORDER BY "createdAt" DESC,id DESC LIMIT ${FEEDBACK_WINDOW+1})
        UNION ALL
        (SELECT id,kind,version,"createdAt",input,output FROM "BrandMarketingSolution"
         WHERE "brandId"=${brandId} AND kind=${CANDIDATE_FEEDBACK_KIND}
         AND (${before?.createdAt??null}::timestamp IS NULL OR ("createdAt",id)<(${before?.createdAt??null}::timestamp,${before?.id??''}))
         ORDER BY "createdAt" DESC,id DESC LIMIT ${FEEDBACK_WINDOW+1})
        UNION ALL
        (SELECT id,kind,version,"createdAt",input,output FROM "BrandMarketingSolution"
         WHERE "brandId"=${brandId} AND kind=${FIDELITY_REVIEW_KIND}
         AND (${before?.createdAt??null}::timestamp IS NULL OR ("createdAt",id)<(${before?.createdAt??null}::timestamp,${before?.id??''}))
         ORDER BY "createdAt" DESC,id DESC LIMIT ${FEEDBACK_WINDOW+1})
        UNION ALL
        (SELECT id,kind,version,"createdAt",input,output FROM "BrandMarketingSolution"
         WHERE "brandId"=${brandId} AND kind=${VIDEO_EDIT_FEEDBACK_KIND}
         AND (${before?.createdAt??null}::timestamp IS NULL OR ("createdAt",id)<(${before?.createdAt??null}::timestamp,${before?.id??''}))
         ORDER BY "createdAt" DESC,id DESC LIMIT ${FEEDBACK_WINDOW+1})
      ) events ORDER BY "createdAt" DESC,id DESC LIMIT ${FEEDBACK_WINDOW+1}
    ), aggregate_window AS (
      SELECT *,COALESCE(input->'qualityReview',input->'ai'->'qualityReview') AS quality
      FROM revision_window
    )
    SELECT id,kind,version,"createdAt",jsonb_build_object(
      'creativeId',input->'creativeId','month',input->'month',
      'schema',CASE WHEN input->>'schema'='video_feedback_event@1' THEN input->'schema' END,
      'eventId',CASE WHEN length(input->>'eventId')<=200 THEN input->'eventId' END,
      'taskId',CASE WHEN length(COALESCE(input->>'taskId',input->'ai'->>'taskId'))<=200 THEN COALESCE(input->'taskId',input->'ai'->'taskId') END,
      'actor',jsonb_build_object('type',input->'actor'->'type'),
      'event',input->'event','candidateKey',input->'candidateKey',
      'videoFeedback',CASE WHEN octet_length((input->'videoFeedback')::text)<=${VIDEO_FEEDBACK_MAX_BYTES} THEN input->'videoFeedback' END,
      'qualityReview',CASE WHEN quality->'version'='1'::jsonb AND jsonb_typeof(quality->'attempts')='array' THEN jsonb_build_object('version',1,'attempts',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'artifact',jsonb_build_object(
            'path',CASE WHEN length(a->'artifact'->>'path')<=200 THEN a->'artifact'->'path' END,
            'digest',CASE WHEN length(a->'artifact'->>'digest')<=200 THEN a->'artifact'->'digest' END,
            'revision',CASE WHEN octet_length((a->'artifact'->'revision')::text)<=16 THEN a->'artifact'->'revision' END),
          'classification',jsonb_build_object('candidateDigest',CASE WHEN length(a->'classification'->>'candidateDigest')<=200 THEN a->'classification'->'candidateDigest' END),
          'review',jsonb_build_object('status',CASE WHEN a->'review'->>'status' IN ('passed','failed') THEN a->'review'->'status' END),
          'adapted',jsonb_build_object('shots',
            (SELECT COALESCE(jsonb_agg(jsonb_build_object('contractVersion',s->'contractVersion','sourceShotId',CASE WHEN length(s->>'sourceShotId')<=200 THEN s->'sourceShotId' END)),'[]'::jsonb)
             FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a->'adapted'->'shots')='array' THEN CASE WHEN jsonb_array_length(a->'adapted'->'shots')<=100 THEN a->'adapted'->'shots' ELSE '[]'::jsonb END ELSE '[]'::jsonb END) s))
        )),'[]'::jsonb) FROM jsonb_array_elements(CASE WHEN jsonb_array_length(quality->'attempts')<=2 THEN quality->'attempts' ELSE '[]'::jsonb END) a)) ELSE NULL END,
      'changes',CASE WHEN jsonb_typeof(input->'changes')='array' THEN
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('field',CASE WHEN length(c->>'field')<=200 THEN c->'field' END)),'[]'::jsonb) FROM jsonb_array_elements(input->'changes') WITH ORDINALITY e(c,n) WHERE n<=100) ELSE NULL END,
      'feedback',jsonb_build_object('reasons',CASE WHEN octet_length((input->'feedback'->'reasons')::text)<=4096 THEN input->'feedback'->'reasons' END),
      'ai',CASE WHEN jsonb_typeof(input->'ai')='object' THEN jsonb_build_object('reviewChanges',
        CASE WHEN jsonb_typeof(input->'ai'->'reviewChanges')='array' THEN
          (SELECT COALESCE(jsonb_agg(jsonb_build_object('field',CASE WHEN length(c->>'field')<=200 THEN c->'field' END)),'[]'::jsonb) FROM jsonb_array_elements(input->'ai'->'reviewChanges') WITH ORDINALITY e(c,n) WHERE n<=100) ELSE NULL END) ELSE NULL END,
      'dimensions',COALESCE(CASE WHEN octet_length((input->'dimensions')::text)<=65536 THEN input->'dimensions' END,jsonb_build_object(
        'source',jsonb_build_array(COALESCE(output->'source'->'inspirationCreativeId',input->'source'->'creativeId',output->'inspirationCreativeId')),
        'sku',COALESCE(output->'skuDecision'->'selectedSkuIds',output->'skuIds','[]'::jsonb),
        'platform',COALESCE(output->'platformTargets',jsonb_build_array(COALESCE(output->'platformSlug',output->'platform'))),
        'contentType',jsonb_build_array(output->'contentType')))
    ) AS input FROM aggregate_window ORDER BY "createdAt" DESC,id DESC`
  const window=rows.slice(0,FEEDBACK_WINDOW)
  return {...summarizeCreativeFeedback(window),sampleVersions:window.length,scope:'revision_event_window',windowLimit:FEEDBACK_WINDOW,hasMore:rows.length>FEEDBACK_WINDOW,nextCursor:rows.length>FEEDBACK_WINDOW?feedbackCursor(window[window.length-1]):null}
}

export async function recordCreativeCandidateDiscard(actor:Actor,brandId:string,body:any,resolveCandidate:()=>Promise<any>,db=prisma){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['action','month','creativeId','taskId','artifactDigest','expectedRevision','idempotencyKey','feedback'].includes(key))||body.action!=='discard_candidate')throw new CreativeRevisionError('invalid_candidate_feedback')
  const {month,creativeId,taskId,artifactDigest}=body
  if(typeof month!=='string'||typeof creativeId!=='string')throw new CreativeRevisionError('invalid_creative_address')
  validateCreativeAddress(month,creativeId)
  if(typeof taskId!=='string'||!taskId||taskId.length>200||typeof artifactDigest!=='string'||!artifactDigest||artifactDigest.length>200)throw new CreativeRevisionError('invalid_candidate_feedback')
  if(typeof body.expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(body.expectedRevision)||typeof body.idempotencyKey!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey))throw new CreativeRevisionError('creative_revision_and_request_key_required')
  const feedback=validateCreativeFeedback(body.feedback),requestKey=creativeDigest([actor.id,body.idempotencyKey])
  const candidateKey=creativeDigest([brandId,month,creativeId,actor.id,taskId,artifactDigest])
  const requestHash=creativeDigest({month,creativeId,taskId,artifactDigest,expectedRevision:body.expectedRevision,feedback})
  const presentEvent=(row:any)=>({id:row.id,kind:CANDIDATE_FEEDBACK_KIND,creativeId,month,candidateKey,createdAt:row.createdAt.toISOString()})
  return db.$transaction(async(tx:Prisma.TransactionClient)=>{
    await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId"=${brandId} FOR UPDATE`
    const user=await authorize(tx,actor,brandId,true)
    if(user.type!=='HUMAN')throw new CreativeRevisionError('human_feedback_required',403)
    const prior=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:CANDIDATE_FEEDBACK_KIND,OR:[{period:candidateKey},{input:{path:['requestKey'],equals:requestKey}}]}})
    if(prior){if(record(prior.input).requestKey!==requestKey||record(prior.input).requestHash!==requestHash)throw new CreativeRevisionError('creative_request_key_reused',409);return {ok:true,replayed:true,receipt:presentEvent(prior)}}
    const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}}),current=findCreative(creativeWorkspace(knowledge),month,creativeId)
    if(current.scriptOwner?.id&&current.scriptOwner.id!==user.id)throw new CreativeRevisionError('script_owner_required',403)
    if(creativeDigest(current)!==body.expectedRevision)throw new CreativeRevisionError('creative_revision_conflict',409)
    const candidate=await resolveCandidate()
    if(candidate?.status!=='succeeded'||!['creative','creative_adaptation'].includes(candidate.kind)||candidate.creativeId!==creativeId||candidate.month!==month||candidate.candidate?.expectedRevision!==body.expectedRevision||candidate.artifact?.digest!==artifactDigest)throw new CreativeRevisionError('candidate_changed',409)
    const adopted=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:CREATIVE_REVISION_KIND,AND:[{input:{path:['ai','taskId'],equals:taskId}},{input:{path:['ai','artifact','digest'],equals:artifactDigest}}]}})
    if(adopted)throw new CreativeRevisionError('candidate_already_adopted',409)
    const entry=await tx.brandMarketingSolution.create({data:{brandId,kind:CANDIDATE_FEEDBACK_KIND,period:candidateKey,version:1,status:'DISCARDED',generationMode:'HUMAN_FEEDBACK',createdById:user.id,input:{event:'candidate_discarded',creativeId,month,candidateKey,taskId,artifact:candidate.artifact,actor:{id:user.id,type:user.type},feedback,dimensions:creativeFeedbackDimensions(current),expectedRevision:body.expectedRevision,requestKey,requestHash},output:{}}})
    await tx.auditLog.create({data:{actorId:user.id,actorType:user.type,action:'CREATIVE_CANDIDATE_DISCARDED',resourceType:'BrandCreative',resourceId:creativeId,metadata:{brandId,month,eventId:entry.id,taskId,artifactDigest}}})
    const verified=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:CANDIDATE_FEEDBACK_KIND,id:entry.id}})
    if(!verified||record(verified.input).requestHash!==requestHash)throw new CreativeRevisionError('creative_feedback_unverified',503)
    return {ok:true,replayed:false,receipt:presentEvent(verified)}
  },{maxWait:10000,timeout:15000})
}

// A legacy month replacement cannot bypass the revision service after enrollment.
export async function protectTrackedCreativeChanges(brandId: string, current: any, next: any, db = prisma) {
  const tracked = await db.brandMarketingSolution.findMany({where:{brandId,kind:CREATIVE_REVISION_KIND},distinct:['period'],select:{input:true}})
  for (const row of tracked) {
    const {month,creativeId} = record(row.input)
    const before = monthItems(current,month).find(item=>item.id===creativeId)
    const after = monthItems(next,month).find(item=>item.id===creativeId)
    if (creativeDigest(before) !== creativeDigest(after)) throw new CreativeRevisionError('tracked_creative_requires_revision_save',409)
  }
}

async function retireDailyPlans(tx:Prisma.TransactionClient,workspace:any,brandId:string,user:any,ids:Set<string>){
      let changed=0
      // Retire only unreviewed automatic drafts; retain every revision and every human edit.
      for(const [oldMonth,items] of Object.entries(workspace.publishingCalendar?.months||{})){
        if(!Array.isArray(items))continue
        for(let i=0;i<items.length;i++){
          const item=items[i]
          if(!item.nativeDaily||item.nativeReviewStatus!=='pending_review'||ids.has(item.nativeDaily.poolIdeaId)||item.status==='archived')continue
          const oldPeriod=revisionPeriod(oldMonth,item.id)
          const parent=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:CREATIVE_REVISION_KIND,period:oldPeriod},orderBy:{version:'desc'}})
          if(!parent)continue
          const next={...item,status:'archived'},input=record(parent.input)
          await tx.brandMarketingSolution.create({data:{brandId,kind:CREATIVE_REVISION_KIND,period:oldPeriod,version:parent.version+1,status:'ARCHIVED',generationMode:'AI_DAILY_REPLACEMENT',createdById:user.id,input:{...input,actor:{id:'amc-mm-user-ai',type:'AI',name:'AMC-MM AI User Assistant'},origin:'automatic_daily_retirement',parentRevisionId:parent.id,requestKey:creativeDigest(['daily-retire',item.id]),requestHash:creativeDigest(next)},output:next}})
          await tx.auditLog.create({data:{actorId:user.id,actorType:'AI',actorName:'AMC-MM AI User Assistant',action:'DAILY_CREATIVE_RETIRED',resourceType:'BrandCreative',resourceId:item.id,metadata:{brandId,principalId:user.id,poolIdeaId:item.nativeDaily.poolIdeaId}}})
          items[i]=next;changed++
        }
      }
 return changed
}

export async function reconcileRetiredDailyPlans(brandId:string,userId:string){
 return prisma.$transaction(async (tx:Prisma.TransactionClient)=>{
  await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId"=${brandId} FOR UPDATE`
  const user=await authorize(tx,{id:userId,type:'HUMAN'},brandId,true)
  const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}})
  if(!knowledge)return
  const workspace=creativeWorkspace(knowledge)
  const active:any[]=await tx.$queryRaw`SELECT id FROM amc_iaic.brand_ideas WHERE brand_id=${brandId} AND replaced_at IS NULL FOR SHARE`
  const changed=await retireDailyPlans(tx,workspace,brandId,user,new Set(active.map(row=>row.id)))
  if(changed)await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:workspace}})
 },{maxWait:10000,timeout:15000})
}
