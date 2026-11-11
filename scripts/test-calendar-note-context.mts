import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as calendar from '../src/lib/calendarNoteContext.ts'
import * as contract from '../src/lib/ai-native/contract.ts'
import * as planningContract from '../src/lib/ai-native/planning-workspace-contract.ts'
import {createAmcContextAssembler} from '../src/lib/ai-native/runtime-application.mjs'
import {buildContextManifest} from '../src/lib/ai-native/context-manifest.ts'

const now=new Date('2026-12-31T16:30:00Z')
assert.deepEqual(calendar.calendarMonths('Asia/Singapore',undefined,now),['2027-01','2027-02'])
assert.deepEqual(calendar.calendarMonths('America/Los_Angeles',{month:'2028-02',date:'2028-02-29'},now),['2026-12','2027-01','2028-02'])
assert.throws(()=>calendar.parseCalendarContext({month:'2028-02',date:'2028-02-30'}))
assert.throws(()=>calendar.parseCalendarContext({month:'2028-02',date:'2028-03-01'}))
assert.throws(()=>calendar.parseCalendarContext({month:'2028-02',brandId:'other'}))
const note=(date:string,title='',body='Shoot lunch')=>({brandId:'brand-a',date,title,body,color:'yellow',version:1,updatedAt:now})
let rows:any[]=[note('2027-01-09','新品拍摄','上午拍摄新品；本周主推午餐。'),{...note('2027-01-10','Other brand','PRIVATE_OTHER_BRAND'),brandId:'brand-b'}]
let failed=false
const db:any={brand:{findUnique:async()=>({timezone:'Asia/Singapore'})},calendarNote:{findMany:async({where}:any)=>{
  if(failed)throw new Error('offline')
  return rows.filter(row=>row.brandId===where.brandId&&(where.OR?where.OR.some((term:any)=>row.date.startsWith(term.date.startsWith)):row.date.startsWith(where.date.startsWith)))
}}}
const hint={month:'2027-01',date:'2027-01-09'}
assert.deepEqual(contract.conversationInput({calendarContext:hint}).calendarContext,hint)
assert.equal(contract.conversationInput({}).calendarContext,undefined,'old clients use server defaults')
let context=await calendar.readCalendarPlanning(db,'brand-a',hint,now)
assert.equal(context.status,'available');assert.equal(context.notes[0].title,'新品拍摄')
assert(!JSON.stringify(context).includes('PRIVATE_OTHER_BRAND'))
const firstRevision=context.revision
rows[0]={...rows[0],color:'green',version:rows[0].version+1}
const recolored=await calendar.readCalendarPlanning(db,'brand-a',hint,now)
assert.notEqual(recolored.revision,firstRevision,'color saves share existing context invalidation')
assert(!('color' in recolored.notes[0]),'AI planning reads text without assigning color semantics')
const colorPage=await calendar.readCalendarNotesPage(db,'brand-a',{month:hint.month})
assert(!('color' in colorPage.notes[0]),'read-only AI tools do not interpret display colors')
rows[0]={...rows[0],title:'新标题',version:rows[0].version+1}
context=await calendar.readCalendarPlanning(db,'brand-a',hint,now)
assert.notEqual(context.revision,recolored.revision,'title-only changes invalidate the context')
rows[0]={...rows[0],title:'',body:'',version:rows[0].version+1}
const cleared=await calendar.readCalendarPlanning(db,'brand-a',hint,now)
assert.equal(cleared.notes.length,0);assert.notEqual(cleared.revision,context.revision)
assert.equal(cleared.revision,await calendar.calendarPlanningRevision(db,'brand-a',hint,now))
rows=Array.from({length:20},(_,i)=>note(`2027-01-${String(i+1).padStart(2,'0')}`,`Shoot ${i+1}`,'🎥'.repeat(2000)))
context=await calendar.readCalendarPlanning(db,'brand-a',hint,now)
assert(Array.from(JSON.stringify(context)).length<=8000)
assert(context.notes.some(row=>row.date===hint.date),'selected full note is prioritized')
assert(context.truncated);assert.deepEqual(context.unreadMonths,['2027-01'])
assert.match(calendar.calendarCoverageFeedback(context,[])!,/Read complete/)
const calls:any[]=[];let afterDate:string|undefined
do{
  const page=await calendar.readCalendarNotesPage(db,'brand-a',{month:'2027-01',afterDate})
  assert.equal(page.status,'available');assert(page.notes.length<=8)
  assert(page.notes.every(row=>Array.from(row.body).length===2000))
  calls.push({capability:'amc.calendar_notes',status:'succeeded',result:page})
  afterDate=page.nextAfterDate||undefined
}while(afterDate)
assert.equal(calls.length,3);assert.equal(calendar.calendarCoverageFeedback(context,calls),null)
assert.match(calendar.calendarCoverageFeedback(context,calls.slice(1))!,/Read complete/)
const defaultContext=calendar.projectCalendarPlanning('brand-a','Asia/Singapore',['2026-12'],[])
assert.match(calendar.calendarCoverageFeedback(defaultContext,calls.slice(0,1))!,/2027-01/,'on-demand months must not bypass full-body pagination for formal plans')
assert.equal(calendar.calendarCoverageFeedback(defaultContext,calls),null)
const unavailableCall={capability:'amc.calendar_notes',status:'succeeded',result:{status:'unavailable',month:'2027-01',afterDate:null,revision:null,notes:[],nextAfterDate:null}}
assert.match(calendar.calendarCoverageFeedback(defaultContext,[...calls,unavailableCall])!,/unavailable/,'a later failed on-demand read cannot be hidden by old successful pages')
rows[19]={...rows[19],body:'changed by another member',version:2}
const updated=await calendar.readCalendarPlanning(db,'brand-a',hint,now)
assert.match(calendar.calendarCoverageFeedback(updated,calls)!,/Read complete/,'stale page receipts cannot establish current coverage')
failed=true
assert.equal((await calendar.readCalendarPlanning(db,'brand-a',hint,now)).status,'unavailable')
assert.equal((await calendar.readCalendarNotesPage(db,'brand-a',{month:'2027-01'})).status,'unavailable')
assert.equal(await calendar.calendarPlanningRevision(db,'brand-a',hint,now),'calendar_notes_unavailable')
assert.match(calendar.calendarCoverageFeedback(await calendar.readCalendarPlanning(db,'brand-a',hint,now),[])!,/unavailable/)
failed=false

