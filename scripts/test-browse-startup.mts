import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const events:string[]=[],mod={exports:{} as any}
const deps:any={'./lib/performance-log':{installPerformanceLogging:()=>{}},'./lib/prisma':{prisma:{$connect:async()=>{events.push('database')}}},'./lib/role-permissions/store':{readPolicies:async()=>{events.push('policies')}}}
const worker=new Proxy({},{get:(_target,key)=>key==='then'?undefined:()=>events.push('worker')})
new Function('require','module','exports',ts.transpileModule(readFileSync('src/instrumentation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((name:string)=>deps[name]||worker,mod,mod.exports)
const runtime=process.env.NEXT_RUNTIME,phase=process.env.NEXT_PHASE
try{process.env.NEXT_RUNTIME='nodejs';delete process.env.NEXT_PHASE;await mod.exports.register();assert.deepEqual(events.slice(0,2),['database','policies']);assert(events.slice(2).every(v=>v==='worker'));events.length=0;process.env.NEXT_PHASE='phase-production-build';await mod.exports.register();assert.equal(events.length,0);delete process.env.NEXT_PHASE;deps['./lib/role-permissions/store'].readPolicies=async()=>{throw Error('offline')};await assert.rejects(mod.exports.register(),/offline/);assert(!events.includes('worker'));console.log('PASS database/policy readiness before workers, build exclusion, failure does not admit an unready instance')}finally{if(runtime===undefined)delete process.env.NEXT_RUNTIME;else process.env.NEXT_RUNTIME=runtime;if(phase===undefined)delete process.env.NEXT_PHASE;else process.env.NEXT_PHASE=phase}
