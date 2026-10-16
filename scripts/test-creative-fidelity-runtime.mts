import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {composeApplication} from '../src/lib/ai-native/application.ts'
import {nativePool,initializeHost,admitIntent,intentForTask} from '../src/lib/ai-native/store.ts'
import {actorFor,digest} from '../src/lib/ai-native/contract.ts'
import {prisma} from '../src/lib/prisma.ts'
import {creativeDigest} from '../src/lib/brand-plan/creativeRevisionContract.ts'
import {catalogDigest,confirmSkuDecision} from '../src/lib/brand-plan/creativeSkuContract.ts'
import {readCreativeQualityReview,readCreativeRevisions,saveCreativeRevision} from '../src/lib/brand-plan/creativeRevisions.ts'
import {readNativeTask,adoptNativeCandidate} from '../src/lib/ai-native/service.ts'
import {FIDELITY_DIMENSIONS} from '../src/lib/brand-plan/creativeFidelity.ts'

const url=new URL(process.env.DATABASE_URL||'')
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/amc_lineage_test_task6_sdd_20261016')
const pool=nativePool(),ids:string[]=[]
let composition:any
const usage={inputTokens:50,outputTokens:20}
try{
  await initializeHost(pool)
  await prisma.roleDefinition.upsert({where:{id:'AMC_PRINCIPAL'},create:{id:'AMC_PRINCIPAL',name:'Principal',normalizedName:'principal',builtIn:true},update:{enabled:true}})
  for(const scenario of ['passed','failed','malformed']){
    const secondFails=scenario!=='passed',malformed=scenario==='malformed'
    const id='fidelity-'+randomUUID(),actor=actorFor(id,id),month='2099-11',creativeId='idea'
    ids.push(id)
    const base={id:creativeId,title:'Brand introduction',planning:'',materialRequirements:[],adaptationStatus:'sku_confirmed'}
    const decision=confirmSkuDecision({catalogDigest:catalogDigest([]),sourceRevision:null,sourceDigest:null,selectedSkuIds:[],recommendations:[]},[],null,id,creativeDigest(base))
    const current={...base,skuDecision:decision}
    await prisma.user.create({data:{id,email:`${id}@example.invalid`,nickname:'Fidelity fixture',password:'test-only',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
    await prisma.brand.create({data:{id,name:'Fidelity fixture',autoPilot:false,crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}},knowledge:{create:{negPrompts:[],menuItems:[],marketingSolution:{publishingCalendar:{months:{[month]:[current]}}}}}}})
    const intent:any={kind:'creative_adaptation',userId:id,brandId:id,creativeId,month,goal:'Adapt confirmed ordinary brand content and review fidelity',expectedRevision:creativeDigest(current),catalogDigest:catalogDigest([]),sourceRevision:null,sourceDigest:null,decisionDigest:decision.digest,artifactPath:`work/${id}.json`,requestKey:`request-${id}`}
    let taskId='',blockedChecked=false,invalidChecked=false,pause=true
    const model={next:async(request:any)=>{
      const data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user').content),calls=data.calls.filter((c:any)=>c.status==='succeeded')
      const context=calls.find((c:any)=>c.capability==='amc.context')?.result
      if(!context)return {type:'call',name:'amc.context',input:{},usage}
      if(!calls.some((c:any)=>c.capability==='assistant.skills.read'))return {type:'call',name:'assistant.skills.read',input:{id:'amc-creative/SKILL.md'},usage}
      const writes=calls.filter((c:any)=>c.capability==='my_write_workspace'),ref=writes.at(-1)?.result.reference
      if(!ref)return {type:'call',name:'my_write_workspace',input:{path:intent.artifactPath,expectedRevision:0,mediaType:'application/json',content:JSON.stringify(context.artifactContract.example)},usage}
      const quality=await readCreativeQualityReview({id,type:'HUMAN'},id,taskId)
      if(quality?.status==='awaiting_review'){
        if(!blockedChecked){
          blockedChecked=true
          await assert.rejects(()=>composition.app.dispatcher.invoke('my_write_workspace',{path:intent.artifactPath,expectedRevision:ref.revision,content:'forged'},{actor,taskId,callId:'forbidden-review-write'}))
        }
        if(!invalidChecked){
          invalidChecked=true
          await assert.rejects(()=>composition.app.dispatcher.invoke('amc.creative_fidelity',{candidateDigest:ref.digest,sourceCreativeId:'forged',dimensions:[]},{actor,taskId,callId:'malformed-classification'}))
          assert.equal((await readCreativeQualityReview({id,type:'HUMAN'},id,taskId))?.status,'awaiting_review')
        }
        return {type:'call',name:'amc.creative_fidelity',input:{candidateDigest:ref.digest,dimensions:FIDELITY_DIMENSIONS.map(key=>({key,status:key==='hook'&&(quality.repairCount===0||secondFails)?'failed':'passed',issues:key==='hook'&&(quality.repairCount===0||secondFails)?['Opening lacks the intended reveal']:[]}))},usage}
      }
      if(quality?.status==='repair_required'){
        if(pause)return {type:'wait',question:'Fixture pause for durable restart',usage}
        if(writes.length>1)return {type:'finish',result:{summary:'Repaired candidate ready for review',artifacts:[ref]},usage}
        const next={...context.artifactContract.example,title:'Repaired brand introduction'}
        return {type:'call',name:'my_write_workspace',input:{path:intent.artifactPath,expectedRevision:ref.revision,mediaType:'application/json',content:JSON.stringify(malformed?{...next,shots:[]}:next)},usage}
      }
      return {type:'finish',result:{summary:'Candidate assessed; no business save',artifacts:[ref]},usage}
    }}
    const models={profiles:[{id:'fixture',provider:'openai' as const,model:'fixture',credentialRef:'fixture'}],resolveSecret:()=> 'not-real',modelFactory:()=>model,tokenPolicies:{fixture:{maximum:2000,price:{revision:'test',input:1,cachedInput:1,output:1}}}}
    const options={version:'fidelity-runtime-test',authorize:async(a:any)=>a.scopeId===actor.scopeId&&a.subjectId===id}
    composition=await composeApplication(pool,models,options)
    await admitIntent(pool,actor,intent)
    const receipt=await composition.app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:composition.tools},{actor,callId:intent.requestKey})
    taskId=receipt.id
    await intentForTask(pool,composition.app,actor,taskId)
    await composition.app.runtime.tick()
    let task=await composition.app.runtime.get(actor,taskId,{history:true})
    assert.equal(task.status,'waiting',JSON.stringify(task.events.slice(-4)))
    const beforeRestart=await readCreativeQualityReview({id,type:'HUMAN'},id,taskId)
    assert.equal(beforeRestart?.status,'repair_required');assert.equal(beforeRestart?.attempts.length,1)
    assert.equal((await readCreativeRevisions({id,type:'HUMAN'},id,month,creativeId)).revisions.length,0,'review does not save business content')
    await composition.app.close()
    pause=false
    await pool.query('UPDATE amc_ai_requests SET task_id=NULL WHERE scope_id=$1 AND subject_id=$2 AND request_key=$3',[actor.scopeId,id,intent.requestKey])
    composition=await composeApplication(pool,models,options)
    await composition.app.dispatcher.invoke('tasks.provide_input',{id:taskId,input:'Continue the single repair'},{actor,callId:'continue-fidelity-repair'})
    await composition.app.runtime.tick()
    task=await composition.app.runtime.get(actor,taskId,{history:true})
    assert.equal(task.status,'succeeded',JSON.stringify(task.events.slice(-4)))
    assert.equal((await intentForTask(pool,composition.app,actor,taskId)).task_id,taskId,'recover the application index after verification through the Core binding')
    const quality=await readCreativeQualityReview({id,type:'HUMAN'},id,taskId)
    assert.equal(quality?.status,secondFails?'needs_revision':'passed');assert.equal(quality?.repairCount,1);assert.equal(quality?.attempts.length,2)
    assert.equal(quality?.attempts[0].adapted.title,'Fidelity fixture品牌故事')
    if(malformed){assert.match(quality!.attempts[1].adapted.validationError,/repair_artifact_invalid/);assert.deepEqual(JSON.parse(quality!.attempts[1].adapted.rawArtifact).shots,[])}
    else assert.equal(quality?.attempts[1].adapted.title,'Repaired brand introduction')
    assert.equal(task.calls.filter((c:any)=>c.capability==='amc.creative_fidelity'&&c.status==='succeeded').length,malformed?1:2)
    assert.equal((await readCreativeRevisions({id,type:'HUMAN'},id,month,creativeId)).current.title,current.title)
    ;(globalThis as any).amcNativeHost=Promise.resolve({pool,app:composition.app,tools:composition.tools,modelRevision:1})
    const view:any=await readNativeTask(id,id,taskId)
    assert.equal(view.status,secondFails?'needs_revision':'succeeded');assert.equal(view.qualityReview.attempts.length,2)
    const artifact=task.result.artifacts[0],candidate=quality!.attempts[1].adapted
    const body={requestKey:'adopt-fidelity-candidate',artifactDigest:artifact.digest}
    // The server save boundary also fails closed if an internal caller omits review evidence.
    if(!malformed)await assert.rejects(()=>saveCreativeRevision({id,type:'HUMAN'},id,month,creativeId,{expectedRevision:intent.expectedRevision,idempotencyKey:'without-quality-review',patch:candidate.patch},undefined,{taskId,agentId:'amc-mm-user-ai',requestedBy:id,contextDigest:candidate.contextDigest,artifact,skuBinding:intent,skuSource:null}),/creative_fidelity_not_passed/)
    if(secondFails){
      await assert.rejects(()=>adoptNativeCandidate(id,id,taskId,body),/creative_fidelity_not_passed/)
      assert.equal((await readCreativeRevisions({id,type:'HUMAN'},id,month,creativeId)).revisions.length,0)
      await assert.rejects(()=>composition.app.dispatcher.invoke('my_write_workspace',{path:intent.artifactPath,expectedRevision:artifact.revision,content:'third repair'},{actor,taskId,callId:'third-repair'}))
    }else{
      const saved=await adoptNativeCandidate(id,id,taskId,body)
      assert.equal(saved.receipt.ai.qualityReview.attempts.length,2)
      assert.equal(saved.receipt.content.adaptationStatus,'adapted')
      assert.equal((await adoptNativeCandidate(id,id,taskId,body)).receipt.id,saved.receipt.id)
    }
    assert.equal(Number((await composition.app.ledger.taskUsage(await composition.app.scope(actor),taskId)).pending),0)
    assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
    await assert.rejects(()=>readCreativeQualityReview({id:'outsider',type:'HUMAN'},id,taskId))
    await composition.app.close();composition=null
    ;(globalThis as any).amcNativeHost=undefined
  }
  console.log('PASS real Core task: restricted classification, malformed rejection, restart, one repair, both attempts persisted, passed adoption and needs_revision blocked')
}finally{
  await composition?.app.close()
  ;(globalThis as any).amcNativeHost=undefined
  await prisma.brand.deleteMany({where:{id:{in:ids}}});await prisma.user.deleteMany({where:{id:{in:ids}}})
  await pool.end();await prisma.$disconnect()
}
