import assert from 'node:assert/strict'
import vm from 'node:vm'
import {build} from 'esbuild'
const config={version:1,secrets:{fixture:'not-a-secret'}},model={id:'fixture',protocol:'openai',definition:{name:'fixture',modelName:'fixture',maxTokensByTask:{platform_review:7000}},secretRef:'fixture',connectionId:'fixture'}
const modules:any={registry:'export const runtimeConfig=async()=>globalThis.config',types:'export const selectModel=()=>globalThis.model',runtime:'export const recordExecution=async value=>globalThis.records.push(value)',transport:'export const complete=async(_connection,input)=>{globalThis.request=input;if(globalThis.failure)throw globalThis.failure;return globalThis.response}'}
const result=await build({entryPoints:['src/lib/platform-ai/reviewer.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'ports',setup(b){b.onResolve({filter:/model-management\/(registry|types|runtime)$|global-text\/transport$/},args=>({path:args.path.split('/').at(-1)!,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path],loader:'js'}))}}]})
const context:any={module:{exports:{}},exports:{},config,model,records:[],response:{text:JSON.stringify({verdict:'no_findings',findings:'Test evidence verified'}),usage:{input_tokens:10,output_tokens:2},providerReference:'provider-1'}}
vm.runInNewContext(result.outputFiles[0].text,context)
const review=context.module.exports.reviewPatch
assert.equal((await review({patch:'fixture'})).verdict,'no_findings');assert.equal(context.request.maxTokens,7000,'central task limit is authoritative')
context.failure=Object.assign(new Error('limit'),{code:'MODEL_OUTPUT_LIMIT',usage:{inputTokens:12,outputTokens:7000},usageEvidence:{providerReference:'provider-limited'}})
const limited=await review({patch:'fixture'});assert.equal(limited.verdict,'inconclusive');assert.equal(limited.usage.output_tokens,7000);assert.equal(limited.providerReference,'provider-limited');assert.equal(context.records.at(-1).status,'failed')
context.failure.usage.inputTokens=null
await assert.rejects(()=>review({patch:'fixture'}),/limit/,'unmeasured failures must remain unresolved, never fabricate usage')
console.log('PASS reviewer central output policy, successful evidence, measured limit without approval, and unresolved usage failure')
