import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const events:string[]=[],mod={exports:{} as any}
const deps:any={'./lib/performance-log':{installPerformanceLogging:()=>{}},'./lib/prisma':{prisma:{$connect:async()=>{events.push('database')}}},'./lib/role-permissions/store':{readPolicies:async()=>{events.push('policies')}}}
const worker=new Proxy({},{get:(_target,key)=>key==='then'?undefined:()=>events.push('worker')})
const delays:number[]=[]
new Function('require','module','exports','setTimeout',ts.transpileModule(readFileSync('src/instrumentation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((name:string)=>deps[name]||worker,mod,mod.exports,(fn:()=>void,delay:number)=>{delays.push(delay);fn()})
const runtime=process.env.NEXT_RUNTIME,phase=process.env.NEXT_PHASE
try{process.env.NEXT_RUNTIME='nodejs';delete process.env.NEXT_PHASE;await mod.exports.register();assert.deepEqual(events.slice(0,2),['database','policies']);assert(events.slice(2).every(v=>v==='worker'));events.length=0;process.env.NEXT_PHASE='phase-production-build';await mod.exports.register();assert.equal(events.length,0);delete process.env.NEXT_PHASE;let failures=0;deps['./lib/role-permissions/store'].readPolicies=async()=>{assert(!events.includes('worker'));if(failures++<3)throw Error('offline');events.push('policies')};await mod.exports.register();assert.deepEqual(delays,[1000,2000,4000]);assert.equal(events.filter(v=>v==='policies').length,1);assert(events.includes('worker'));assert.equal(events.slice(events.indexOf('policies')+1).filter(v=>v==='worker').length,8);console.log('PASS database/policy readiness, build exclusion, transient recovery/backoff and workers start only after recovery')}finally{if(runtime===undefined)delete process.env.NEXT_RUNTIME;else process.env.NEXT_RUNTIME=runtime;if(phase===undefined)delete process.env.NEXT_PHASE;else process.env.NEXT_PHASE=phase}
