import assert from 'node:assert/strict'
import {readOpenAIStream} from '../src/lib/global-text/openai-stream.ts'
import {complete} from '../src/lib/global-text/transport.ts'
const chunk=(choices:any[],usage?:any)=>({id:'stream-receipt',model:'fixture-model',choices,...(usage?{usage}:{})})
const part=(delta:any,finish_reason:any=null)=>chunk([{index:0,delta,finish_reason}])
const usage={prompt_tokens:18,completion_tokens:12,prompt_tokens_details:{cached_tokens:4}}
const args=JSON.stringify({content:{kind:'conversation',content:'坡晓馒“当天现蒸”\n仅为草案'}})
const frames=[part({tool_calls:[{index:0,id:'call-a',type:'function',function:{name:'my_write_workspace',arguments:args.slice(0,18)}}]}),part({tool_calls:[{index:0,function:{arguments:args.slice(18)}}]}),part({},'tool_calls'),chunk([],usage)]
const response=(values:any[],done=true)=>{
 const bytes=new TextEncoder().encode(values.map(x=>'data: '+JSON.stringify(x)+'\r\n\r\n').join('')+(done?'data: [DONE]\r\n\r\n':''));let i=0
 return new Response(new ReadableStream({pull(c){if(i===bytes.length){c.close();return}const n=Math.min(bytes.length,i+7);c.enqueue(bytes.slice(i,n));i=n}}),{headers:{'content-type':'text/event-stream'}})
}
const actual=await readOpenAIStream(response(frames))
assert.equal(actual.id,'stream-receipt');assert.deepEqual(actual.usage,usage);assert.equal(actual.choices[0].message.tool_calls![0].function.arguments,args)
assert.deepEqual(JSON.parse(actual.choices[0].message.tool_calls![0].function.arguments).content.content,'坡晓馒“当天现蒸”\n仅为草案')
await assert.rejects(()=>readOpenAIStream(response(frames,false)),(e:any)=>e.message==='Text stream incomplete'&&e.usage.inputTokens===18&&e.usageEvidence.providerReference==='stream-receipt')
const original=globalThis.fetch,bodies:any[]=[]
globalThis.fetch=async(_url:any,options:any)=>{bodies.push(JSON.parse(options.body));return response(frames)}
try{
 const result=await complete({id:'fixture',provider:'kopix',displayName:'Fixture',modelName:'glm-5.3',apiKey:'test-only',baseUrl:'https://fixture.invalid/v1'},{messages:[{role:'user',content:'Generate a complete plan'}],task:'brand_planning',maxTokens:18000,tools:[{type:'function',function:{name:'my_write_workspace',parameters:{type:'object'}}}]})
 assert.equal(result.usage?.input_tokens,18);assert.equal(result.providerReference,'stream-receipt');assert.equal(bodies[0].stream,true);assert.deepEqual(bodies[0].stream_options,{include_usage:true})
 globalThis.fetch=async(_url:any,options:any)=>{bodies.push(JSON.parse(options.body));return Response.json({id:'ordinary',choices:[{message:{content:'ordinary'},finish_reason:'stop'}],usage})}
 await complete({id:'fixture',provider:'kopix',displayName:'Fixture',modelName:'glm-5.3',apiKey:'test-only',baseUrl:'https://fixture.invalid/v1'},{messages:[{role:'user',content:'ordinary'}],task:'ai_native'})
 assert.equal(bodies[1].stream,false);assert.equal(bodies[1].stream_options,undefined)
 globalThis.fetch=async()=>response([part({},'length'),chunk([],usage)])
 await assert.rejects(()=>complete({id:'fixture',provider:'kopix',displayName:'Fixture',modelName:'glm-5.3',apiKey:'test-only'},{messages:[{role:'user',content:'plan'}],task:'brand_planning'}),(e:any)=>e.code==='MODEL_OUTPUT_LIMIT'&&e.usage.inputTokens===18)
}finally{globalThis.fetch=original}
console.log('PASS: fragmented Unicode/tool JSON, exact receipt and final usage, incomplete stream billing preservation, bounded full-planning stream and ordinary request isolation')

const markdown='# 完整策略\n\n正文、"引号"和表格保持原样。\n'
const previews:string[]=[]
const textFrames=[part({content:markdown.slice(0,8)}),part({content:markdown.slice(8)}),part({},'stop'),chunk([],usage)]
globalThis.fetch=async()=>response(textFrames)
try{
 const result=await complete({id:'fixture',provider:'kopix',displayName:'Fixture',modelName:'glm-5.3',apiKey:'test-only'},{messages:[{role:'user',content:'Full Markdown strategy'}],task:'brand_planning',toolChoice:'auto',onStreamText:t=>previews.push(t)})
 assert.equal(result.text,markdown);assert.equal(previews.at(-1),markdown);assert.equal(result.message.tool_calls,undefined);assert.equal(result.usage?.input_tokens,18)
}finally{globalThis.fetch=original}
console.log('PASS: plain Markdown streams without JSON conversion, preserves source text, preview and final usage')
