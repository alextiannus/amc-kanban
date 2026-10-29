import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {PGlite} from '@electric-sql/pglite'
import {localPlanningTime} from '../src/lib/brand-plan/matchingContract.ts'
const transpile=(s:string)=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const module={exports:{} as any}
new Function('require','module','exports',transpile(readFileSync('src/lib/ai-native/idea-pool.ts','utf8')))((name:string)=>name.endsWith('matchingContract')?{localPlanningTime}:name.endsWith('daily-planning')?{advanceDailyPlanning:async()=>{}}:{},module,module.exports)
const {runIdeaPoolMaintenance,ideaRefreshDue}=module.exports
assert.equal(ideaRefreshDue(null),false)
const forbidden=()=>{throw Error('retired worker must not access data')}
const result=await runIdeaPoolMaintenance({query:forbidden},{brand:{findMany:forbidden}},forbidden,forbidden)
assert.equal(result.reason,'interactive_keyword_matching_only')
assert.equal((await module.exports.refreshBrandIdeas({query:forbidden},{})).skipped,true)
assert.equal(module.exports.startIdeaPoolWorker().enabled,false)
assert(!readFileSync('src/instrumentation.ts','utf8').includes('startIdeaPoolWorker'))
console.log('PASS retired discovery worker performs zero queries, matches or scheduling')
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
