import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma.ts'
import { readBrandFacts } from '../ai-native/facts.ts'
import { createHash } from 'node:crypto'
import { canUserAccessBrand } from '../user-management/brandAccess.ts'
import { CREATIVE_REVISION_KIND, CreativeRevisionError, creativeDigest, creativeWorkspace, findCreative, monthItems, originalSource, record, revisionPeriod, validateCreativeAddress, validateCreativePatch } from './creativeRevisionContract.ts'

export { CreativeRevisionError } from './creativeRevisionContract.ts'
type Actor = { id: string; type: string }
type AiProvenance = { taskId:string; agentId:string; requestedBy:string; contextDigest:string; artifact:{path:string;revision:number;digest:string} }

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
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
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
    if(ai){
      await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "id" = ${brandId} FOR SHARE`
      const facts=await readBrandFacts(tx,brandId)
      if(createHash('sha256').update(JSON.stringify(facts)).digest('hex')!==ai.contextDigest)throw new CreativeRevisionError('brand_context_changed',409)
    }
    const knowledge = await tx.brandKnowledge.findUnique({where:{brandId}})
    const workspace = creativeWorkspace(knowledge)
    const known = monthItems(workspace,month).find(item=>item.id===creativeId)
    if(seed&&known)throw new CreativeRevisionError('recommendation_already_saved',409)
    const current = seed || findCreative(workspace,month,creativeId)
    if (creativeDigest(current) !== body.expectedRevision) throw new CreativeRevisionError('creative_revision_conflict',409)
    const brand = await tx.brand.findUnique({
      where: { id: brandId },
      select: { id: true, name: true, crew: { select: {
        id: true,
        members: {
          where: { active: true, role: 'PRINCIPAL', user: { type: 'HUMAN', status: 'ACTIVE' } },
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
    const next = {...current,...patch}
    const entry = await tx.brandMarketingSolution.create({data:{brandId,kind:CREATIVE_REVISION_KIND,period,version:revision,status:'DRAFT',generationMode:'MANUAL_EDIT',createdById:user.id,input:{creativeId,month,brand:brandSnapshot,actor:{id:user.id,name:user.nickname || user.id,type:user.type,roles:[user.role,...user.businessRoles.map((role:{role:string})=>role.role)]},principals,origin:ai?'ai_assisted':user.type==='HUMAN'?'human':'agent',...(ai?{ai}:{}),source:parentInput.source,parentRevisionId:parent.id,originalRevisionId:parentInput.originalRevisionId || parent.id,requestKey,requestHash},output:next as Prisma.InputJsonValue}})
    const nextWorkspace = {...workspace,publishingCalendar:{...workspace.publishingCalendar,months:{...workspace.publishingCalendar?.months,[month]:(seed ? [...monthItems(workspace,month),next] : monthItems(workspace,month).map(item=>item.id===creativeId ? next : item))}}}
    await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:nextWorkspace as Prisma.InputJsonValue}})
    await tx.auditLog.create({data:{actorId:user.id,actorType:user.type,actorName:user.nickname,action:'CREATIVE_REVISION_SAVED',resourceType:'BrandCreative',resourceId:creativeId,oldValue:{hash:body.expectedRevision,parentRevisionId:parent.id},newValue:{revisionId:entry.id,revision,hash:creativeDigest(next)},metadata:{brandId,month,...(ai?{ai}:{}),principalIds:principals.map(member=>member.userId),sourceCreativeId:parentInput.source?.creativeId || null}}})
    return {ok:true,replayed:false,receipt:present(entry)}
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
