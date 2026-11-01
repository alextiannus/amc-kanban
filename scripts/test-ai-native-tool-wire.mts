import assert from 'node:assert/strict'
import {nativeWireTools,nativeWireCall,nativeWireCalls} from '../src/lib/ai-native/tool-wire.ts'
const result:any={usage:{input_tokens:11,output_tokens:7,input_tokens_details:{cached_tokens:2}},rawUsage:{prompt_tokens:11},providerReference:'fixture'}
const input={result:{summary:'准备好了“完整脚本”\n无需发布',artifacts:[{path:'trusted.json',revision:1,digest:'a'.repeat(64)}]}}
const call={id:'call',type:'function',function:{name:'iaic_finish',arguments:JSON.stringify(input)}}
assert.deepEqual(nativeWireCall(call,result),call);assert.deepEqual(nativeWireCall({...call,function:{...call.function,arguments:input}},result),call)
const warnings:any[]=[];const warn=console.warn;console.warn=(...a)=>warnings.push(a)
try{for(const args of ['{"secret-brand-phrase":true,}','{"result": "a" + "b"}',null,[]])assert.throws(()=>nativeWireCall({...call,function:{...call.function,arguments:args}},result),(e:any)=>e.invalidAction===true&&e.code==='INVALID_MODEL_ACTION'&&e.usage.inputTokens===11&&e.usage.outputTokens===7&&e.usage.cachedInputTokens===2&&e.usageEvidence.providerReference==='fixture')}finally{console.warn=warn}
assert(!JSON.stringify(warnings).includes('secret-brand-phrase'))
const tool={name:'iaic_finish',description:'finish',parameters:{type:'object'}};assert(nativeWireTools([tool])[0].description.includes('literal JSON'));assert.equal(tool.description,'finish')
console.log('PASS: literal and object arguments preserve exact values; invalid JSON rejected with measured usage and redacted structural diagnostics')

const workspaceTools=[{name:'cap_7',parameters:{properties:{path:{},content:{},expectedRevision:{},mediaType:{}}}}]
const write=(content:string)=>({function:{name:'cap_7',arguments:JSON.stringify({path:'work/test.json',mediaType:'application/json',expectedRevision:0,content})}})
const valid=write(JSON.stringify({planning:'精确保留“引号”与换行\n第二行'}))
assert.deepEqual(nativeWireCall(valid,result,workspaceTools),valid)
console.warn=()=>{}
try{assert.throws(()=>nativeWireCall(write('{"planning":"broken",}'),result,workspaceTools),(e:any)=>e.code==='INVALID_MODEL_ACTION'&&e.usage.inputTokens===11&&e.usageEvidence.providerReference==='fixture')}finally{console.warn=warn}
console.log('PASS: aliased workspace writer rejects malformed nested JSON before execution, preserving usage')

console.warn=()=>{}
try{for(const calls of [undefined,null,{},'not an array',[],[null],[{}],[{function:null}]])assert.throws(()=>nativeWireCalls(calls,result,workspaceTools),(e:any)=>e.code==='INVALID_MODEL_ACTION'&&e.invalidAction===true&&e.usage.outputTokens===7&&e.usageEvidence.providerReference==='fixture')}finally{console.warn=warn}
assert.deepEqual(nativeWireCalls([valid],result,workspaceTools),[valid])
console.log('PASS: malformed or missing provider tool-call structures retain known usage instead of becoming unmetered exceptions')

const document={content:'草稿摘要：包含“引号”、\\路径和换行\n第二行',planningDraft:{scope:{stage:'marketing_plan',startMonth:'2026-10',mode:'draft'},expectedRevision:'a'.repeat(64),title:'坡晓馒',content:'摘要',data:{activities:['新品“试吃”仅为建议','店内配合：包装与自取提示\n不含堂食']}}}
const objectWrite={function:{name:'cap_7',arguments:JSON.stringify({path:'work/test.json',mediaType:'application/json',expectedRevision:0,content:document})}}
const structuredTools=nativeWireTools(workspaceTools,true)
assert.equal(structuredTools[0].parameters.properties.content.type,'object')
assert.equal((workspaceTools[0].parameters.properties.content as any).type,undefined,'Advertised Core schema is never mutated')
const normalized=nativeWireCall(objectWrite,result,workspaceTools,true)
assert.deepEqual(JSON.parse(JSON.parse(normalized.function.arguments).content),document,'Structured transport preserves every nested value and quote exactly')
assert.deepEqual(nativeWireCalls([objectWrite],result,workspaceTools,true),[normalized])
console.warn=()=>{}
try{assert.throws(()=>nativeWireCall(objectWrite,result,workspaceTools),(e:any)=>e.code==='INVALID_MODEL_ACTION');assert.throws(()=>nativeWireCall(write('{"still":"invalid",}'),result,workspaceTools,true),(e:any)=>e.code==='INVALID_MODEL_ACTION')}finally{console.warn=warn}
console.log('PASS: trusted planning object transport serializes exact JSON without nested model escaping; other flows and malformed strings retain strict validation')

