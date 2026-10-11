import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {composeApplication} from '../src/lib/ai-native/application.ts'
import {nativePool,initializeHost,admitIntent} from '../src/lib/ai-native/store.ts'
import {actorFor,type CreativeIntent} from '../src/lib/ai-native/contract.ts'
import {prisma} from '../src/lib/prisma.ts'
const url=new URL(process.env.DATABASE_URL||'');assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const id='budget-'+randomUUID(),actor=actorFor(id,id),pool=nativePool();let app:any,calls=0
try{
 await prisma.user.create({data:{id,email:id+'@example.invalid',password:randomUUID()}})
 await prisma.brand.create({data:{id,name:'Isolated budget fixture',status:'ARCHIVED',autoPilot:false}})
 await initializeHost(pool)
 const composition=await composeApplication(pool,{profiles:[{id:'fixture',provider:'openai',model:'fixture',credentialRef:'fixture'}],resolveSecret:()=> 'not-real',modelFactory:()=>({next:async()=>{calls++;return {type:'call',name:'amc.context',input:{},usage:{inputTokens:120000,outputTokens:1}}}}),tokenPolicies:{fixture:{maximum:150000,price:{revision:'fixture',input:1,cachedInput:1,output:1}}}},{version:'isolated-budget-v1',authorize:async(a:any)=>a.subjectId===id&&a.scopeId===actor.scopeId})
 app=composition.app
 const intent:CreativeIntent={kind:'creative',userId:id,brandId:id,creativeId:'fixture',month:'2099-11',expectedRevision:'fixture',goal:'Isolated quota regression',artifactPath:`work/${id}.json`,requestKey:id}
 await admitIntent(pool,actor,intent);await app.ledger.grant(await app.scope(actor),{reference:id,amount:600000,evidence:{fixture:true}})
 const t=await app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:['amc.context']},{actor,callId:id})
 await app.runtime.tick()
 const state=await app.runtime.state(actor,t.id),usage=await app.ledger.taskUsage(await app.scope(actor),t.id)
 console.log(JSON.stringify({calls,state:state.status,waitingReason:state.waiting_reason,usage}))
 assert.equal(calls,4,'No fifth invocation when its reservation exceeds task allowance')
 assert.equal(state.waiting_reason,'limit','Quota is a bounded limit, not an interruption')
 await assert.rejects(()=>app.dispatcher.invoke('tasks.resume',{id:t.id},{actor,callId:'budget-resume'}),(e:any)=>e.code==='task_allowance_exhausted'&&e.statusCode===429)
 assert.equal((await app.runtime.state(actor,t.id)).waiting_reason,'limit');assert.equal(calls,4)
 console.log('PASS: bounded allowance pauses with limit; original task resume reports quota 429 without more inference')
}finally{if(app)await app.close();await pool.end();await prisma.brand.deleteMany({where:{id}});await prisma.user.deleteMany({where:{id}});await prisma.$disconnect()}
