import {creativeDirection,duplicateCreative,exceedsCreativeSubjectLimit} from '../ai-native/creative-diversity.ts'
import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma.ts'
import { readBrandFacts } from '../ai-native/facts.ts'
import { createHash } from 'node:crypto'
import { canUserAccessBrand } from '../user-management/brandAccess.ts'
import { CREATIVE_REVISION_KIND, CreativeRevisionError, creativeDigest, creativeWorkspace, findCreative, monthItems, originalSource, record, revisionPeriod, validateCreativeAddress, validateCreativePatch } from './creativeRevisionContract.ts'
import { syncConfirmedCreativeCollection } from './creativeCollections.ts'

export { CreativeRevisionError } from './creativeRevisionContract.ts'
type Actor = { id: string; type: string }
type AiProvenance = { autopilotRunId?:string;automaticDaily?:boolean;poolIdeaId?:string; taskId:string; agentId:string; requestedBy:string; contextDigest:string; artifact:{path:string;revision:number;digest:string} }

async function authorize(db: any, actor: Actor, brandId: string, write = false) {
  if (!await canUserAccessBrand(brandId, actor.id, write ? 'WRITE' : 'READ', db)) throw new CreativeRevisionError('creative_access_denied',404)
  const user = await db.user.findUnique({ where: { id: actor.id }, select: { id:true, nickname:true, type:true, role:true, status:true, businessRoles:{select:{role:true}} } })
  if (!user || user.status !== 'ACTIVE') throw new CreativeRevisionError('creative_access_denied',404)
  return user
}
function present(row: any) {
  const input = record(row.input)
  return { id:row.id, revision:row.version, parentRevisionId:input.parentRevisionId || null, originalRevisionId:input.originalRevisionId || row.id, createdAt:row.createdAt.toISOString(), actor:input.actor || null, principals:input.principals || [], brand:input.brand, origin:input.origin, ai:input.ai || null, source:input.source, content:row.output, contentHash:creativeDigest(row.output) }
}
export async function readCreativeRevisions(actor: Actor, brandId: string, month: string, creativeId: string, revisionId?: string, db = prisma, beforeVersion?: number) {
  validateCreativeAddress(month, creativeId)
  if (beforeVersion !== undefined && (!Number.isSafeInteger(beforeVersion) || beforeVersion < 0)) throw new CreativeRevisionError('invalid_revision_cursor')
  await authorize(db,actor,brandId)
  const period = revisionPeriod(month,creativeId)
  const [knowledge, revisions, brand] = await Promise.all([
    db.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true,brandPlan:true}}),
    db.brandMarketingSolution.findMany({where:{brandId,kind:CREATIVE_REVISION_KIND,period,...(revisionId ? {id:revisionId}:beforeVersion !== undefined ? {version:{lt:beforeVersion}}:{})},orderBy:{version:'desc'},take:101}),
    db.brand.findUnique({where:{id:brandId},select:{id:true,name:true}}),
  ])
  if (revisionId && !revisions.length) throw new CreativeRevisionError('creative_revision_not_found',404)
  const items = monthItems(creativeWorkspace(knowledge),month)
  const current = items.find(item=>item.id===creativeId) || null
  if (!current && !revisions.length) throw new CreativeRevisionError('creative_not_found_or_ambiguous',404)
  return {ok:true, brand, creativeId, month, current, expectedRevision:current ? creativeDigest(current):null, revisions:revisions.slice(0,100).map(present), hasMore:!revisionId && revisions.length>100, nextBeforeVersion:!revisionId && revisions.length>100 ? revisions[99].version : null}
}

