import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {TaskStore} from '@immedi/iaic-core'
import {initializeLifecycle,lifecycleDecision,settleTask,dailyGate,MAX_TASK_AGE_MS} from '../src/lib/ai-native/task-lifecycle.mjs'
import {verifyAutopilotReport} from '../src/lib/ai-native/autopilot-report.mjs'
import {nativeWireTools} from '../src/lib/ai-native/tool-wire.ts'
import {initializeHost,admitIntent} from '../src/lib/ai-native/store.ts'
import {actorFor} from '../src/lib/ai-native/contract.ts'
const db=new PGlite()
const query=async(sql:string,args?:any[])=>{
 if(!args&&sql.includes(';')){const r=(await db.exec(sql)).at(-1)!;return {...r,rowCount:r.rows.length||r.affectedRows||0}}
 const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0}
}
const pool:any={query,connect:async()=>({query,release(){}})}
try{
 await db.exec('CREATE SCHEMA amc_iaic; SET search_path=amc_iaic')
 await initializeHost(pool);await initializeLifecycle(pool)
 const store=new TaskStore({pool});await store.initialize()
 async function task(reason:string,age=0,status='waiting'){
  const id=randomUUID();await query(`INSERT INTO iaic_tasks(id,employee_id,erp_user,capability,input,request_key,version,model,status,waiting_reason,created_at) VALUES($1::uuid,'brand','user','agent.work','{}',$1::text,'v','fixture',$2,$3,$4)`,[id,status,reason,new Date(Date.now()-age)]);return store.get({scopeId:'brand',subjectId:'user'},id)
 }
 const settle=(t:any)=>settleTask({pool,store,task:t,version:'v',schema:'amc_iaic'})
 const input=await task('input');assert.equal((await settle(input)).status,'cancelled');await settle(input)
 assert.equal((await query("SELECT * FROM iaic_task_events WHERE task_id=$1 AND kind='cancelled'",[input.id])).rows.length,1)
 const external=await task('external_result');assert.equal((await settle(external)).status,'waiting')
 const expired=await task('external_result',MAX_TASK_AGE_MS+1);assert.equal((await settle(expired)).status,'cancelled')
 const failedExternal=await task('external_result');await query("INSERT INTO iaic_calls(id,task_id,capability,input,effect,status,error) VALUES($1,$2,'research_start','{}','write','unknown','internal_error')",[randomUUID(),failedExternal.id]);assert.equal((await settle(failedExternal)).status,'cancelled');assert.equal((await query('SELECT status FROM iaic_calls WHERE task_id=$1',[failedExternal.id])).rows[0].status,'unknown')
 const first=await task('interrupted');assert.equal((await settle(first)).status,'queued')
 await query("UPDATE iaic_tasks SET status='waiting',waiting_reason='interrupted' WHERE id=$1",[first.id]);assert.equal((await settle(first)).status,'cancelled')
 const uncertain=await task('interrupted');await query("INSERT INTO iaic_task_events(task_id,kind,data) VALUES($1,'model_requested','{}')",[uncertain.id]);assert.equal((await settle(uncertain)).status,'cancelled')
 for(const reason of ['model_timeout','token_balance','usage_reconciliation','invalid_model_action','limit'])assert.equal(lifecycleDecision({...input,status:'waiting',waiting_reason:reason}),`stopped_${reason}`)
 assert.equal(lifecycleDecision({...input,status:'succeeded',created_at:0}),null)
 let sweeps=0;const tick=dailyGate(async()=>{sweeps++});await Promise.all(Array.from({length:50},()=>tick()));await tick();assert.equal(sweeps,1)
 const intent:any={brandId:'b',runId:'r'},state:any={limit:5,evidence:{strategyVersionId:'s'},outputs:[]}
 const report:any={kind:'autopilot_report',brandId:'b',runId:'r',state:'awaiting_user_action',nextAction:'browse_ideas',summary:'策略已保存，请选择创意',strategyVersionId:'s',draftIds:[],publishRequiresConfirmation:true}
 assert.equal(verifyAutopilotReport(report,state,intent).verified,true)
 assert.equal(verifyAutopilotReport({...report,strategyVersionId:'invented'},state,intent).verified,false)
 assert.equal(verifyAutopilotReport({...report,draftIds:['invented']},state,intent).verified,false)
 assert.equal(verifyAutopilotReport({...report,state:'completed'},state,intent).verified,false)
 assert.equal(nativeWireTools([{name:'iaic_wait'},{name:'iaic_finish'}]).length,1)
 const actor=actorFor('b','u'),i:any={kind:'conversation',brandId:'b',goal:'same goal',requestKey:'first',artifactPath:'first.json'}
 const a=await admitIntent(pool,actor,i,'default',async()=> 'running')
 const reused=await admitIntent(pool,actor,{...i,requestKey:'second',artifactPath:'second.json'},'default',async()=> 'running');assert.equal(reused.id,a.id)
 await query('UPDATE amc_ai_requests SET task_id=$1 WHERE id=$2',[randomUUID(),a.id])
 const finished=await admitIntent(pool,actor,{...i,requestKey:'third',artifactPath:'third.json'},'default',async()=> 'succeeded');assert.notEqual(finished.id,a.id)
 const different=await admitIntent(pool,actor,{...i,requestKey:'fourth',goal:'new information'},'default',async()=> 'running');assert.notEqual(different.id,finished.id)
 console.log('PASS lifecycle: real Core cancellation/idempotency, external waits, one recovery, no uncertain replay, daily zero-query gating, truthful handoff, wait-tool exclusion, in-flight dedup and new-input isolation')
}finally{await db.close()}
