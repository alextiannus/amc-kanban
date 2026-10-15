import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'

assert(existsSync(new URL('../src/lib/brand-plan/creativeScheduling.ts', import.meta.url)), 'explicit creative scheduling service is missing')
assert(existsSync(new URL('../src/app/api/brands/[id]/content-creatives/[creativeId]/schedule/route.ts', import.meta.url)), 'explicit creative scheduling route is missing')

process.env.DATABASE_URL ||= 'postgresql://localhost/amc_lineage_test_task3'
const { validateScheduleInput } = await import('../src/lib/brand-plan/creativeScheduling.ts')
assert.equal(validateScheduleInput({ platform: 'instagram', scheduledAt: '2026-11-12T10:00:00+08:00', idempotencyKey: 'schedule-one' }, new Date('2026-10-16')).platform, 'instagram')
assert.equal(validateScheduleInput({ platform: 'ig', scheduledAt: null, idempotencyKey: 'schedule-two' }).scheduledAt, null)
assert.throws(() => validateScheduleInput({ platform: 'made-up', scheduledAt: null, idempotencyKey: 'schedule-three' }), /invalid_schedule_input/)
assert.throws(() => validateScheduleInput({ platform: 'instagram', scheduledAt: '2020-01-01T00:00:00Z', idempotencyKey: 'schedule-four' }), /invalid_schedule_time/)
assert.throws(() => validateScheduleInput({ platform: 'instagram', scheduledAt: '2026-11-12', idempotencyKey: 'schedule-five' }), /invalid_schedule_time/)
console.log('PASS: explicit route and schedule input validation')

