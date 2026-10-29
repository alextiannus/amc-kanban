import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {PGlite} from '@electric-sql/pglite'
import {localPlanningTime} from '../src/lib/brand-plan/matchingContract.ts'
const transpile=(s:string)=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const module={exports:{} as any}
new Function('require','module','exports',transpile(readFileSync('src/lib/ai-native/idea-pool.ts','utf8')))((name:string)=>name.endsWith('matchingContract')?{localPlanningTime}:name.endsWith('daily-planning')?{advanceDailyPlanning:async()=>{}}:{},module,module.exports)
const {runIdeaPoolMaintenance,ideaRefreshDue}=module.exports
const now=new Date('2026-10-29T18:00:00Z'),old=new Date(+now-16*60000)
assert(ideaRefreshDue(null,now));assert(!ideaRefreshDue({status:'completed'},now));assert(!ideaRefreshDue({status:'running',attempts:1,started_at:now},now));assert(ideaRefreshDue({status:'failed',attempts:2,started_at:old},now));assert(!ideaRefreshDue({status:'failed',attempts:3,started_at:old},now))
let reads=0,queries=0,refreshes=0
const db={brand:{findMany:async(args:any)=>{assert.deepEqual(args.select,{id:true,timezone:true});return [{id:'day',timezone:'UTC'},{id:'completed',timezone:'Asia/Singapore'},{id:'retry',timezone:'Asia/Singapore'},{id:'busy',timezone:'Asia/Singapore'}]}}}
const pool={query:async(_sql:string,params:any[])=>{queries++;assert(!params[0].includes('day'));return {rows:[{brand_id:'completed',local_day:'2026-10-30',status:'completed'}, {brand_id:'retry',local_day:'2026-10-30',status:'failed',attempts:2,started_at:old},{brand_id:'busy',local_day:'2026-10-30',status:'running',attempts:1,started_at:now}]}}}
await runIdeaPoolMaintenance(pool,db,async(_db:any,id:string)=>{reads++;assert.equal(id,'retry');return {id}},async()=>{refreshes++},now)
assert.equal(queries,1);assert.equal(reads,1);assert.equal(refreshes,1)
await runIdeaPoolMaintenance({query:()=>{throw Error('daytime must not query daily ledger')}},{brand:{findMany:async()=>[{id:'day',timezone:'UTC'}]}},()=>{throw Error('daytime must not load facts')},()=>{},now)
console.log('PASS daytime and completed/leased daily work avoids heavy reads; due retry alone hydrates facts')
const autopilot=readFileSync('src/lib/ai-native/autopilot.ts','utf8'),scheduler=autopilot.slice(autopilot.indexOf('const state=globalThis as typeof globalThis&{autopilotWorker'))
let time=1000000,tick:any,defaults=0,admissions=0,defaultsQueries=0,revision=1,status='waiting'
class Clock extends Date{static now(){return time}}
const dbPool={query:async(sql:string)=>sql.includes('NOT EXISTS')?(defaultsQueries++,{rows:[{id:'new'}]}):{rows:[{brand_id:'brand',revision,status}]}}
const mod={exports:{} as any}
new Function('module','exports','globalThis','autopilotDb','initializeBrandAutopilotDefault','admitAutopilotDay','setInterval','process','Date',transpile(scheduler))(mod,mod.exports,{},async()=>dbPool,async()=>{defaults++},async()=>{admissions++},(fn:any)=>{tick=async()=>{fn();for(let i=0;i<20;i++)await Promise.resolve()};return {unref(){}}},{once(){}},Clock)
mod.exports.startAutopilotWorker();for(let i=0;i<20;i++)await Promise.resolve();assert.equal(admissions,1);assert.equal(defaults,1)
time+=30000;await tick();assert.equal(admissions,1);assert.equal(defaultsQueries,1)
revision++;await tick();assert.equal(admissions,2,'configuration change must not wait for idle interval')
time+=300000;await tick();assert.equal(admissions,3);assert.equal(defaultsQueries,2)
status='running';await tick();assert.equal(admissions,4);time+=30000;await tick();assert.equal(admissions,4);time+=30000;await tick();assert.equal(admissions,5)
console.log('PASS missing-only bootstrap, waiting/active cadence, configuration changes bypass delay')
const service=readFileSync('src/lib/ai-native/service.ts','utf8')
const sql=service.match(/pool.query\("(SELECT task_id,subject_id,intent->>'brandId'[^"]+)"\)/)![1]
const pg=new PGlite();try{await pg.exec('create table amc_ai_requests(task_id text,subject_id text,intent jsonb,planning_result jsonb,planning_checked_at timestamptz,created_at timestamptz)');await pg.exec(`insert into amc_ai_requests values ('new','u','{"autoSavePlanning":true}',null,null,now()),('recent','u','{"autoSavePlanning":true}',null,now(),now()),('due','u','{"autoSavePlanning":true}',null,now()-interval '31 seconds',now()),('done','u','{"autoSavePlanning":true}','{}',null,now())`);assert.deepEqual((await pg.query(sql)).rows.map((r:any)=>r.task_id),['new','due'])}finally{await pg.close()}
console.log('PASS planning completion scan skips recently checked and completed requests')
