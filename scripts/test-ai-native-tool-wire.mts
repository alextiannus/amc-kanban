import assert from 'node:assert/strict'
import {nativeWireTools,nativeWireCall} from '../src/lib/ai-native/tool-wire.ts'
const result:any={usage:{input_tokens:11,output_tokens:7,input_tokens_details:{cached_tokens:2}},rawUsage:{prompt_tokens:11},providerReference:'fixture'}
const input={result:{summary:'准备好了“完整脚本”\n无需发布',artifacts:[{path:'trusted.json',revision:1,digest:'a'.repeat(64)}]}}
const call={id:'call',type:'function',function:{name:'iaic_finish',arguments:JSON.stringify(input)}}
assert.deepEqual(nativeWireCall(call,result),call);assert.deepEqual(nativeWireCall({...call,function:{...call.function,arguments:input}},result),call)
const warnings:any[]=[];const warn=console.warn;console.warn=(...a)=>warnings.push(a)
try{for(const args of ['{"secret-brand-phrase":true,}','{"result": "a" + "b"}',null,[]])assert.throws(()=>nativeWireCall({...call,function:{...call.function,arguments:args}},result),(e:any)=>e.invalidAction===true&&e.code==='INVALID_MODEL_ACTION'&&e.usage.inputTokens===11&&e.usage.outputTokens===7&&e.usage.cachedInputTokens===2&&e.usageEvidence.providerReference==='fixture')}finally{console.warn=warn}
assert(!JSON.stringify(warnings).includes('secret-brand-phrase'))
const tool={name:'iaic_finish',description:'finish',parameters:{type:'object'}};assert(nativeWireTools([tool])[0].description.includes('literal JSON'));assert.equal(tool.description,'finish')
console.log('PASS: literal and object arguments preserve exact values; invalid JSON rejected with measured usage and redacted structural diagnostics')
