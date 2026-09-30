import assert from 'node:assert/strict'
import {normalizeTextUsage,complete} from '../src/lib/global-text/transport.ts'
assert.equal(normalizeTextUsage('openai',undefined),undefined)
assert.deepEqual(normalizeTextUsage('google',{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:30,cachedContentTokenCount:5}),{input_tokens:10,output_tokens:50,input_tokens_details:{cached_tokens:5},output_tokens_details:{reasoning_tokens:30}})
assert.deepEqual(normalizeTextUsage('anthropic',{input_tokens:10,cache_creation_input_tokens:20,cache_read_input_tokens:30,output_tokens:40}),{input_tokens:60,output_tokens:40,input_tokens_details:{cached_tokens:30}})
assert.equal(normalizeTextUsage('openai',{prompt_tokens:'unknown',completion_tokens:3})?.input_tokens,null)
const original=globalThis.fetch
try{
 globalThis.fetch=async()=>Response.json({id:'request',usage:{prompt_tokens:10,completion_tokens:6000},choices:[{finish_reason:'length',message:{content:''}}]})
 await assert.rejects(()=>complete({id:'fixture',provider:'openai',displayName:'fixture',modelName:'fixture',baseUrl:'https://fixture.invalid/v1',apiKey:'not-real'},{messages:[{role:'user',content:'x'}]}),(error:any)=>error.code==='MODEL_OUTPUT_LIMIT'&&error.usage.inputTokens===10&&error.usage.outputTokens===6000)
 let sent:any
 globalThis.fetch=async(_url,init)=>{sent=JSON.parse(String(init?.body));return Response.json({usage:{prompt_tokens:10,completion_tokens:20},choices:[{finish_reason:'stop',message:{content:'ok'}}]})}
 const glm={id:'fixture',provider:'openai',displayName:'fixture',modelName:'glm-5.3',baseUrl:'https://fixture.invalid/v1',apiKey:'not-real'}
 await complete(glm,{messages:[{role:'user',content:'tool step'}],task:'ai_native',maxTokens:6000});assert.equal(sent.reasoning_effort,'low');assert.equal(sent.max_tokens,6000)
 await complete({...glm,reasoningEffort:'high'},{messages:[{role:'user',content:'tool step'}],task:'ai_native',maxTokens:6000});assert.equal(sent.reasoning_effort,'high','explicit central reasoning must win')
 await complete({...glm,modelName:'other'},{messages:[{role:'user',content:'tool step'}],task:'ai_native'});assert.equal(sent.reasoning_effort,undefined,'no new fallback for unrelated models')
}finally{globalThis.fetch=original}
console.log('PASS: measured usage, cached input, reasoning output, missing usage and output-limit settlement evidence; bounded native reasoning default preserves explicit central policy')
