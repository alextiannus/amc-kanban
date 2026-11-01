import assert from 'node:assert/strict'
import {complete} from '../src/lib/global-text/transport.ts'
import {planningPreview} from '../src/lib/ai-native/planning-preview.ts'
const connection={id:'fixture',provider:'kopix',displayName:'Fixture',modelName:'glm-5.3',apiKey:'test-only'}
const original=globalThis.fetch,encoder=new TextEncoder()
const frame=(value:any)=>encoder.encode('data: '+JSON.stringify(value)+'\n\n')
const args=JSON.stringify({path:'work/reply.json',expectedRevision:0,content:{kind:'conversation',brandId:'brand',content:'第一段已经生成。\n\n第二段稍后完成。',contextDigest:'a'.repeat(64)}})
const cut=args.indexOf('第二段'),previews:string[]=[]
let controller:ReadableStreamDefaultController<Uint8Array>,resolveFirst:()=>void,completed=false
const first=new Promise<void>(resolve=>resolveFirst=resolve)
globalThis.fetch=async(_url,options)=>{
 const body=JSON.parse(String(options?.body));assert.equal(body.stream,true,'ordinary chat with observer must request streaming');assert.deepEqual(body.stream_options,{include_usage:true})
 return new Response(new ReadableStream({start(c){controller=c;c.enqueue(frame({choices:[{index:0,delta:{tool_calls:[{index:0,id:'call',type:'function',function:{name:'writer',arguments:args.slice(0,cut)}}]}}]}))}}),{headers:{'content-type':'text/event-stream'}})
}
try{
 const result=complete(connection,{task:'ai_native',messages:[{role:'user',content:'只读说明'}],tools:[{type:'function',function:{name:'writer',parameters:{type:'object'}}}],onStreamTools(calls){const text=planningPreview(calls[0]?.function.arguments,'work/reply.json','brand');if(text){previews.push(text);resolveFirst()}}}).then(result=>{completed=true;return result})
 let timer:ReturnType<typeof setTimeout>|undefined
 try{await Promise.race([first,result.then(()=>{throw Error('completed before first preview')}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('no early preview')),1000)})])}finally{clearTimeout(timer)}
 assert.equal(completed,false,'preview visible before provider completes')
 assert(previews[0].includes('第一段已经生成。'));assert(!previews[0].includes('第二段'))
 controller!.enqueue(frame({choices:[{index:0,delta:{tool_calls:[{index:0,function:{arguments:args.slice(cut)}}]},finish_reason:'tool_calls'}]}))
 controller!.enqueue(frame({id:'receipt',model:'fixture',choices:[],usage:{prompt_tokens:40,completion_tokens:30}}));controller!.enqueue(encoder.encode('data: [DONE]\n\n'));controller!.close()
 const final=await result
 assert.equal(final.message.tool_calls![0].function.arguments,args);assert.equal(final.usage?.input_tokens,40);assert.equal(final.usage?.output_tokens,30)
 assert(previews.at(-1)!.includes('第二段稍后完成。'))
 // Compatible providers may ignore the streaming request and return JSON.
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:'fallback'},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:1}})
 assert.equal((await complete(connection,{task:'ai_native',messages:[{role:'user',content:'read'}],onStreamTools(){throw Error('must not invent deltas')}})).text,'fallback')
 globalThis.fetch=async(_url,options)=>{assert.equal(JSON.parse(String(options?.body)).stream,false);return Response.json({choices:[{message:{content:'ordinary'},finish_reason:'stop'}]})}
 await complete(connection,{task:'ai_native',messages:[{role:'user',content:'no observer'}]})
 console.log('PASS ordinary chat transport: first paragraph before provider completion, exact final artifact/usage, JSON fallback, unrelated requests unchanged')
}finally{globalThis.fetch=original}
