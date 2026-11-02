import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import ts from 'typescript'

// Exercise the real capability and HTTP bridge with in-memory receipts and no providers.
const require=createRequire(import.meta.url)
function load(file:string,dependencies:Record<string,unknown>,globals:Record<string,unknown>={}) {
 const code=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:file,
 }).outputText
 const exports:Record<string,any>={}
 const context={exports,module:{exports},require:(id:string)=>id in dependencies?dependencies[id]:id.startsWith('node:')?require(id):{},
  process,console,Response,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,...globals}
 vm.runInNewContext(code,context,{filename:file})
 return exports
}

let current:any,report:any,reportReads=0,bridgeCalls=0,statusReads=0
const pool={connect:async()=>({query:async()=>({rows:[]}),release(){}}),query:async(sql:string,args:any[])=>{
 if(sql.startsWith('SELECT r.*'))return {rows:[current]}
 if(sql.startsWith('UPDATE amc_iaic.autopilot_runs SET step=')){
  current={...current,step:args[1],evidence:JSON.parse(args[2])};return {rows:[]}
 }
 throw Error('Unexpected SQL: '+sql)
}}
const autopilot=load('src/lib/ai-native/autopilot.ts',{
 '../prisma':{prisma:{socialAccount:{findFirst:async()=>({id:'account'})},brandGrowthResearchSnapshot:{findFirst:async(query:any)=>{
  reportReads++
  assert.equal(query.where.brandId,'brand-a','report lookup remains brand scoped')
  assert.equal(query.where.source,'amc-growth')
  assert.equal(query.where.generatedAt,undefined,'age cannot trigger a fresh research submission')
  return report
 }}}},
 './autopilot-store':{autopilotDb:async()=>pool,requireAutopilotOwner:async(userId:string,brandId:string)=>{
  assert.equal(userId,'owner');assert.equal(brandId,'brand-a')
 }},
 './contract':{nativeError:(code:string)=>Object.assign(new Error(code),{code})},
 '../brand-plan/service':{loadBrandPlanBrand:async()=>{bridgeCalls++;throw Error('Unexpected brand load for research creation')},
  buildGrowthResearchReport:async()=>{bridgeCalls++;throw Error('Unexpected research creation')},saveResearchReport:async()=>{throw Error('Unexpected save')}},
 '../growthDataCenter':{readGrowthResearchJob:async(id:string)=>{statusReads++;assert.equal(id,'original-job');return {job_id:id,status:'failed'}},
  growthAutopilotEvidence:async()=>{throw Error('Unexpected evidence approval')}},
})
function reset(evidence:any={}) {
 current={id:'run-a',brand_id:'brand-a',owner_id:'owner',account_id:'account',current_owner:'owner',current_account:'account',
  enabled:true,daily_limit:1,current_limit:1,evidence}
 report=null;reportReads=0;bridgeCalls=0;statusReads=0
}
const start=()=>autopilot.executeAutopilot('owner','brand-a','run-a','research_start',{})

reset()
report={id:'old-report',generatedAt:new Date('2025-01-01T00:00:00Z')}
const originalDate=report.generatedAt.toISOString()
assert.equal((await start()).snapshotId,'old-report','old reports are reusable across days')
assert.equal(report.generatedAt.toISOString(),originalDate,'reuse does not change source freshness')
await start();assert.equal(reportReads,1);assert.equal(bridgeCalls,0)

reset()
const missing=await start()
assert.equal(missing.ready,true)
assert.equal(missing.limitedEvidence.mode,'limited')
assert.equal(missing.limitedEvidence.reason,'automatic_research_disabled')
assert.equal(missing.limitedEvidence.fullReportAvailable,false)
assert.equal(current.evidence.researchStarted,undefined)
assert.equal(current.evidence.researchJobId,undefined)
assert.equal(current.evidence.researchSnapshotId,undefined)
await start();assert.equal(reportReads,1,'replayed limited evidence is stable');assert.equal(bridgeCalls,0)
// A new brand-local day must not restart collection when yesterday had no complete report.
current={...current,id:'next-day',evidence:{}}
assert.equal((await start()).limitedEvidence.reason,'automatic_research_disabled')
assert.equal(bridgeCalls,0)

reset({researchStarted:true})
await assert.rejects(start,(e:any)=>e.code==='research_result_unknown')
assert.equal(reportReads,0);assert.equal(bridgeCalls,0,'unknown submissions are never retried')

reset({researchJobId:'original-job',researchStarted:true})
assert.equal((await start()).jobId,'original-job')
assert.equal(statusReads,1);assert.equal(reportReads,0);assert.equal(bridgeCalls,0,'original jobs are reconciled without replacement')
console.log('PASS: real autopilot capability reuses old reports, records missing evidence, survives replay/new day and preserves unknown/original jobs without research creation')

const requests:Array<{url:string;init:RequestInit}>=[]
const bridge=load('src/lib/growthDataCenter.ts',{}, {fetch:async(url:string,init:RequestInit)=>{
 requests.push({url,init})
 return Response.json({job_id:'original-job',status:'evidence_review'})
}})
const brand={id:'brand-a',name:'Known brand',accounts:[]}
await assert.rejects(()=>bridge.generateGrowthResearchReportForBrand(brand,{}, {requestKey:'autopilot-run-a'}),
 (e:any)=>e.code==='autopilot_research_creation_disabled'&&e.status===409)
assert.equal(requests.length,0,'the lower bridge refuses automatic creation before any HTTP request')
await bridge.generateGrowthResearchReportForBrand(brand,{}, {jobId:'original-job',requestKey:'autopilot-run-a'})
assert.equal(requests.length,1);assert.equal(requests[0].init.method,'GET')
assert(requests[0].url.endsWith('/v1/brand-intelligence/jobs/original-job'))
await bridge.generateGrowthResearchReportForBrand(brand,{}, {requestKey:'manual-request'})
assert.equal(requests.length,2);assert.equal(requests[1].init.method,'POST')
assert(requests[1].url.endsWith('/v1/brand-intelligence-intake'))
assert.equal(JSON.parse(String(requests[1].init.body)).force_refresh,true,'explicit manual research remains supported')

const health=load('src/app/api/health/version/route.ts',{})
assert.equal((await (await health.GET()).json()).autopilot_research_auto_create_enabled,false)
console.log('PASS: lower bridge blocks automatic POST, retains original-job GET and manual POST; health exposes the deployed policy')