// Exercise the transaction with a small in-memory adapter; this keeps the
// authorization, revision, draft and replay contract testable without a DB.
const contract = await import('../src/lib/brand-plan/creativeRevisionContract.ts')
const workspaceContract = await import('../src/lib/brand-plan/creativeWorkspaceContract.ts')
const draftMarkers = await import('../src/lib/brand-plan/creativeDraftMarker.ts')
for (const kind of ['calendar','unscheduled'] as const) {
  const marker=draftMarkers.creativeDraftMarker(kind,'idea-one')
  for (const note of [marker,`${marker} creative-revision:revision-1`,`Historical note ${marker.toUpperCase()} creative-revision:revision-1`]) {
    assert.equal(draftMarkers.hasCreativeDraftMarker(note,kind,'idea-one'),true)
    assert.equal(draftMarkers.hasCreativeDraftMarker(note,kind),true)
  }
  for (const suffix of ['-other','_other','2']) assert.equal(draftMarkers.hasCreativeDraftMarker(`${marker}${suffix}`,kind,'idea-one'),false)
  assert.equal(draftMarkers.hasCreativeDraftMarker(`History ${draftMarkers.creativeDraftMarker(kind,'idea.v1')}`,kind,'idea.v1'),true)
  assert.equal(draftMarkers.hasCreativeDraftMarker(null,kind),false)
}
const item: any = {id:'idea-one',title:'Original',planning:'Original script',status:'idea_pending',platformTargets:['instagram'],materialRequirements:[],schedule:null}
let knowledge: any = {marketingSolution:{publishingCalendar:{months:{'2026-11':[item]}}}}
let permitted = true
let accountEnabled = true
let accountKind: 'real' | 'placeholder' | 'blank' | 'placeholder_named' | 'not_connected' | 'disabled' = 'real'
const drafts: any[] = []
let draftSequence=0
const revisions: any[] = []
const audits: any[] = []
const actor = {id:'owner',type:'HUMAN'}
const tx: any = {
  $queryRaw: async () => [],
  user:{findUnique:async()=>({id:'owner',type:'HUMAN',role:'USER',status:'ACTIVE',nickname:'Owner'})},
  auditLog:{findFirst:async({where}:any)=>audits.find(a=>a.resourceId===where.resourceId&&a.metadata.requestKey===where.metadata.equals)||null,create:async({data}:any)=>{audits.push(data);return data}},
  brandKnowledge:{findUnique:async()=>knowledge,update:async({data}:any)=>{knowledge={...knowledge,marketingSolution:data.marketingSolution};return knowledge}},
  contentDraft:{findUnique:async({where}:any)=>drafts.find(d=>d.id===where.id)||null,findMany:async({where}:any)=>drafts.filter(d=>d.brandId===where.brandId&&(where.OR ?? [where]).some((clause:any)=>clause.agentNote?.startsWith?d.agentNote?.startsWith(clause.agentNote.startsWith):clause.agentNote?.contains?d.agentNote?.toLowerCase().includes(clause.agentNote.contains.toLowerCase()):false)),create:async({data}:any)=>{const d={id:`draft-${++draftSequence}`,...data};drafts.push(d);return d},update:async({where,data}:any)=>{const d=drafts.find(row=>row.id===where.id);Object.assign(d,data);return d}},
  socialAccount:{findMany:async()=>accountEnabled?[{id:'account-1',platformId:'instagram',handle:['real','not_connected','disabled'].includes(accountKind)?'real_handle':accountKind==='blank'?'':accountKind==='placeholder_named'?'placeholder':'unconfigured',postfastAccountId:accountKind==='not_connected'?null:'pf-account-1',connectionStatus:accountKind==='disabled'?'DISABLED':'CONNECTED',disabledReason:null}]:[]},
  brandMarketingSolution:{findFirst:async()=>revisions.at(-1)||null,create:async({data}:any)=>{const r={id:`revision-${revisions.length+1}`,...data};revisions.push(r);return r}},
}
const db:any = {$transaction:async(fn:any)=>fn(tx)}
const source = readFileSync(new URL('../src/lib/brand-plan/creativeScheduling.ts',import.meta.url),'utf8')
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const modules:Record<string,any> = {
  '../prisma.ts':{prisma:db},
  '../user-management/brandAccess.ts':{canUserAccessBrand:async()=>permitted},
  '../role-permissions/store.ts':{readPolicies:async()=>({policies:{AMC_PRINCIPAL:['content.schedule']}})},
  '../role-permissions/contract.ts':{effectiveGrants:()=>['content.schedule']},
  '../auth-v2/types.ts':{principalFromUser:()=>({permissionRoleIds:['AMC_PRINCIPAL'],globalRoles:[]})},
  './calendarSync.ts':{calendarSyncMarker:(id:string)=>`brand-plan-calendar-item:${id}`},
  './creativeDraftMarker.ts':draftMarkers,
  './creativeRevisionContract.ts':contract,
  './creativeWorkspaceContract.ts':workspaceContract,
}
const mod={exports:{} as any}
new Function('require','module','exports',compiled)((key:string)=>{assert(key in modules,key);return modules[key]},mod,mod.exports)
const service=mod.exports
const current=()=>knowledge.marketingSolution.publishingCalendar.months['2026-11'][0]
const expectCode=(run:()=>Promise<any>,code:string)=>assert.rejects(run,(error:any)=>error.code===code)
const now=new Date('2026-10-16T00:00:00Z')
const start=contract.creativeDigest(current())
assert.equal(drafts.length,0)
const scheduled=await service.scheduleCreative(actor,'brand-a','idea-one',start,{month:'2026-11',scheduledAt:'2026-11-12T10:00:00+08:00',platform:'instagram',idempotencyKey:'schedule-one'},db,now)
assert.equal(scheduled.schedule.scheduledAtRevisionId,'revision-1')
assert.equal(drafts.length,1)
assert.equal(drafts[0].status,'draft')
assert.equal(drafts[0].scheduledAt.toISOString(),'2026-11-12T02:00:00.000Z')
assert.match(drafts[0].agentNote,/idea-one.*revision-1/)
assert.equal(current().planning,'Original script')
assert.equal((await service.scheduleCreative(actor,'brand-a','idea-one',start,{month:'2026-11',scheduledAt:'2026-11-12T10:00:00+08:00',platform:'instagram',idempotencyKey:'schedule-one'},db,now)).replayed,true)
assert.equal((await service.scheduleCreative(actor,'brand-a','idea-one',start,{month:'2026-11',scheduledAt:'2026-11-12T02:00:00Z',platform:'ig',idempotencyKey:'schedule-one'},db,new Date('2026-12-01T00:00:00Z'))).replayed,true)
assert.equal(drafts.length,1)
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',start,{month:'2026-11',scheduledAt:'2026-11-13T10:00:00+08:00',platform:'instagram',idempotencyKey:'schedule-one'},db,now),'creative_request_key_reused')
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',start,{month:'2026-11',scheduledAt:'2026-11-13T10:00:00+08:00',platform:'instagram',idempotencyKey:'schedule-one'},db,new Date('2026-12-01T00:00:00Z')),'creative_request_key_reused')
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',start,{month:'2026-11',scheduledAt:'2026-11-12T02:00:00Z',platform:'instagram',idempotencyKey:'past-new-key'},db,new Date('2026-12-01T00:00:00Z')),'invalid_schedule_time')
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',start,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-new'},db,now),'creative_revision_conflict')
drafts[0].status='publishing'
await expectCode(()=>service.unscheduleCreative(actor,'brand-a','idea-one',scheduled.expectedRevision,{month:'2026-11',idempotencyKey:'unschedule-locked'},db,now),'creative_schedule_locked')
drafts[0].status='pending_review'
permitted=false
await expectCode(()=>service.unscheduleCreative(actor,'brand-a','idea-one',scheduled.expectedRevision,{month:'2026-11',idempotencyKey:'unschedule-one'},db,now),'creative_access_denied')
permitted=true
const unscheduled=await service.unscheduleCreative(actor,'brand-a','idea-one',scheduled.expectedRevision,{month:'2026-11',idempotencyKey:'unschedule-one'},db,now)
assert.equal(unscheduled.schedule,null)
assert.equal(drafts[0].status,'pending_review')
assert.equal(drafts[0].scheduledAt,null)
assert.match(drafts[0].agentNote,/^brand-plan-creative-unscheduled:idea-one creative-revision:revision-1$/)
assert.equal(current().planning,'Original script')
assert.equal((await service.unscheduleCreative(actor,'brand-a','idea-one',scheduled.expectedRevision,{month:'2026-11',idempotencyKey:'unschedule-one'},db,now)).replayed,true)
accountEnabled=false
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',unscheduled.expectedRevision,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-again'},db,now),'schedule_account_not_found')
assert.equal(drafts.length,1)
accountEnabled=true
accountKind='placeholder'
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',unscheduled.expectedRevision,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-placeholder'},db,now),'schedule_account_not_found')
accountKind='blank'
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',unscheduled.expectedRevision,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-blank'},db,now),'schedule_account_not_found')
accountKind='placeholder_named'
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',unscheduled.expectedRevision,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-fake'},db,now),'schedule_account_not_found')
accountKind='not_connected'
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',unscheduled.expectedRevision,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-unbound'},db,now),'schedule_account_not_found')
accountKind='disabled'
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',unscheduled.expectedRevision,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-disabled'},db,now),'schedule_account_not_found')
accountKind='real'
const rescheduled=await service.scheduleCreative(actor,'brand-a','idea-one',unscheduled.expectedRevision,{month:'2026-11',scheduledAt:'2026-11-14T10:00:00+08:00',platform:'instagram',idempotencyKey:'schedule-again-good'},db,now)
assert.equal(rescheduled.draftId,scheduled.draftId)
assert.equal(drafts.length,1)
assert.equal(drafts[0].status,'pending_review')
drafts[0].status='needs_materials'
const unscheduledAgain=await service.unscheduleCreative(actor,'brand-a','idea-one',rescheduled.expectedRevision,{month:'2026-11',idempotencyKey:'unschedule-again'},db,now)
assert.equal(drafts[0].status,'needs_materials')
const scheduledAgain=await service.scheduleCreative(actor,'brand-a','idea-one',unscheduledAgain.expectedRevision,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-third'},db,now)
assert.equal(scheduledAgain.draftId,scheduled.draftId)
assert.equal(drafts[0].status,'needs_materials')
drafts[0].status='needs_revision'
const unscheduledThird=await service.unscheduleCreative(actor,'brand-a','idea-one',scheduledAgain.expectedRevision,{month:'2026-11',idempotencyKey:'unschedule-third'},db,now)
assert.equal(drafts[0].status,'needs_revision')
drafts[0].status='failed'
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',unscheduledThird.expectedRevision,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-failed'},db,now),'creative_schedule_locked')
assert.equal(drafts.length,1)
console.log('PASS: explicit draft creation, revision link, script preservation, replay, conflict, access, account validation and unschedule')

