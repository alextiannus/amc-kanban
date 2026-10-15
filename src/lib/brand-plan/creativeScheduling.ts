import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma.ts'
import { canUserAccessBrand } from '../user-management/brandAccess.ts'
import { readPolicies } from '../role-permissions/store.ts'
import { effectiveGrants } from '../role-permissions/contract.ts'
import { principalFromUser } from '../auth-v2/types.ts'
import { calendarSyncMarker } from './calendarSync.ts'
import { CREATIVE_REVISION_KIND, CreativeRevisionError, creativeDigest, creativeWorkspace, findCreative, monthItems, record, revisionPeriod, validateCreativeAddress } from './creativeRevisionContract.ts'
import { normalizeCreativeWorkspaceItem, type CreativeScheduleLink } from './creativeWorkspaceContract.ts'

type Actor = { id: string; type: string }
type ScheduleInput = { platform: string; scheduledAt: string | null; idempotencyKey: string; accountId?: string }
type RequestInput = { idempotencyKey: string }
const platforms: Record<string,string> = {
  instagram:'instagram', ig:'instagram', tiktok:'tiktok', facebook:'facebook', fb:'facebook',
  xiaohongshu:'xiaohongshu', xhs:'xiaohongshu', rednote:'xiaohongshu',
  google:'google_business', google_business:'google_business', gbp:'google_business',
}
const requestKeyPattern = /^[a-zA-Z0-9_-]{8,100}$/
const revisionPattern = /^[a-f0-9]{64}$/

export function validateScheduleInput(value: unknown, now = new Date()): ScheduleInput {
  const input = record(value)
  if (Object.keys(input).some(key => !['platform','scheduledAt','idempotencyKey','accountId'].includes(key))) throw new CreativeRevisionError('invalid_schedule_input')
  const platform = typeof input.platform === 'string' ? platforms[input.platform.trim().toLowerCase()] : undefined
  if (!platform || typeof input.idempotencyKey !== 'string' || !requestKeyPattern.test(input.idempotencyKey)) throw new CreativeRevisionError('invalid_schedule_input')
  if (input.accountId !== undefined && (typeof input.accountId !== 'string' || !input.accountId.trim() || input.accountId.length > 200)) throw new CreativeRevisionError('invalid_schedule_input')
  if (input.scheduledAt !== null && (typeof input.scheduledAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(input.scheduledAt))) throw new CreativeRevisionError('invalid_schedule_time')
  const scheduledAt = input.scheduledAt === null ? null : new Date(input.scheduledAt)
  if (scheduledAt && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= now.getTime())) throw new CreativeRevisionError('invalid_schedule_time')
  return {platform,scheduledAt:scheduledAt?.toISOString() ?? null,idempotencyKey:input.idempotencyKey,...(input.accountId?{accountId:input.accountId.trim()}:{})}
}

function validateRequest(expectedRevision: unknown, input: unknown): RequestInput {
  const body = record(input)
  if (typeof expectedRevision !== 'string' || !revisionPattern.test(expectedRevision) || typeof body.idempotencyKey !== 'string' || !requestKeyPattern.test(body.idempotencyKey)) throw new CreativeRevisionError('creative_revision_and_request_key_required')
  return {idempotencyKey:body.idempotencyKey}
}

async function authorize(tx: Prisma.TransactionClient, actor: Actor, brandId: string) {
  if (!await canUserAccessBrand(brandId,actor.id,'WRITE',tx)) throw new CreativeRevisionError('creative_access_denied',404)
  const user = await tx.user.findUnique({where:{id:actor.id},select:{id:true,type:true,role:true,status:true,nickname:true,email:true,authVersion:true,businessRoles:{select:{role:true}},owner:{select:{id:true,role:true,businessRoles:{select:{role:true}}}}}})
  if (!user || user.status !== 'ACTIVE') throw new CreativeRevisionError('creative_access_denied',404)
  const principal = principalFromUser(user,'session')
  const {policies} = await readPolicies(tx)
  const grants = effectiveGrants((principal.permissionRoleIds || []).filter(id => Object.hasOwn(policies,id)),policies)
  if (!principal.globalRoles.includes('ADMIN') && !grants.includes('content.schedule')) throw new CreativeRevisionError('creative_schedule_forbidden',403)
  return user
}

