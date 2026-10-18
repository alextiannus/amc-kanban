import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
let calls:any[]=[],cancelled=0
const module={exports:{} as any},code=ts.transpileModule(readFileSync('src/lib/brand-plan/interview-task-recovery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
new Function('require','module','exports',code)((name:string)=>name.includes('contract')?{actorFor:(brandId:string,userId:string)=>({brandId,userId}),nativeError:(code:string,statusCode:number)=>Object.assign(Error(code),{statusCode})}:{getNativeHost:async()=>({app:{tasks:{history:async(actor:any,id:any)=>{assert.equal(actor.brandId,'brand');assert.equal(actor.userId,'owner');assert.equal(id,'task');return {calls}}}}}),controlNativeTask:async(_u:any,_b:any,_id:any,body:any)=>{assert.equal(body.action,'cancel');cancelled++}},module,module.exports)
const retry=()=>module.exports.prepareInterviewRetry('owner','brand','task','waiting')
for(const set of [[],[{capability:'amc.context',status:'succeeded'}],[{capability:'amc.context',status:'succeeded'},{capability:'my_write_workspace',status:'succeeded'}]]){calls=set;await retry()}
assert.equal(cancelled,3)
for(const set of [[{capability:'amc.context',status:'unknown'}],[{capability:'my_write_workspace',status:'running'}],[{capability:'amc.publish',status:'succeeded'}]]){calls=set;await assert.rejects(retry,/interview_recovery_requires_review/)}
assert.equal(cancelled,3,'Unknown or external operations cannot be cancelled and duplicated')
console.log('PASS: explicit draft recovery preserves old records and rejects uncertain or external operations')
