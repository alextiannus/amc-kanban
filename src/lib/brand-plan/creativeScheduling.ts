import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma.ts'
import { canUserAccessBrand } from '../user-management/brandAccess.ts'
import { readPolicies } from '../role-permissions/store.ts'
import { effectiveGrants } from '../role-permissions/contract.ts'
import { principalFromUser } from '../auth-v2/types.ts'
import { calendarSyncMarker } from './calendarSync.ts'
import { creativeDraftMarker, creativeDraftMarkerSearches, hasCreativeDraftMarker, hasCreativeDraftMarkerIdentity, creativeDraftMarkerIdentityCount } from './creativeDraftMarker.ts'
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
const EDITABLE_DRAFT_STATUSES = new Set(['draft','pending_review','planned_unimplemented','needs_materials','needs_revision','approved','rejected'])

export function validateScheduleInput(value: unknown, now = new Date(), requireFuture = true): ScheduleInput {
  const input = record(value)
  if (Object.keys(input).some(key => !['platform','scheduledAt','idempotencyKey','accountId'].includes(key))) throw new CreativeRevisionError('invalid_schedule_input')
  const platform = typeof input.platform === 'string' ? platforms[input.platform.trim().toLowerCase()] : undefined
  if (!platform || typeof input.idempotencyKey !== 'string' || !requestKeyPattern.test(input.idempotencyKey)) throw new CreativeRevisionError('invalid_schedule_input')
  if (input.accountId !== undefined && (typeof input.accountId !== 'string' || !input.accountId.trim() || input.accountId.length > 200)) throw new CreativeRevisionError('invalid_schedule_input')
  if (input.scheduledAt !== null && (typeof input.scheduledAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(input.scheduledAt))) throw new CreativeRevisionError('invalid_schedule_time')
  const scheduledAt = input.scheduledAt === null ? null : new Date(input.scheduledAt)
  if (scheduledAt && (!Number.isFinite(scheduledAt.getTime()) || requireFuture && scheduledAt.getTime() <= now.getTime())) throw new CreativeRevisionError('invalid_schedule_time')
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

function draftMarker(creativeId: string, revisionId: string | null) {
  return `${calendarSyncMarker(creativeId)} creative-revision:${revisionId}`
}

function unscheduledMarker(creativeId: string, revisionId: string | null) {
  return `${creativeDraftMarker('unscheduled',creativeId)}${revisionId ? ` creative-revision:${revisionId}` : ''}`
}

function assertUniqueIdentity(note:string|null,id:string) {
  for(const kind of ['calendar','unscheduled'] as const){
    const count=creativeDraftMarkerIdentityCount(note,kind)
    if(count>1||count===1&&!hasCreativeDraftMarkerIdentity(note,kind,id))throw new CreativeRevisionError('creative_schedule_draft_ambiguous',409)
  }
}
const retainNote=(note:string|null,marker:string)=>note?.split('\n').at(-1)===marker?note:note?note+'\n'+marker:marker
const eligibleAccount=(account:any,platform?:string)=>{
 const handle=account.handle?.trim().toLowerCase()||'',status=account.connectionStatus?.toUpperCase()||'UNKNOWN'
 return (!platform||platforms[account.platformId.toLowerCase()]===platform)&&!!platforms[account.platformId.toLowerCase()]&&handle!==''&&!['-','n/a','na','none','unknown'].includes(handle)&&!handle.startsWith('unconfigured')&&!handle.startsWith('placeholder')&&Boolean(account.postfastAccountId)&&!account.disabledReason&&!['DISABLED','DISCONNECTED','ERROR','EXPIRED'].includes(status)
}
export async function readCreativeScheduleAccounts(actor:Actor,brandId:string,month:string,creativeId:string,db=prisma){
 validateCreativeAddress(month,creativeId)
 await authorize(db as any,actor,brandId)
 const knowledge=await db.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true,brandPlan:true}})
 findCreative(creativeWorkspace(knowledge),month,creativeId)
 const accounts=await db.socialAccount.findMany({where:{brandId,unboundAt:null},select:{id:true,platformId:true,handle:true,postfastAccountId:true,connectionStatus:true,disabledReason:true}})
 return {ok:true,brandId,creativeId,month,accounts:accounts.filter((account:any)=>eligibleAccount(account)).map((account:any)=>({id:account.id,platform:platforms[account.platformId.toLowerCase()],handle:account.handle}))}
}