function nextWorkspace(workspace: any, month: string, creativeId: string, item: Record<string,any>) {
  return {...workspace,publishingCalendar:{...workspace.publishingCalendar,months:{...workspace.publishingCalendar?.months,[month]:monthItems(workspace,month).map(row => row.id === creativeId ? item : row)}}}
}

function draftMarker(creativeId: string, revisionId: string) {
  return `${calendarSyncMarker(creativeId)} creative-revision:${revisionId}`
}

async function writeSchedule(actor: Actor, brandId: string, creativeId: string, expectedRevision: string, input: unknown, unschedule: boolean, db = prisma, now = new Date()) {
  const body = record(input)
  const {idempotencyKey} = validateRequest(expectedRevision,body)
  const month = body.month
  validateCreativeAddress(month,creativeId)
  const schedule = unschedule ? null : validateScheduleInput({platform:body.platform,scheduledAt:body.scheduledAt,idempotencyKey:body.idempotencyKey,...(body.accountId?{accountId:body.accountId}:{})},now)
  if (unschedule && Object.keys(body).some(key => !['month','idempotencyKey'].includes(key))) throw new CreativeRevisionError('invalid_schedule_input')
  const requestKey = creativeDigest([actor.id,idempotencyKey])
  const requestHash = creativeDigest({brandId,creativeId,month,expectedRevision,operation:unschedule?'unschedule':'schedule',schedule})
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId" = ${brandId} FOR UPDATE`
    const user = await authorize(tx,actor,brandId)
    const oldReceipt = await tx.auditLog.findFirst({where:{resourceType:'BrandCreative',resourceId:creativeId,action:{in:['CREATIVE_SCHEDULED','CREATIVE_UNSCHEDULED']},metadata:{path:['requestKey'],equals:requestKey}}})
    if (oldReceipt) {
      if (record(oldReceipt.metadata).requestHash !== requestHash) throw new CreativeRevisionError('creative_request_key_reused',409)
      return {...record(oldReceipt.newValue).result,replayed:true}
    }
    const knowledge = await tx.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true,brandPlan:true}})
    const workspace = creativeWorkspace(knowledge)
    const current = findCreative(workspace,month,creativeId)
    if (creativeDigest(current) !== expectedRevision) throw new CreativeRevisionError('creative_revision_conflict',409)
    const normalized = normalizeCreativeWorkspaceItem(current,{brandId})
    if (normalized.status === 'archived') throw new CreativeRevisionError('creative_archived',409)
    const previous = normalized.schedule
    if (unschedule && !previous) throw new CreativeRevisionError('creative_not_scheduled',409)
    let draft: {id:string;brandId:string;status:string;agentNote:string|null} | null = null
    if (previous) {
      await tx.$queryRaw`SELECT "id" FROM "ContentDraft" WHERE "id" = ${previous.draftId} FOR UPDATE`
      draft = await tx.contentDraft.findUnique({where:{id:previous.draftId},select:{id:true,brandId:true,status:true,agentNote:true}})
      if (!draft || draft.brandId !== brandId || !draft.agentNote?.includes(calendarSyncMarker(creativeId))) throw new CreativeRevisionError('creative_schedule_draft_missing',409)
      if (!['draft','pending_review','planned_unimplemented','needs_materials','needs_revision'].includes(draft.status)) throw new CreativeRevisionError('creative_schedule_locked',409)
    }
    let link: CreativeScheduleLink | null = null
    if (schedule) {
      const accounts = await tx.socialAccount.findMany({where:{brandId,unboundAt:null,...(schedule.accountId?{id:schedule.accountId}:{})},select:{id:true,platformId:true}})
      const matching = accounts.filter(account => platforms[account.platformId.toLowerCase()] === schedule.platform)
      if (matching.length !== 1) throw new CreativeRevisionError(matching.length?'schedule_account_ambiguous':'schedule_account_not_found',409)
      const latest = await tx.brandMarketingSolution.findFirst({where:{brandId,kind:CREATIVE_REVISION_KIND,period:revisionPeriod(month,creativeId)},orderBy:{version:'desc'},select:{id:true}})
      const revision = latest || await tx.brandMarketingSolution.create({data:{brandId,kind:CREATIVE_REVISION_KIND,period:revisionPeriod(month,creativeId),version:0,status:'BASELINE',generationMode:'LEGACY_SNAPSHOT',input:{creativeId,month,actor:null,origin:'legacy_unknown'},output:current as Prisma.InputJsonValue},select:{id:true}})
      const marker = draftMarker(creativeId,revision.id)
      // A time choice is not publication approval. The ordinary approve flow
      // owns transitions to the provider-facing scheduled state.
      const status = 'draft'
      const saved = draft
        ? await tx.contentDraft.update({where:{id:draft.id},data:{accountId:matching[0].id,scheduledAt:schedule.scheduledAt?new Date(schedule.scheduledAt):null,status,agentNote:marker},select:{id:true}})
        : await tx.contentDraft.create({data:{brandId,accountId:matching[0].id,caption:normalized.aiCaption || normalized.planning || normalized.title,captionLang:'zh',mediaUrls:[],hashtags:[],scheduledAt:schedule.scheduledAt?new Date(schedule.scheduledAt):null,status,agentNote:marker},select:{id:true}})
      link = {draftId:saved.id,scheduledAt:schedule.scheduledAt,platform:schedule.platform,scheduledBy:user.id,scheduledAtRevisionId:revision.id}
    } else if (draft) {
      await tx.contentDraft.update({where:{id:draft.id},data:{scheduledAt:null,status:'draft',agentNote:draft.agentNote?.replace(draftMarker(creativeId,previous!.scheduledAtRevisionId),'').trim() || null}})
    }
    const next = {...current,schedule:link,updatedAt:now.toISOString()}
    await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:nextWorkspace(workspace,month,creativeId,next) as Prisma.InputJsonValue}})
    const verifiedKnowledge = await tx.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true,brandPlan:true}})
    const verified = findCreative(creativeWorkspace(verifiedKnowledge),month,creativeId)
    const verifiedDraft = await tx.contentDraft.findUnique({where:{id:link?.draftId || previous!.draftId},select:{id:true,status:true,scheduledAt:true,agentNote:true}})
    if (creativeDigest(verified) !== creativeDigest(next) || !verifiedDraft
      || (link ? verifiedDraft.agentNote !== draftMarker(creativeId,link.scheduledAtRevisionId)
        || verifiedDraft.scheduledAt?.toISOString() !== link.scheduledAt && !(verifiedDraft.scheduledAt === null && link.scheduledAt === null)
        : verifiedDraft.scheduledAt !== null || verifiedDraft.agentNote?.includes(calendarSyncMarker(creativeId)))) {
      throw new CreativeRevisionError('creative_schedule_write_unverified',503)
    }
    const result = {ok:true,replayed:false,creativeId,month,schedule:link,expectedRevision:creativeDigest(next),currentRevisionId:link?.scheduledAtRevisionId || null,draftId:link?.draftId || previous?.draftId || null}
    await tx.auditLog.create({data:{actorId:user.id,actorType:user.type,actorName:user.nickname,action:unschedule?'CREATIVE_UNSCHEDULED':'CREATIVE_SCHEDULED',resourceType:'BrandCreative',resourceId:creativeId,oldValue:{schedule:previous,hash:expectedRevision},newValue:{result},metadata:{brandId,month,requestKey,requestHash}}})
    return result
  },{maxWait:10000,timeout:15000})
}

export function scheduleCreative(actor: Actor, brandId: string, creativeId: string, expectedRevision: string, input: ScheduleInput & {month:string}, db = prisma, now = new Date()) {
  return writeSchedule(actor,brandId,creativeId,expectedRevision,input,false,db,now)
}
export function unscheduleCreative(actor: Actor, brandId: string, creativeId: string, expectedRevision: string, input: RequestInput & {month:string}, db = prisma, now = new Date()) {
  return writeSchedule(actor,brandId,creativeId,expectedRevision,input,true,db,now)
}