// Exercise the real application capability and real Core context assembler, without AI/provider calls.
const compile=(file:string,deps:any)=>{const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key]||{},mod,mod.exports);return mod.exports}
const revisionDb={...db,brandPlanInterview:{findFirst:async()=>null},brandGrowthResearchSnapshot:{findFirst:async()=>null},mediaAsset:{findFirst:async()=>null}}
const cacheModule=compile('src/lib/ai-native/conversation-context.ts',{'../prisma':{prisma:revisionDb},'./contract':contract,'../calendarNoteContext':calendar})
const cacheActor=contract.actorFor('brand-a','human')
const beforeCache=await cacheModule.conversationSourceRevision(cacheActor,hint)
rows[0]={...rows[0],title:'Edited title only',version:rows[0].version+1}
assert.notEqual(await cacheModule.conversationSourceRevision(cacheActor,hint),beforeCache,'the real persisted-cache source key includes calendar metadata')
let configured:any,artifact='',allowed=true
let intent:any={kind:'conversation',topic:'general',brandId:'brand-a',userId:'human',goal:'Plan next month',requestKey:'calendar-test',artifactPath:'work/calendar.json',contextSessionId:'same-session',history:[],calendarContext:hint}
const actor=contract.actorFor('brand-a','human'),taskId='task-calendar'
const application=compile('src/lib/ai-native/application.ts',{
  '../calendarNoteContext':calendar,'./contract':contract,'node:crypto':await import('node:crypto'),'node:path':await import('node:path'),
  './planning-workspace-contract':planningContract,
  '../prisma':{prisma:db},'./store':{intentBy:async()=>({intent,task_id:taskId})},'../profile-document':{readProfileDocument:async()=>({content:'Saved brand strategy',revision:'workspace-one',startMonth:'2027-01'})},
  './runtime-application.mjs':{openApplication:async(config:any)=>{configured=config;return {tasks:{get:async()=>({trusted_context:{reference:'request'}})},workspace:{read:async()=>({content:artifact})}}}},
  '@immedi/iaic-core/capabilities/index.js':{defineCapability:(v:any)=>v},
  './business-capabilities':{BUSINESS_CAPABILITIES:[],businessCapabilities:()=>[]},'./interview-capabilities':{interviewCapabilities:()=>[]},
  './autopilot-capabilities':{AUTOPILOT_TOOLS:[],autopilotCapabilities:()=>[]},'./video-review':{videoReviewCapability:()=>({name:'test-video-review'})},
  '../brand-plan/creativeFidelity':{FIDELITY_DIMENSIONS:[]},'./conversation-progress':{conversationKnowledge:(value:any)=>value},
  './conversation-query':{savedInterviewQuery:()=>false},'./preferences':{readPreference:async()=>null},
  './brand-keywords':{brandKeywordsForUser:async()=>({})},'./conversation-turn':{repeatsPreviousReply:()=>false},
})
await application.composeApplication({}, {}, {skillRoot:'skills',version:'calendar-fixture',authorize:async()=>allowed,readContext:async()=>({brandId:'brand-a',productCatalog:[]}),readUiPages:async()=>({}),readMarketingWorkspace:async()=>({revision:'workspace-one'}),readInsight:async()=>({status:'missing'}),readCalendarNotes:async(a:any,h:any,m:any)=>calendar.readCalendarPlanning(db,contract.brandFor(a),h,now,m)})
const capability=configured.extraCapabilities.find((c:any)=>c.name==='amc.context')
const pageTool=configured.extraCapabilities.find((c:any)=>c.name==='amc.calendar_notes')
assert.equal(pageTool.effect,'read');assert.equal(pageTool.input.additionalProperties,false)
assert(!('brandId' in pageTool.input.properties),'tool brand identity cannot be supplied by the model')
rows=[note('2027-01-09','新品拍摄','午餐优先，上午拍摄。')]
const read=()=>capability.implementation.execute({}, {actor,taskId})
const initial=await read()
assert.equal(initial.calendarPlanning.notes[0].title,'新品拍摄')
assert(!JSON.stringify(initial.knowledge).includes('午餐优先'),'dated instructions are separate from brand facts')
rows[0]={...rows[0],title:'最新主推方向',body:'晚餐优先，下午拍摄。',version:2}
const fresh=await capability.revalidate({},initial,{actor,taskId})
assert.equal(fresh.calendarPlanning.notes[0].title,'最新主推方向');assert.notEqual(fresh.contextDigest,initial.contextDigest)
const assembler=createAmcContextAssembler({skillRoot:'skills'})
const assembled=await assembler.assemble({task:{id:taskId,input:{goal:'Plan next month'}},capability:{implementation:{skillMode:'progressive',skills:[],instructions:'Use dated human calendar plans.'}},actor,history:{calls:[{id:'context',task_id:taskId,capability:'amc.context',status:'succeeded',input:{},result:initial}],events:[]},dispatcher:{capabilities:new Map([['amc.context',capability]])}})
const modelInput=JSON.stringify(assembled)
assert(modelInput.includes('最新主推方向'));assert(modelInput.includes('晚餐优先'));assert(modelInput.includes('2027-01-09'))
assert(!modelInput.includes('午餐优先'),'old context is revalidated before model assembly')
const manifest=buildContextManifest(assembled,[])
assert.equal(manifest.calendarSources[0].revision,fresh.calendarPlanning.revision)
assert(!JSON.stringify(manifest).includes('晚餐优先'),'runtime manifests log fingerprints, not private note text')
artifact=JSON.stringify({kind:'conversation',brandId:'brand-a',content:'Discussion',contextDigest:initial.contextDigest})
const verify=(readResult:any,extraCalls:any[]=[])=>configured.verifyOutcome({}, {artifacts:[{path:intent.artifactPath}]},{actor,history:{calls:[{capability:'amc.context',status:'succeeded',result:readResult},{capability:'assistant.skills.read',status:'succeeded',input:{id:intent.topic==='brand_planning'?'amc-marketing-expert/SKILL.md':'amc-conversation/SKILL.md'}},...extraCalls]}})
const staleOutcome=await verify(initial)
assert.equal(staleOutcome.verified,false);assert.match(staleOutcome.feedback,/Calendar notes changed/)
const page=await pageTool.implementation.execute({month:'2027-01'},{actor,taskId})
assert.equal(page.notes[0].title,'最新主推方向')
const generalIntent=intent
intent={...intent,topic:'brand_planning',planningScope:{stage:'marketing_plan',mode:'discuss',startMonth:'2027-01'}}
rows.push(...Array.from({length:9},(_,i)=>note(`2028-02-${String(i+1).padStart(2,'0')}`,'Future direction','Future month constraint')))
const formalContext=await read()
artifact=JSON.stringify({kind:'conversation',brandId:'brand-a',content:'Formal strategy discussion',contextDigest:formalContext.contextDigest})
const formalCalls:any[]=[{capability:'amc.strategy_document',status:'succeeded',result:{format:'markdown'}}]
const futureFirst=await pageTool.implementation.execute({month:'2028-02'},{actor,taskId})
formalCalls.push({capability:'amc.calendar_notes',status:'succeeded',result:futureFirst})
const incomplete=await verify(formalContext,formalCalls)
assert.equal(incomplete.verified,false);assert.match(incomplete.feedback,/Read complete.*2028-02/)
formalCalls.push({capability:'amc.calendar_notes',status:'succeeded',result:await pageTool.implementation.execute({month:'2028-02',afterDate:futureFirst.nextAfterDate},{actor,taskId})})
assert.equal((await verify(formalContext,formalCalls)).verified,true,'real verifier accepts complete current on-demand pages')
formalCalls.push({...unavailableCall,result:{...unavailableCall.result,month:'2028-02'}})
const unavailableFormal=await verify(formalContext,formalCalls)
assert.equal(unavailableFormal.verified,false);assert.match(unavailableFormal.feedback,/2028-02.*unavailable/)
intent=generalIntent
rows=rows.filter(row=>!row.date.startsWith('2028-02'))
intent={...intent,topic:'brand_planning',profileSection:'marketing_plan'}
const profile=await read()
assert.equal(profile.calendarPlanning.revision,fresh.calendarPlanning.revision,'Profile and general conversations use the same note source')
assert.equal(profile.planningContext.workspace.workspace.marketingPlan.content,'Saved brand strategy')
intent={...intent,topic:'general',profileSection:undefined}
allowed=false;assert.equal(await pageTool.authorize(actor),false);assert.equal(await capability.authorize(actor),false)
allowed=true
rows[0]={...rows[0],title:'',body:'',version:3}
assert.equal((await read()).calendarPlanning.notes.length,0)
intent={...intent,brandId:'brand-b'}
const other=await capability.implementation.execute({}, {actor:contract.actorFor('brand-b','human'),taskId})
assert.equal(other.calendarPlanning.notes.length,0,'brand switches read a separately authorized scope')
// The actual planning transaction checks current revisions after taking the Brand lock.
const live=await calendar.readCalendarPlanning(db,'brand-a',hint)
let locked=false,knowledgeReads=0
const saveDb:any={...db,auditLog:{findFirst:async()=>null},$transaction:async(fn:any)=>fn({...db,$executeRawUnsafe:async()=>{},$queryRaw:async()=>{locked=true},auditLog:{findFirst:async()=>null},brandKnowledge:{findUnique:async()=>{knowledgeReads++;assert(locked);throw new Error('passed_calendar_guard')}}})}
const saver=compile('src/lib/ai-native/planning-workspace-save.ts',{'../prisma':{prisma:saveDb},'../calendarNoteContext':calendar,'@prisma/client':{Prisma:{}},'./planning-workspace-contract':{},'./strategy-receipt':{}})
await assert.rejects(()=>saver.savePlanningDraft('human','brand-a','plan',{}, {calendarPlanning:{revision:'stale',context:hint}}),/calendar_notes_changed/)
assert.equal(knowledgeReads,0,'a stale plan cannot reach business writes')
await assert.rejects(()=>saver.savePlanningDraft('human','brand-a','plan',{scope:{stage:'marketing_plan'}}, {calendarPlanning:{revision:live.revision,context:hint}}),/passed_calendar_guard/)
assert.equal(knowledgeReads,1)
console.log('PASS calendar timezone/month scope, 8k coverage, full pagination, invalidation, unavailable reads, authorized application context, real model-input assembly and stale-plan rejection (no provider requests)')
