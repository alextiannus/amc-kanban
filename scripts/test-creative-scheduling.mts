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
const item: any = {id:'idea-one',title:'Original',planning:'Original script',status:'idea_pending',platformTargets:['instagram'],materialRequirements:[],schedule:null}
let knowledge: any = {marketingSolution:{publishingCalendar:{months:{'2026-11':[item]}}}}
let permitted = true
let accountEnabled = true
const drafts: any[] = []
const revisions: any[] = []
const audits: any[] = []
const actor = {id:'owner',type:'HUMAN'}
const tx: any = {
  $queryRaw: async () => [],
  user:{findUnique:async()=>({id:'owner',type:'HUMAN',role:'USER',status:'ACTIVE',nickname:'Owner'})},
  auditLog:{findFirst:async({where}:any)=>audits.find(a=>a.resourceId===where.resourceId&&a.metadata.requestKey===where.metadata.equals)||null,create:async({data}:any)=>{audits.push(data);return data}},
  brandKnowledge:{findUnique:async()=>knowledge,update:async({data}:any)=>{knowledge={...knowledge,marketingSolution:data.marketingSolution};return knowledge}},
  contentDraft:{findUnique:async({where}:any)=>drafts.find(d=>d.id===where.id)||null,create:async({data}:any)=>{const d={id:`draft-${drafts.length+1}`,...data};drafts.push(d);return d},update:async({where,data}:any)=>{const d=drafts.find(row=>row.id===where.id);Object.assign(d,data);return d}},
  socialAccount:{findMany:async()=>accountEnabled?[{id:'account-1',platformId:'instagram'}]:[]},
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
assert.equal(drafts.length,1)
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',start,{month:'2026-11',scheduledAt:'2026-11-13T10:00:00+08:00',platform:'instagram',idempotencyKey:'schedule-one'},db,now),'creative_request_key_reused')
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',start,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-new'},db,now),'creative_revision_conflict')
permitted=false
await expectCode(()=>service.unscheduleCreative(actor,'brand-a','idea-one',scheduled.expectedRevision,{month:'2026-11',idempotencyKey:'unschedule-one'},db,now),'creative_access_denied')
permitted=true
const unscheduled=await service.unscheduleCreative(actor,'brand-a','idea-one',scheduled.expectedRevision,{month:'2026-11',idempotencyKey:'unschedule-one'},db,now)
assert.equal(unscheduled.schedule,null)
assert.equal(drafts[0].status,'draft')
assert.equal(drafts[0].scheduledAt,null)
assert.equal(drafts[0].agentNote,null)
assert.equal(current().planning,'Original script')
assert.equal((await service.unscheduleCreative(actor,'brand-a','idea-one',scheduled.expectedRevision,{month:'2026-11',idempotencyKey:'unschedule-one'},db,now)).replayed,true)
accountEnabled=false
await expectCode(()=>service.scheduleCreative(actor,'brand-a','idea-one',unscheduled.expectedRevision,{month:'2026-11',scheduledAt:null,platform:'instagram',idempotencyKey:'schedule-again'},db,now),'schedule_account_not_found')
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
const request=(method:string)=>new Request('http://localhost/api/brands/brand-a/content-creatives/idea-one/schedule?month=2026-11',{method,body:JSON.stringify({expectedRevision:start,idempotencyKey:'route-key',platform:'instagram',scheduledAt:null})})
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
