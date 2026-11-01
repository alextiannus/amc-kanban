import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as crypto from 'node:crypto'
const writes:any[]=[],pages:number[]=[],itemPages:number[]=[]
let overflow=false
const item=(i:number)=>({id:`item-${i}`,direction:'INBOUND',state:'VISIBLE',unread:false,canReply:false,canPrivateReply:true,raw:{canPrivateReply:true}})
const conversation=(i:number)=>({id:`c-${i}`,socialMediaId:'account',platform:'instagram',unreadCount:0,needsAttention:false,raw:{canReply:true,maxReplyLength:2200,maxPrivateReplyLengthBytes:1000}})
const deps:any={
 'node:crypto':crypto,'@prisma/client':{},
 '@/lib/prisma':{prisma:{socialAccount:{findMany:async()=>[{id:'local',postfastAccountId:'account'}]},actionItem:{findMany:async()=>[]},postfastInboxConversation:{upsert:async(x:any)=>({id:x.create.providerId})},postfastInboxItem:{upsert:async(x:any)=>writes.push(x.create)}}},
 '@/lib/integrations/postfast':{
  POSTFAST_INBOX_PAGE_SIZE:50,
  postfastListInboxConversations:async(_:any,o:any)=>{assert.equal(o.limit,50);pages.push(o.page);return {success:true,conversations:o.page===0?Array.from({length:50},(_,i)=>conversation(i)):o.page===1?[conversation(50)]:[],hasNextPage:overflow||o.page===0}},
  postfastListInboxItems:async(_:any,id:string,o:any)=>{assert.equal(o.limit,50);itemPages.push(o.page);const count=id==='c-0'&&o.page===0?50:1;return {success:true,items:Array.from({length:count},(_,i)=>item(i+o.page*50)),hasNextPage:id==='c-0'&&o.page===0}},
 }
}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/postfastInbox.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>{assert(key in deps,key);return deps[key]},mod,mod.exports)
const result=await mod.exports.syncPostfastInbox('brand','not-real-key')
assert.equal(result.conversations,51);assert.deepEqual(pages,[0,1]);assert.equal(result.items,101);assert(itemPages.includes(1));assert.equal(writes[0].canReply,true);assert.equal(writes[0].maxReplyLength,2200)
const project=mod.exports.inboxItemData
assert.equal(project('c',item(0),{canReply:false}).canReply,false)
assert.equal(project('c',{...item(0),raw:{canReply:false}},{canReply:true}).canReply,false)
assert.equal(project('c',{...item(0),direction:'OUTBOUND'},{canReply:true}).canReply,false)
assert.equal(project('c',{...item(0),state:'DELETED'},{canReply:true}).canReply,false)
assert.equal(project('c',item(0),{}).canReply,false)
assert.equal(project('c',item(0),{canReply:true}).canPrivateReply,true)
overflow=true;pages.length=0
await assert.rejects(()=>mod.exports.syncPostfastInbox('brand','not-real-key'),/pagination capped/)
assert.equal(pages.length,20)
console.log('PASS: actual sync consumes second conversation/item pages with limit 50, bounded overflow fails explicitly, capability fallback preserves explicit denial/outbound/deleted restrictions')