const bound:any={kind:'conversation',topic:'brand_planning',brandId:'case-brand',artifactPath:'work/test.json',planningScope:{stage:'marketing_plan',mode:'draft',startMonth:'2026-10'}}
const body={contextDigest:'a'.repeat(64),planningDraft:{content:'已生成的摘要',data:{unchanged:'原始业务数据'}}}
const missing={function:{name:'cap_7',arguments:JSON.stringify({path:bound.artifactPath,mediaType:'application/json',expectedRevision:0,content:body})}}
const envelope=JSON.parse(JSON.parse(nativeWireCall(missing,result,workspaceTools,true,bound).function.arguments).content)
assert.equal(envelope.kind,'conversation');assert.equal(envelope.brandId,'case-brand');assert.equal(envelope.content,body.planningDraft.content);assert.deepEqual(envelope.planningDraft,body.planningDraft)
const wrong=structuredClone(missing);wrong.function.arguments=JSON.stringify({...JSON.parse(wrong.function.arguments),content:{...body,brandId:'other-brand',kind:'wrong',content:'existing'}})
const retained=JSON.parse(JSON.parse(nativeWireCall(wrong,result,workspaceTools,true,bound).function.arguments).content)
assert.equal(retained.brandId,'other-brand');assert.equal(retained.kind,'wrong');assert.equal(retained.content,'existing','do not overwrite wrong supplied values; normal verifier must reject them')
console.log('PASS: fill only missing trusted envelope metadata; preserve generated data, source digest and supplied mismatches for rejection')

// Production regression: ordinary discussion wrote a valid answer 17 times without kind.
const {conversationFrom}=await import('../src/lib/ai-native/contract.ts')
const discussion:any={kind:'conversation',topic:'brand_planning',brandId:'case-brand',artifactPath:'work/test.json',goal:'AMC的商家访谈现在有什么内容？',history:[]}
const plain={brandId:discussion.brandId,contextDigest:'a'.repeat(64),content:'当前没有保存的原始访谈。',planningProgress:{stage:'interview',summary:'读取现有资料'}}
assert.throws(()=>conversationFrom(JSON.stringify(plain),discussion),/reply_kind_must_be_conversation/)
const reply=JSON.parse(nativeWireCall(write(JSON.stringify(plain)),result,workspaceTools,false,discussion).function.arguments).content
assert.equal(conversationFrom(reply,discussion).content,plain.content)
for(const topic of ['general','brand_planning']){
 const intent={...discussion,topic},document={content:'Existing reply',contextDigest:'b'.repeat(64)}
 const value=JSON.parse(nativeWireCall(write(JSON.stringify(document)),result,workspaceTools,false,intent).function.arguments).content
 assert.equal(conversationFrom(value,intent).kind,'conversation')
 for(const patch of [{brandId:'another-brand'},{kind:'wrong'},{contextDigest:'invalid'}]){
  const invalid=JSON.parse(nativeWireCall(write(JSON.stringify({...document,...patch})),result,workspaceTools,false,intent).function.arguments).content
  assert.throws(()=>conversationFrom(invalid,intent))
 }
}
const differentPath={...discussion,artifactPath:'work/other.json'}
assert.deepEqual(nativeWireCall(write(JSON.stringify(plain)),result,workspaceTools,false,differentPath),write(JSON.stringify(plain)))
console.log('PASS: production missing-kind regression completes; wrong brands/types/digests still rejected; unrelated paths unchanged')
