import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import * as types from '../src/lib/model-management/types.ts'
import * as contract from '../src/lib/model-management/executionContract.ts'
const model=(id:string,cap:string,protocol:string)=>({id,connectionId:id,secretRef:id,protocol,definition:{name:id,modelName:id,capabilities:[cap],inputCapabilities:['text_input','structured_json']}})
const selection={defaults:{text:'text',image_understanding:'image',video_generation:'video'},exceptions:{}}
const runtime={active:true,version:-1,selection,models:[model('text','text','kopix'),model('image','image_understanding','cn_gateway'),model('video','video_generation','baidu_seedance')],secrets:{text:'fixture'}}
let tasks:any[]=[{source:'kanban',executor:'content',task:'video_generation',modelName:'video',version:-1,passed:true}],http=200,bodyCalls=0
const dependencies:any={
 'node:crypto':crypto,'./types.ts':types,'./executionContract.ts':contract,
 '../prisma.ts':{prisma:{$executeRawUnsafe:async()=>{}}},
 './registry.ts':{configurationRuntime:async()=>runtime,configurationFingerprint:()=> 'fixture'},
 '../global-text/transport.ts':{complete:async(_:any,p:any)=>{
  if(p.task==='body_composition'){bodyCalls++;assert.equal(p.maxTokens,2048);return {text:'{"caption":"Lunch nearby","hashtags":[]}',message:{role:'assistant'}}}
  if(p.tools)return {message:{role:'assistant',tool_calls:[{id:'tool',function:{name:'echo_probe'}}]}}
  const tool=p.messages.find((m:any)=>m.role==='tool')
  const text=tool?tool.content:p.messages.length>1?p.messages[0].content:p.messages[0].content.includes('JSON')?'{"ok":true}':'OK'
  return {message:{role:'assistant',content:text},text}
 }},
}
const exports:any={};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/model-management/validation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports,Error,AbortSignal,require:(id:string)=>{assert.ok(dependencies[id],id);return dependencies[id]},process:{env:{AMC_CONTENT_SERVICE_URL:'https://content.fixture',AMC_MM_SERVICE_URL:'https://mm.fixture',CONTENT_SERVICE_INTERNAL_TOKEN:'fixture'}},
 fetch:async(url:string)=>url.includes('content.fixture')?Response.json({protocolVersion:2,executionContractVersion:1,delegatedMedia:true,success:tasks.every(t=>t.passed),tasks},{status:http}):Response.json({protocolVersion:2,success:true}),
})
const passed=await exports.validateSelection(selection);assert.equal(passed.passed,true,'media defaults do not require Kanban provider adapters');assert.equal(passed.checks['system.kanban'],true)
runtime.models[0].definition.modelName='glm-5.3'
assert.equal((await exports.validateSelection(selection)).checks.body_composition,true);assert.equal(bodyCalls,1)
tasks=[{...tasks[0],passed:false,error:'unsupported input'}];assert.equal((await exports.validateSelection(selection)).passed,false)
tasks=[{...tasks[0],passed:true,version:999}];const mismatch=await exports.validateSelection(selection);assert.equal(mismatch.passed,false);assert.match(mismatch.errors['system.content'],/version or executor mismatch/)
http=401;assert.equal((await exports.validateSelection(selection)).passed,false)
console.log('PASS Kanban preflight delegates media defaults, preserves failed tasks and rejects mismatched versions/authentication')
