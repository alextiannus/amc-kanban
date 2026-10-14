import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {cachedConversationContext,conversationSourceRevision} from '../src/lib/ai-native/conversation-context.ts'
import {nativePool,initializeHost} from '../src/lib/ai-native/store.ts'
import {conversationInput,actorFor} from '../src/lib/ai-native/contract.ts'
import {prisma} from '../src/lib/prisma.ts'
const url=new URL(process.env.DATABASE_URL||'')
assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const pool=nativePool(),key=randomUUID();let revision='one',loads=0
const read=()=>cachedConversationContext(pool,key,async()=>revision,async()=>{loads++;await new Promise(r=>setTimeout(r,20));return {z:'last',a:'first',nested:{b:2,a:1}}},()=>1800000)
try{
 await initializeHost(pool)
 assert.equal(conversationInput({contextSessionId:key}).contextSessionId,key)
 for(const value of ['',42,{},'../other'])assert.throws(()=>conversationInput({contextSessionId:value}),/invalid_context_session/)
 const values=await Promise.all(Array.from({length:5},read))
 assert.equal(loads,1,'concurrent workers coalesce first load')
 assert(values.every(v=>JSON.stringify(v)===JSON.stringify(values[0])),'digest property order survives durable storage')
 assert.deepEqual(await read(),values[0]);assert.equal(loads,1)
 revision='two';await read();assert.equal(loads,2,'source edits invalidate')
 await pool.query("UPDATE amc_conversation_context SET expires_at=now()-interval '1 second' WHERE cache_key=$1",[key]);await read();assert.equal(loads,3,'expired source reloads')
 await assert.rejects(()=>cachedConversationContext(pool,key+'-race',async()=>revision,async()=>{revision='three';return {mixed:true}},()=>1000),/conversation_context_changed/)
 assert.equal((await pool.query('SELECT count(*) FROM amc_conversation_context WHERE cache_key=$1',[key+'-race'])).rows[0].count,'0')
 await assert.rejects(()=>cachedConversationContext(pool,key+'-failure',async()=>revision,async()=>{throw Error('network failed')},()=>1000),/network failed/)
 assert.equal((await pool.query('SELECT count(*) FROM amc_conversation_context WHERE cache_key=$1',[key+'-failure'])).rows[0].count,'0')
 const other=await cachedConversationContext(pool,key+'-other-actor',async()=>revision,async()=>({other:true}),()=>1000);assert.deepEqual(other,{other:true})
 await prisma.brand.create({data:{id:key,name:'Context revision fixture',status:'ARCHIVED'}})
 const actor=actorFor(key,key)
 let stamp=await conversationSourceRevision(actor)
 await prisma.brandKnowledge.create({data:{brandId:key,brandTone:'New tone'}})
 assert.notEqual(await conversationSourceRevision(actor),stamp);stamp=await conversationSourceRevision(actor)
 await prisma.brandPlanInterview.create({data:{brandId:key,rawNotes:'New interview'}})
 assert.notEqual(await conversationSourceRevision(actor),stamp);stamp=await conversationSourceRevision(actor)
 await prisma.brandGrowthResearchSnapshot.create({data:{brandId:key,report:{note:'New snapshot'}}})
 assert.notEqual(await conversationSourceRevision(actor),stamp);stamp=await conversationSourceRevision(actor)
 await prisma.brand.update({where:{id:key},data:{name:'Changed brand',updatedAt:new Date(Date.now()+1000)}})
 assert.notEqual(await conversationSourceRevision(actor),stamp)
 console.log('PASS durable cache: cross-turn, concurrent load, order, revision, expiration, failed/mixed snapshot rejection, key isolation, session validation')
}finally{await prisma.brand.deleteMany({where:{id:key}});await pool.query('DELETE FROM amc_conversation_context WHERE cache_key LIKE $1',[key+'%']);await pool.end();await prisma.$disconnect()}