export async function saveCreativeRevision(actor: Actor, brandId: string, month: string, creativeId: string, body: any, db = prisma, ai?:AiProvenance, seed?:Record<string,any>) {
  validateCreativeAddress(month,creativeId)
  if (typeof body?.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedRevision) || typeof body?.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) throw new CreativeRevisionError('creative_revision_and_request_key_required')
  const patch = validateCreativePatch(body.patch,month)
  const requestKey = creativeDigest([actor.id,body.idempotencyKey])
  const requestHash = creativeDigest({expectedRevision:body.expectedRevision,patch,...(ai?{ai}:{}),...(seed?{month,creativeId}:{})})
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
    const existing = await tx.brandMarketingSolution.findFirst({where:{brandId,kind:CREATIVE_REVISION_KIND,...(seed?{}:{period}),input:{path:['requestKey'],equals:requestKey}}})
    if (existing) {
      if (record(existing.input).requestHash !== requestHash) throw new CreativeRevisionError('creative_request_key_reused',409)
      return {ok:true,replayed:true,receipt:present(existing)}
    }
    let currentFacts:any=null
    if(ai){
      await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "id" = ${brandId} FOR SHARE`
      currentFacts=await readBrandFacts(tx,brandId)
      if(createHash('sha256').update(JSON.stringify(currentFacts)).digest('hex')!==ai.contextDigest)throw new CreativeRevisionError('brand_context_changed',409)
    }
    const knowledge = await tx.brandKnowledge.findUnique({where:{brandId}})
    const workspace = creativeWorkspace(knowledge)
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
    const current = seed || findCreative(workspace,month,creativeId)
    if (creativeDigest(current) !== body.expectedRevision) throw new CreativeRevisionError('creative_revision_conflict',409)
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
    const next:Record<string,any> = {...current,...patch,...(current.nativeDaily&&!ai?.automaticDaily&&!ai?.autopilotRunId?{nativeReviewStatus:'reviewed',status:'planned_unimplemented'}:{})}
    if(next.nativeDaily&&!next.materialRequirements?.some((item:string)=>item.trim()))throw new CreativeRevisionError('material_requirements_required')
    const automatic=ai?.automaticDaily===true||!!ai?.autopilotRunId
    const revisionActor=automatic?{id:'amc-mm-user-ai',name:'AMC-MM AI User Assistant',type:'AI',authorizedBy:user.id}:{id:user.id,name:user.nickname || user.id,type:user.type,roles:[user.role,...user.businessRoles.map((role:{role:string})=>role.role)]}
    const entry = await tx.brandMarketingSolution.create({data:{brandId,kind:CREATIVE_REVISION_KIND,period,version:revision,status:'DRAFT',generationMode:ai?.autopilotRunId?'AI_AUTOPILOT_ADAPTATION':automatic?'AI_DAILY_ADAPTATION':'MANUAL_EDIT',createdById:user.id,input:{creativeId,month,brand:brandSnapshot,actor:revisionActor,principals,origin:ai?.autopilotRunId?'automatic_user_ai_adaptation':automatic?'automatic_daily_adaptation':ai?'ai_assisted':user.type==='HUMAN'?'human':'agent',...(ai?{ai}:{}),source:parentInput.source,parentRevisionId:parent.id,originalRevisionId:parentInput.originalRevisionId || parent.id,requestKey,requestHash},output:next as Prisma.InputJsonValue}})
    const nextWorkspace = {...workspace,publishingCalendar:{...workspace.publishingCalendar,months:{...workspace.publishingCalendar?.months,[month]:(seed ? [...monthItems(workspace,month),next] : monthItems(workspace,month).map(item=>item.id===creativeId ? next : item))}}}
    await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:nextWorkspace as Prisma.InputJsonValue}})
    await tx.auditLog.create({data:{actorId:user.id,actorType:automatic?'AI':user.type,actorName:automatic?'AMC-MM AI User Assistant':user.nickname,action:'CREATIVE_REVISION_SAVED',resourceType:'BrandCreative',resourceId:creativeId,oldValue:{hash:body.expectedRevision,parentRevisionId:parent.id},newValue:{revisionId:entry.id,revision,hash:creativeDigest(next)},metadata:{brandId,month,...(ai?{ai}:{}),principalIds:principals.map(member=>member.userId),sourceCreativeId:parentInput.source?.creativeId || null}}})
    return {ok:true,replayed:false,receipt:present(entry)}
  },{maxWait:10000,timeout:15000})
  if (db === prisma) {
    const receipt = (saved as any).receipt
    await syncConfirmedCreativeCollection({ brandId, month, creativeId, creativeVersion: receipt?.revision || 0, creative: receipt?.content, createdById: actor.id }).catch(error => console.error('[creative-collections] sync failed', error))
  }
  return saved
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
