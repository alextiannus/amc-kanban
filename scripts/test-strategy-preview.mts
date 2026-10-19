import assert from 'node:assert/strict'
import {planningPreview} from '../src/lib/ai-native/planning-preview.ts'
import {readOpenAIStream} from '../src/lib/global-text/openai-stream.ts'
const content='家庭聚餐，保持定位。\n预算“减少三成” 😀'
const args=JSON.stringify({path:'work/a.json',expectedRevision:0,content:{kind:'conversation',brandId:'brand',content,planningDraft:{data:{large:'x'.repeat(1000)}}}})
let seen=false,previous=''
for(let i=0;i<args.length;i++){
 const prefix=planningPreview(args.slice(0,i),'work/a.json','brand')
 if(prefix){seen=true;assert(content.startsWith(prefix),'only the user-facing content prefix is exposed');assert(prefix.length>=previous.length);previous=prefix}
}
assert(seen);assert.equal(planningPreview(args,'work/a.json','brand'),content)
assert.equal(planningPreview(args,'work/other.json','brand'),null);assert.equal(planningPreview(args,'work/a.json','other'),null)
assert.equal(planningPreview(JSON.stringify({path:'work/a.json',description:'"content":{"kind":"conversation","brandId":"brand","content":"injected"}',content:{kind:'not-conversation',brandId:'brand',content:'private'}}),'work/a.json','brand'),null)
const frames=[{choices:[{index:0,delta:{tool_calls:[{index:0,id:'tool',type:'function',function:{name:'writer',arguments:args.slice(0,100)}}]}}]},{choices:[{index:0,delta:{tool_calls:[{index:0,function:{arguments:args.slice(100)}}]},finish_reason:'tool_calls'}]},{choices:[],usage:{prompt_tokens:10,completion_tokens:20}}]
const response=()=>new Response(frames.map(v=>'data: '+JSON.stringify(v)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})
let calls=0
const final=await readOpenAIStream(response(),()=>{calls++;throw Error('UI observer failure')})
assert(calls>0);assert.equal(final.choices[0].message.tool_calls![0].function.arguments,args);assert.equal(final.usage.completion_tokens,20)
console.log('PASS: fragmented JSON strings, Unicode, exact path and brand binding, no nested-property injection, observer failure preserves complete provider output and billing')