const routeSource=readFileSync(new URL('../src/app/api/brands/[id]/content-creatives/[creativeId]/schedule/route.ts',import.meta.url),'utf8')
const routeCompiled=ts.transpileModule(routeSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
let authenticated=true
let originAllowed=true
let called=''
const routeModules:Record<string,any>={
  '@/lib/user-management/auth':{resolveSessionOrApiKey:async()=>authenticated?{user:actor}:null},
  '@/lib/role-permissions/request-origin':{allowedRoleWriteOrigin:()=>originAllowed},
  '@/lib/brand-plan/creativeRevisionContract':contract,
  '@/lib/brand-plan/creativeScheduling':{
    scheduleCreative:async(_actor:any,brandId:string,creativeId:string,revision:string,input:any)=>{called='POST';assert.equal(brandId,'brand-a');assert.equal(creativeId,'idea-one');assert.equal(revision,start);assert.equal(input.month,'2026-11');return {ok:true}},
    unscheduleCreative:async()=>{called='DELETE';return {ok:true}},
  },
}
const routeMod={exports:{} as any}
new Function('require','module','exports',routeCompiled)((key:string)=>{assert(key in routeModules,key);return routeModules[key]},routeMod,routeMod.exports)
const route=routeMod.exports
const context={params:Promise.resolve({id:'brand-a',creativeId:'idea-one'})}
const request=(method:string)=>new Request('http://localhost/api/brands/brand-a/content-creatives/idea-one/schedule?month=2026-11',{method,body:JSON.stringify({expectedRevision:start,idempotencyKey:'route-key',...(method==='POST'?{platform:'instagram',scheduledAt:null}:{})})})
authenticated=false
assert.equal((await route.POST(request('POST'),context)).status,401)
authenticated=true;originAllowed=false
assert.equal((await route.POST(request('POST'),context)).status,403)
originAllowed=true
assert.equal((await route.POST(request('POST'),context)).status,200)
assert.equal(called,'POST')
assert.equal((await route.DELETE(request('DELETE'),context)).status,200)
assert.equal(called,'DELETE')
console.log('PASS: brand-scoped schedule route authentication, origin and method wiring')

// Route + real service validator: expectedRevision is a transport field, not a
// schedule input. Both methods must succeed, while unknown fields still fail.
drafts[0].status='draft'
const liveRouteMod={exports:{} as any}
new Function('require','module','exports',routeCompiled)((key:string)=>key==='@/lib/brand-plan/creativeScheduling'?service:routeModules[key],liveRouteMod,liveRouteMod.exports)
const liveRoute=liveRouteMod.exports
const liveRequest=(method:string,revision:string,extra:any={})=>new Request('http://localhost/api/brands/brand-a/content-creatives/idea-one/schedule?month=2026-11',{method,body:JSON.stringify({expectedRevision:revision,idempotencyKey:`route-live-${method.toLowerCase()}`,...(method==='POST'?{platform:'instagram',scheduledAt:null}:{}),...extra})})
const routePost=await liveRoute.POST(liveRequest('POST',contract.creativeDigest(current())),context)
assert.equal(routePost.status,200)
const routeResult=await routePost.json()
assert.equal(routeResult.draftId,scheduled.draftId)
assert.equal((await liveRoute.POST(liveRequest('POST',routeResult.expectedRevision,{unexpected:true}),context)).status,400)
const routeDelete=await liveRoute.DELETE(liveRequest('DELETE',routeResult.expectedRevision),context)
assert.equal(routeDelete.status,200)
assert.equal((await liveRoute.DELETE(liveRequest('DELETE',contract.creativeDigest(current()),{unexpected:true}),context)).status,400)
console.log('PASS: schedule route and real service validator compose for POST/DELETE; extra fields fail')

// The legacy draft endpoint must not mutate or delete a linked creative's
// schedule, while ordinary caption/status review remains usable.
const draftRouteSource=readFileSync(new URL('../src/app/api/brands/[id]/drafts/[draftId]/route.ts',import.meta.url),'utf8')
const draftRouteCompiled=ts.transpileModule(draftRouteSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const linkedDraft:any={id:scheduled.draftId,brandId:'brand-a',accountId:'account-1',scheduledAt:new Date('2026-11-14T02:00:00Z'),agentNote:'brand-plan-calendar-item:idea-one creative-revision:revision-1',status:'pending_review',updatedAt:new Date(),postfastControls:null,platformPostId:null,publishedAt:null}
const linkedKnowledge={marketingSolution:{publishingCalendar:{months:{'2026-11':[{id:'idea-one',schedule:{draftId:scheduled.draftId}}]}}}}
let draftDeleted=false
const txDraft:any={
  $queryRaw:async()=>[],
  brandKnowledge:{findUnique:async()=>linkedKnowledge},
  contentDraft:{findUnique:async()=>linkedDraft,update:async({data}:any)=>{Object.assign(linkedDraft,data);return {id:linkedDraft.id,caption:linkedDraft.caption,accountId:linkedDraft.accountId}},findUniqueOrThrow:async()=>linkedDraft,delete:async()=>{draftDeleted=true;drafts.splice(drafts.findIndex(d=>d.id===linkedDraft.id),1);return linkedDraft}},
  actionItem:{upsert:async()=>({})},
}
const draftDb:any={
  brandKnowledge:txDraft.brandKnowledge,
  contentDraft:{findFirst:async()=>linkedDraft},
  socialAccount:{findFirst:async()=>({platformId:'instagram'})},
  contentAssetRef:{findMany:async()=>[]},
  $transaction:async(fn:any)=>fn(txDraft),
}
const draftModules:Record<string,any>={
  '@/lib/postfastPublishAccount':{checkPostfastPublishAccount:async()=>({success:true})},
  'next/server':{NextResponse:{json:(body:any,options:any={})=>Response.json(body,{status:options.status??200})}},
  '@/lib/auth':{getSession:async()=>({user:actor}),extractApiKey:()=>null,getAgentFromApiKey:async()=>null},
  '@/lib/prisma':{prisma:draftDb},
  '@/lib/brandAccess':{canSessionAccessBrandProject:async()=>true},
  '@/lib/integrations/huaweiObs':{persistDraftSnapshotToObs:async()=>{}},
  '@/lib/compliance':{parseBrandComplianceConfig:async()=>null,validateContentCompliance:()=>({isValid:true})},
  '@/lib/audit':{actorFromContext:()=>null,writeAuditLog:async()=>{}},
  '@/lib/events':{eventEmitter:{}},
  '@/lib/postfastDelivery':{findActivePostfastDeliveryJob:async()=>null},
  '@/lib/integrations/postfast':{sanitizePostFastDraftControls:()=>({})},
  '@/lib/brand-plan/creativeDraftMarker':draftMarkers,
}
const draftMod={exports:{} as any}
new Function('require','module','exports',draftRouteCompiled)((key:string)=>{assert(key in draftModules,key);return draftModules[key]},draftMod,draftMod.exports)
const draftRoute=draftMod.exports
const draftContext={params:Promise.resolve({id:'brand-a',draftId:scheduled.draftId})}
const draftRequest=(method:string,body?:any)=>new Request(`http://localhost/api/brands/brand-a/drafts/${scheduled.draftId}`,{method,...(body?{body:JSON.stringify(body)}:{})})
for(const body of [{accountId:'account-2'},{scheduledAt:'2026-11-15T02:00:00Z'},{agentNote:'removed'}]){
  assert.equal((await draftRoute.PATCH(draftRequest('PATCH',body),draftContext)).status,409)
}
assert.equal((await draftRoute.DELETE(draftRequest('DELETE'),draftContext)).status,409)
assert.equal((await draftRoute.PATCH(draftRequest('PATCH',{caption:'Revised copy',status:'needs_revision'}),draftContext)).status,200)
assert.equal(linkedDraft.caption,'Revised copy')
assert.equal(linkedDraft.status,'needs_revision')
linkedKnowledge.marketingSolution.publishingCalendar.months['2026-11'][0].schedule=null as any
linkedDraft.agentNote='brand-plan-creative-unscheduled:idea-one creative-revision:revision-1'
linkedDraft.scheduledAt=null
assert.equal((await draftRoute.DELETE(draftRequest('DELETE'),draftContext)).status,200)
assert.equal(draftDeleted,true)
assert.equal(drafts.length,0)
const afterExplicitDelete=await service.scheduleCreative(actor,'brand-a','idea-one',contract.creativeDigest(current()),{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-after-delete'},db,now)
assert.equal(drafts.length,1)
assert.notEqual(afterExplicitDelete.draftId,scheduled.draftId)
console.log('PASS: linked draft PATCH schedule fields and DELETE blocked; content/status edits remain allowed')

// Historical dated plans may already have a marker-linked draft even though
// they have no canonical schedule link. Explicit scheduling must adopt it.
const legacyItem={id:'idea-one',title:'Historical idea',planning:'Original historical script',date:'2026-11-12',status:'planned_unimplemented',schedule:null}
const resetLegacy=(rows:any[])=>{knowledge={marketingSolution:{publishingCalendar:{months:{'2026-11':[{...legacyItem}]}}}};drafts.splice(0,drafts.length,...rows)}
const legacyDraft={id:'legacy-1',brandId:'brand-a',accountId:'account-1',caption:'Merchant-edited historical copy',status:'pending_review',scheduledAt:new Date('2026-11-12T02:00:00Z'),agentNote:'Historical link brand-plan-calendar-item:idea-one'}
resetLegacy([{...legacyDraft}])
const adopted=await service.scheduleCreative(actor,'brand-a','idea-one',contract.creativeDigest(current()),{month:'2026-11',scheduledAt:'2026-11-18T02:00:00Z',platform:'instagram',idempotencyKey:'adopt-legacy-one'},db,now)
assert.equal(adopted.draftId,'legacy-1')
assert.equal(drafts.length,1)
assert.equal(drafts[0].caption,'Merchant-edited historical copy')
assert.equal(drafts[0].status,'pending_review')
assert.match(drafts[0].agentNote,/^brand-plan-calendar-item:idea-one creative-revision:/)
assert.equal(current().planning,'Original historical script')
const legacyUnscheduled=await service.unscheduleCreative(actor,'brand-a','idea-one',adopted.expectedRevision,{month:'2026-11',idempotencyKey:'unschedule-adopted'},db,now)
assert.equal(legacyUnscheduled.draftId,'legacy-1')
assert.match(drafts[0].agentNote,/^brand-plan-creative-unscheduled:idea-one/)
drafts[0].agentNote=`Historical reserved ${drafts[0].agentNote.toUpperCase()}`
const legacyRescheduled=await service.scheduleCreative(actor,'brand-a','idea-one',legacyUnscheduled.expectedRevision,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'reschedule-adopted'},db,now)
assert.equal(legacyRescheduled.draftId,'legacy-1')
assert.equal(drafts.length,1)
assert.equal(drafts[0].status,'pending_review')
drafts[0].agentNote=`Historical canonical ${drafts[0].agentNote.toUpperCase()}`
await service.unscheduleCreative(actor,'brand-a','idea-one',legacyRescheduled.expectedRevision,{month:'2026-11',idempotencyKey:'unschedule-canonical-variant'},db,now)
assert.equal(drafts.length,1)

for (const status of ['scheduled','publishing','published','failed']) {
  resetLegacy([{...legacyDraft,id:`legacy-${status}`,status}])
  await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',contract.creativeDigest(current()),{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:`adopt-locked-${status}`},db,now),'creative_schedule_locked')
  assert.equal(drafts.length,1)
  assert.equal(drafts[0].id,`legacy-${status}`)
}
resetLegacy([{...legacyDraft},{...legacyDraft,id:'legacy-2',agentNote:'brand-plan-calendar-item:idea-one'}])
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',contract.creativeDigest(current()),{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'adopt-ambiguous'},db,now),'creative_schedule_draft_ambiguous')
assert.equal(drafts.length,2)
console.log('PASS: unique legacy dated draft adopted; provider-facing/failed and ambiguous legacy candidates fail closed')

// Hold each legacy route immediately before its write transaction. The initial
// draft is a detached snapshot; the real scheduler adopts it before we resume.
// This order must fail closed even when a historical note uses mixed case or
// embeds its marker after human text.
const interleavingCases = [
  {method:'DELETE',body:undefined},
  {method:'PATCH',body:{scheduledAt:'2026-11-21T02:00:00Z'}},
  {method:'PATCH',body:{accountId:'account-2'}},
  {method:'PATCH',body:{agentNote:'Removed historical link'}},
]
const raceFailures: string[] = []
for (const [index, scenario] of interleavingCases.entries()) {
  resetLegacy([{...legacyDraft,agentNote:'Historical link BRAND-PLAN-CALENDAR-ITEM:IDEA-ONE',platformPostId:null,publishedAt:null,postfastControls:null}])
  const events: string[] = []
  let transactionReady!: () => void
  let resumeMutation!: () => void
  const ready = new Promise<void>(resolve => { transactionReady=resolve })
  const resume = new Promise<void>(resolve => { resumeMutation=resolve })
  let brandLocked=false
  let draftLocked=false
  const latestDraft=()=>drafts.find(d=>d.id===legacyDraft.id)
  const mutationTx:any={
    $queryRaw:async(parts:TemplateStringsArray,...values:any[])=>{
      const query=parts.join('?')
      if(query.includes('"BrandKnowledge"')) {
        assert.equal(values[0],'brand-a')
        brandLocked=true
        events.push('brand-lock')
      } else if(query.includes('"ContentDraft"')) {
        assert(brandLocked,'brand lock must precede draft lock')
        assert.equal(values[0],legacyDraft.id)
        draftLocked=true
        events.push('draft-lock')
      }
      return []
    },
    brandKnowledge:{findUnique:async()=>{
      assert(brandLocked,'current creative links must be read under the brand lock')
      events.push('current-link-read')
      return structuredClone(knowledge)
    }},
    contentDraft:{
      findUnique:async()=>{
        assert(brandLocked && draftLocked,'latest draft must be read under brand and draft locks')
        events.push('current-draft-read')
        return structuredClone(latestDraft() ?? null)
      },
      update:async({data}:any)=>{
        events.push('draft-update')
        Object.assign(latestDraft(),Object.fromEntries(Object.entries(data).filter(([,value])=>value!==undefined)))
        return latestDraft()
      },
      findUniqueOrThrow:async()=>structuredClone(latestDraft()),
      delete:async()=>{events.push('draft-delete');return drafts.splice(drafts.findIndex(d=>d.id===legacyDraft.id),1)[0]},
    },
  }
  const mutationDb:any={
    contentDraft:{findFirst:async()=>{events.push('initial-legacy-snapshot');return structuredClone(latestDraft())}},
    brandKnowledge:{findUnique:async()=>structuredClone(knowledge)},
    socialAccount:{findFirst:async()=>({platformId:'instagram'})},
    contentAssetRef:{findMany:async()=>[]},
    $transaction:async(work:Function)=>{events.push('mutation-ready');transactionReady();await resume;return work(mutationTx)},
  }
  const raceMod={exports:{} as any}
  new Function('require','module','exports',draftRouteCompiled)((key:string)=>key==='@/lib/prisma'?{prisma:mutationDb}:draftModules[key],raceMod,raceMod.exports)
  const mutation=raceMod.exports[scenario.method](
    new Request(`http://localhost/api/brands/brand-a/drafts/${legacyDraft.id}`,{method:scenario.method,...(scenario.body?{body:JSON.stringify(scenario.body)}:{})}),
    {params:Promise.resolve({id:'brand-a',draftId:legacyDraft.id})},
  )
  await ready
  const adoption=await service.scheduleCreative(actor,'brand-a','idea-one',contract.creativeDigest(current()),{month:'2026-11',scheduledAt:'2026-11-18T02:00:00Z',platform:'instagram',idempotencyKey:`concurrent-adoption-${index}`},db,now)
  assert.equal(adoption.draftId,legacyDraft.id)
  events.push('adoption-committed')
  const adoptedSnapshot=structuredClone(latestDraft())
  resumeMutation()
  const response=await mutation
  try {
    assert.equal(response.status,409,`${scenario.method} must reject after legacy adoption`)
    assert.equal(drafts.length,1,'adopted draft must remain present')
    assert.equal(current().schedule.draftId,latestDraft().id,'active schedule must still resolve to its draft')
    assert.deepEqual(latestDraft(),adoptedSnapshot,'conflicted mutation must preserve the adopted draft')
    assert.deepEqual(events,['initial-legacy-snapshot','mutation-ready','adoption-committed','brand-lock','draft-lock','current-draft-read','current-link-read'])
  } catch(error) { raceFailures.push(`${scenario.method} ${JSON.stringify(scenario.body)}: ${(error as Error).message}`) }
}
assert.deepEqual(raceFailures,[])
console.log('PASS: deterministic legacy snapshot → adoption → locked PATCH/DELETE recheck preserves the active draft and schedule link')

// An active link is authoritative regardless of the note. Ordinary drafts and
// untimed reservations retain their original deletion behavior.
for (const note of [null,'ordinary merchant note','Historical BRAND-PLAN-CALENDAR-ITEM:IDEA-ONE','Historical BRAND-PLAN-CALENDAR-ITEM:IDEA-ONE CREATIVE-REVISION:revision-1','Historical BRAND-PLAN-CREATIVE-UNSCHEDULED:IDEA-ONE CREATIVE-REVISION:revision-1']) {
  let row:any={...legacyDraft,agentNote:note,scheduledAt:null,platformPostId:null,publishedAt:null}
  let linked=true
  let deletes=0
  const standaloneDb:any={
    $queryRaw:async()=>[],
    brandKnowledge:{findUnique:async()=>({marketingSolution:{publishingCalendar:{months:{'2026-11':[{id:'idea-one',schedule:linked?{draftId:legacyDraft.id}:null}]}}}})},
    contentDraft:{
      findFirst:async()=>structuredClone(row),findUnique:async()=>structuredClone(row),findUniqueOrThrow:async()=>structuredClone(row),
      update:async({data}:any)=>{Object.assign(row,Object.fromEntries(Object.entries(data).filter(([,value])=>value!==undefined)));return row},
      delete:async()=>{deletes++;const removed=row;row=null;return removed},
    },
    socialAccount:{findFirst:async()=>({platformId:'instagram'})},contentAssetRef:{findMany:async()=>[]},
    $transaction:async(work:Function)=>work(standaloneDb),
  }
  const standaloneMod={exports:{} as any}
  new Function('require','module','exports',draftRouteCompiled)((key:string)=>key==='@/lib/prisma'?{prisma:standaloneDb}:draftModules[key],standaloneMod,standaloneMod.exports)
  const call=(method:string,body?:any)=>standaloneMod.exports[method](new Request('http://localhost',{method,...(body?{body:JSON.stringify(body)}:{})}),{params:Promise.resolve({id:'brand-a',draftId:legacyDraft.id})})
  assert.equal((await call('DELETE')).status,409)
  assert.equal((await call('PATCH',{accountId:'account-2'})).status,409)
  assert.equal((await call('PATCH',{scheduledAt:'2026-11-21T02:00:00Z'})).status,409)
  linked=false
  const reserved=draftMarkers.hasCreativeDraftMarker(note,'unscheduled')
  assert.equal((await call('PATCH',{scheduledAt:'2026-11-21T02:00:00Z'})).status,reserved?409:200)
  assert.equal((await call('DELETE')).status,200)
  assert.equal(deletes,1)
  assert.equal(row,null)
}
console.log('PASS: active links always protected; unlinked normal/legacy and untimed reserved drafts remain explicitly deletable')
