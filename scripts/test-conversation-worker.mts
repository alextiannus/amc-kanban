import assert from 'node:assert/strict'
import {wakeConversationRuntime} from '../src/lib/ai-native/conversation-worker.mjs'
// Reproduce Core coalescing an admission tick into a task already running.
let release!:(value:any)=>void
const busy=new Promise(resolve=>{release=resolve})
const processed:string[]=[],queue=['new-request','second-request']
let running:any=busy,calls=0
const runtime={tick(){calls++;if(running)return running;const id=queue.shift();if(!id)return Promise.resolve(null);processed.push(id);return Promise.resolve({id,status:'succeeded'})}}
busy.finally(()=>{running=null})
const pump=wakeConversationRuntime(runtime)
assert.equal(wakeConversationRuntime(runtime),pump,'many wakeups share one drain loop')
await Promise.resolve();assert.equal(calls,1);assert.deepEqual(processed,[])
release({id:'preceding-request',status:'succeeded'})
await pump
assert.deepEqual(processed,['new-request','second-request'],'busy wake must advance the queued requests without a periodic tick')
assert.equal(calls,4,'stop when queue is empty')
queue.push('later-request');await wakeConversationRuntime(runtime);assert.equal(processed.at(-1),'later-request')
for(const state of ['standby','retired']){let n=0;await wakeConversationRuntime({tick:async()=>{n++;return null}});assert.equal(n,1,state)}
let n=0;const original=console.error;console.error=()=>{}
try{const failing={tick:async()=>{n++;throw new Error('fixture')}};await wakeConversationRuntime(failing);assert.equal(n,1);await wakeConversationRuntime(failing);assert.equal(n,2,'failure releases pump for a future wake')}finally{console.error=original}
console.log('PASS: busy admission wake drains FIFO, coalesces, stops on idle/standby/retirement and recovers after error')