async function writeSchedule(actor: Actor, brandId: string, creativeId: string, expectedRevision: string, input: unknown, unschedule: boolean, db = prisma, now = new Date()) {
  const body = record(input)
  const {idempotencyKey} = validateRequest(expectedRevision,body)
  const allowedKeys = unschedule ? ['month','idempotencyKey'] : ['month','idempotencyKey','platform','scheduledAt','accountId']
  if (Object.keys(body).some(key => !allowedKeys.includes(key))) throw new CreativeRevisionError('invalid_schedule_input')
  const month = body.month
  validateCreativeAddress(month,creativeId)
  const schedule = unschedule ? null : validateScheduleInput({platform:body.platform,scheduledAt:body.scheduledAt,idempotencyKey:body.idempotencyKey,...(body.accountId!==undefined?{accountId:body.accountId}:{})},now,false)
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
    if (schedule?.scheduledAt && new Date(schedule.scheduledAt).getTime() <= now.getTime()) throw new CreativeRevisionError('invalid_schedule_time')
    const knowledge = await tx.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true,brandPlan:true}})
    const workspace = creativeWorkspace(knowledge)
    const current = findCreative(workspace,month,creativeId)
    if (creativeDigest(current) !== expectedRevision) throw new CreativeRevisionError('creative_revision_conflict',409)
    const normalized = normalizeCreativeWorkspaceItem(current,{brandId})
    if (normalized.status === 'archived') throw new CreativeRevisionError('creative_archived',409)
    if(!unschedule&&current.adaptationStatus&&(current.adaptationStatus!=='adapted'||!normalized.planning.trim()||!normalized.materialRequirements.some(item=>item.trim())))throw new CreativeRevisionError('creative_adaptation_required',409)
    const previous = normalized.schedule
    if (unschedule && !previous) throw new CreativeRevisionError('creative_not_scheduled',409)
    let draft: {id:string;brandId:string;status:string;agentNote:string|null} | null = null
    if (previous) {
      await tx.$queryRaw`SELECT "id" FROM "ContentDraft" WHERE "id" = ${previous.draftId} FOR UPDATE`
      draft = await tx.contentDraft.findUnique({where:{id:previous.draftId},select:{id:true,brandId:true,status:true,agentNote:true}})
      if (!draft || draft.brandId !== brandId || !hasCreativeDraftMarker(draft.agentNote,'calendar',creativeId)) throw new CreativeRevisionError('creative_schedule_draft_missing',409)
      assertUniqueIdentity(draft.agentNote,creativeId)
      if (!EDITABLE_DRAFT_STATUSES.has(draft.status)) throw new CreativeRevisionError('creative_schedule_locked',409)
    } else if (schedule) {
      const markers = [...creativeDraftMarkerSearches('unscheduled',creativeId),...(normalized.legacy?.date?creativeDraftMarkerSearches('calendar',creativeId):[])]
      const isCandidate = (note: string | null) => Boolean(hasCreativeDraftMarker(note,'unscheduled',creativeId) || normalized.legacy?.date && hasCreativeDraftMarker(note,'calendar',creativeId))
      const possible = await tx.contentDraft.findMany({where:{brandId,OR:markers.map(marker=>({agentNote:{contains:marker,mode:'insensitive' as const}}))},select:{id:true,brandId:true,status:true,agentNote:true}})
      const candidates = possible.filter(row => isCandidate(row.agentNote))
      for(const candidate of candidates)assertUniqueIdentity(candidate.agentNote,creativeId)
      if (candidates.length > 1) throw new CreativeRevisionError('creative_schedule_draft_ambiguous',409)
      if (candidates.length === 1) {
        await tx.$queryRaw`SELECT "id" FROM "ContentDraft" WHERE "id" = ${candidates[0].id} FOR UPDATE`
        draft = await tx.contentDraft.findUnique({where:{id:candidates[0].id},select:{id:true,brandId:true,status:true,agentNote:true}})
        if (!draft || draft.brandId !== brandId || !isCandidate(draft.agentNote)) throw new CreativeRevisionError('creative_schedule_draft_missing',409)
        assertUniqueIdentity(draft.agentNote,creativeId)
        if (!EDITABLE_DRAFT_STATUSES.has(draft.status)) throw new CreativeRevisionError('creative_schedule_locked',409)
      }
    }
    // The workspace was read after taking the brand lock, which remains held
    // together with this draft's lock. A marker never overrides another current
    // schedule, including a same-ID creative in a different month.
    if (draft && Object.entries(record(workspace.publishingCalendar?.months)).some(([linkedMonth,items]) =>
      Array.isArray(items) && items.some(item => (linkedMonth !== month || item?.id !== creativeId) && item?.schedule?.draftId === draft!.id)
    )) throw new CreativeRevisionError('creative_schedule_draft_in_use',409)
    if(draft&&!previous&&Object.entries(record(workspace.publishingCalendar?.months)).some(([otherMonth,items])=>otherMonth!==month&&Array.isArray(items)&&items.some(item=>typeof item?.id==='string'&&item.id.toLowerCase()===creativeId.toLowerCase()&&!item.schedule)))throw new CreativeRevisionError('creative_schedule_draft_ambiguous',409)
    let link: CreativeScheduleLink | null = null
    let expectedNote:string|null=null
    if (schedule) {
      const accounts = await tx.socialAccount.findMany({where:{brandId,unboundAt:null,...(schedule.accountId?{id:schedule.accountId}:{})},select:{id:true,platformId:true,handle:true,postfastAccountId:true,connectionStatus:true,disabledReason:true}})
      const matching = accounts.filter(account => eligibleAccount(account,schedule.platform))
      if (matching.length !== 1) throw new CreativeRevisionError(matching.length?'schedule_account_ambiguous':'schedule_account_not_found',409)
      const latest = await tx.brandMarketingSolution.findFirst({where:{brandId,kind:CREATIVE_REVISION_KIND,period:revisionPeriod(month,creativeId)},orderBy:{version:'desc'},select:{id:true}})
      const revision = latest || await tx.brandMarketingSolution.create({data:{brandId,kind:CREATIVE_REVISION_KIND,period:revisionPeriod(month,creativeId),version:0,status:'BASELINE',generationMode:'LEGACY_SNAPSHOT',input:{creativeId,month,actor:null,origin:'legacy_unknown'},output:current as Prisma.InputJsonValue},select:{id:true}})
      const marker = retainNote(draft?.agentNote||null,draftMarker(creativeId,revision.id));expectedNote=marker
      // A time choice is not publication approval. The ordinary approve flow
      // owns transitions to the provider-facing scheduled state.
      const saved = draft
        ? await tx.contentDraft.update({where:{id:draft.id},data:{accountId:matching[0].id,scheduledAt:schedule.scheduledAt?new Date(schedule.scheduledAt):null,agentNote:marker},select:{id:true}})
        : await tx.contentDraft.create({data:{brandId,accountId:matching[0].id,caption:normalized.aiCaption || normalized.planning || normalized.title,captionLang:'zh',mediaUrls:[],hashtags:[],scheduledAt:schedule.scheduledAt?new Date(schedule.scheduledAt):null,status:'draft',agentNote:marker},select:{id:true}})
      link = {draftId:saved.id,accountId:matching[0].id,scheduledAt:schedule.scheduledAt,platform:schedule.platform,scheduledBy:user.id,scheduledAtRevisionId:revision.id}
    } else if (draft) {
      expectedNote=retainNote(draft.agentNote,unscheduledMarker(creativeId,previous!.scheduledAtRevisionId))
      await tx.contentDraft.update({where:{id:draft.id},data:{scheduledAt:null,agentNote:expectedNote}})
    }
    const next = {...current,schedule:link,updatedAt:now.toISOString()}
    await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:nextWorkspace(workspace,month,creativeId,next) as Prisma.InputJsonValue}})
    const verifiedKnowledge = await tx.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true,brandPlan:true}})
    const verified = findCreative(creativeWorkspace(verifiedKnowledge),month,creativeId)
    const verifiedDraft = await tx.contentDraft.findUnique({where:{id:link?.draftId || previous!.draftId},select:{id:true,status:true,scheduledAt:true,agentNote:true}})
    if (creativeDigest(verified) !== creativeDigest(next) || !verifiedDraft
      || (link ? verifiedDraft.agentNote !== expectedNote
        || verifiedDraft.scheduledAt?.toISOString() !== link.scheduledAt && !(verifiedDraft.scheduledAt === null && link.scheduledAt === null)
        : verifiedDraft.scheduledAt !== null || verifiedDraft.agentNote !== expectedNote)) {
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
