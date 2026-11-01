import {ContextAssembler} from '@immedi/iaic-core'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {CapabilityDispatcher} from '@immedi/iaic-core/capabilities/index.js'
import {prisma} from '../src/lib/prisma.ts'
import {actorFor,conversationFrom} from '../src/lib/ai-native/contract.ts'
import {interviewCapabilities,interviewReceipt} from '../src/lib/ai-native/interview-capabilities.ts'
import {readConversationInterview,saveConversationInterview} from '../src/lib/ai-native/interview-store.ts'
import {confirmsInterview} from '../src/lib/ai-native/interview-contract.ts'
import {allowedTaskTools} from '../src/lib/ai-native/task-tools.ts'
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const brand='interview-'+randomUUID(),actor=actorFor(brand,'fixture-user'),other=brand+'-other',task=randomUUID(),proposal=randomUUID()
let intent:any={kind:'conversation',topic:'brand_planning',brandId:brand,goal:'我们的客户是商家老板；不面向儿童。',artifactPath:'work/test.json'},revoked=false,previous:any
const calls:any[]=[{capability:'assistant.skills.read',status:'succeeded',input:{id:'amc-marketing-expert/SKILL.md'}}]
const caps=interviewCapabilities(async()=>intent,()=>({tasks:{history:async()=>({calls})}}),async a=>!revoked&&a.scopeId===actor.scopeId&&a.subjectId===actor.subjectId,{readPrevious:async(user,b,id)=>{assert.equal(user,actor.subjectId);assert.equal(b,brand);assert.equal(id,proposal);return previous}})
const dispatcher=new CapabilityDispatcher({capabilities:caps,validateActor:()=>true})
const invoke=(name:string,input:any={},id=task)=>dispatcher.invoke(name,input,{actor,taskId:id,callId:randomUUID()})
const read=async()=>{const result=await invoke('amc.interview.read');calls.push({capability:'amc.interview.read',status:'succeeded',result});return result as any}
try{
 await prisma.brand.createMany({data:[{id:brand,name:'Interview fixture'},{id:other,name:'Other fixture'}]})
 const strategy={marketingPlan:{content:'Retain this strategy',taskId:'existing'}}
 await prisma.brandKnowledge.create({data:{brandId:brand,marketingSolution:strategy}})
 let snapshot=await read();assert.equal(snapshot.interview,null)
 const input={mode:'user_answers',expectedRevision:snapshot.revision,answers:[{question:'客户范围',answer:intent.goal}]}
 await assert.rejects(()=>invoke('amc.interview.save',{...input,answers:[{question:'客户范围',answer:'面向儿童'}]}),/copy_entire_current_user_message/,'substring cannot drop a negation')
 revoked=true;await assert.rejects(()=>invoke('amc.interview.save',input),/denied/);revoked=false
 const saved:any=await invoke('amc.interview.save',input);assert.equal(saved.verified,true)
 const context=new ContextAssembler({skillRoot:'.'})
 const history={calls:[{id:'saved-call',task_id:task,capability:'amc.interview.save',status:'succeeded',input,result:saved}],events:[]}
 const assemble=()=>context.assemble({actor,dispatcher,history,task:{input:{goal:intent.goal}},capability:{implementation:{instructions:'Continue the current task',skills:[]}}} as any)
 const broken={capabilities:new Map(caps.map(c=>[c.name,{...c,revalidate:undefined}]))}
 await assert.rejects(()=>context.revalidateHistory({actor,dispatcher:broken,history} as any),/Historical result has no permission revalidator/)
 const nextMessages=await assemble();assert(JSON.parse(nextMessages.at(-1)!.content).calls[0].result.verified)
 assert.equal(await prisma.brandPlanInterview.count({where:{brandId:brand}}),1,'context assembly must not save again')
 revoked=true;await assert.rejects(assemble,/no longer authorized/);revoked=false
 console.log('PASS actual Core context continues after interview save, preserves original receipt, rejects revoked access, never replays write; missing revalidator reproduces production failure')
 const replay:any=await invoke('amc.interview.save',input);assert.equal(replay.interviewId,saved.interviewId)
 assert.equal(await prisma.brandPlanInterview.count({where:{brandId:brand}}),1)
 assert.equal((await read()).interview.rawNotes,'客户范围\n'+intent.goal)
 assert.equal((await readConversationInterview(other)).interview,null)
 assert.deepEqual((await prisma.brandKnowledge.findUnique({where:{brandId:brand}}))!.marketingSolution,strategy)
 assert.equal(((await prisma.brandKnowledge.findUnique({where:{brandId:brand}}))!.brandClaim as any).interviewId,saved.interviewId)
 // Same expected revision, concurrent tasks: one wins, the other must not overwrite.
 snapshot=await read()
 const race=await Promise.allSettled(['A','B'].map(answer=>saveConversationInterview({brandId:brand,userId:actor.subjectId,taskId:randomUUID(),expectedRevision:snapshot.revision,answers:[{question:'并发',answer}]})))
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected').length,1)
 const conflict:any=await invoke('amc.interview.save',{...input,expectedRevision:snapshot.revision},randomUUID());assert.equal(conflict.state,'conflict');assert.equal(conflict.verified,false)
 // Confirm only the actual previous artifact, not client-supplied answers/history.
 previous={status:'succeeded',report:{interviewDraft:{answers:[{question:'渠道',answer:'只做自然内容'}]}}}
 intent={...intent,goal:'确认以上访谈',afterTaskId:proposal};snapshot=await read()
 const confirmed:any=await invoke('amc.interview.save',{mode:'confirm_previous',expectedRevision:snapshot.revision},randomUUID());assert.equal(confirmed.source,'user_confirmed_draft')
 assert((await read()).interview.rawNotes.includes('只做自然内容'))
 intent.goal='确认，但是渠道改为投流';await assert.rejects(()=>invoke('amc.interview.save',{mode:'confirm_previous',expectedRevision:snapshot.revision}),/explicit_interview_confirmation_required/)
 intent.goal='对';previous={status:'succeeded',report:{content:'No typed draft'}};await assert.rejects(()=>invoke('amc.interview.save',{mode:'confirm_previous',expectedRevision:snapshot.revision}),/previous_interview_draft_required/)
 intent.goal='不要保存，我只想讨论';await assert.rejects(()=>invoke('amc.interview.save',{mode:'user_answers',expectedRevision:snapshot.revision,answers:[{question:'内容',answer:intent.goal}]}),/interview_save_not_requested/)
 intent={...intent,brandId:other};await assert.rejects(()=>invoke('amc.interview.read'),/conversation_task_required/)
 for(const goal of ['对','确认以上访谈','confirm and save'])assert(confirmsInterview(goal))
 for(const goal of ['不对','确认第一项','对，但预算不同','Do not save'])assert(!confirmsInterview(goal))
 const reply={kind:'conversation',brandId:brand,content:'Visible answer',contextDigest:'a'.repeat(64),interviewDraft:{answers:[{question:'Q',answer:'Hidden answer'}]}}
 assert.throws(()=>conversationFrom(JSON.stringify(reply),{...intent,brandId:brand}),/interview_draft_must_be_visible/)
 assert.deepEqual(allowedTaskTools(['amc.interview.read','amc.interview.save'],{kind:'video_rewrite'} as any,[]),[])
 console.log('PASS real PostgreSQL chat interview: no-report save/readback, exact full user evidence, preservation, replay, concurrent conflict, authorized prior draft confirmation, negatives, cross-brand/permission denial and visible proposal')
}finally{await prisma.auditLog.deleteMany({where:{actorId:actor.subjectId,metadata:{path:['brandId'],equals:brand}}});await prisma.brand.deleteMany({where:{id:{in:[brand,other]}}});await prisma.$disconnect()}

assert.equal(interviewReceipt([{capability:'amc.interview.save',status:'succeeded',result:{state:'saved',verified:true,interviewId:'retained'}},{capability:'amc.interview.save',status:'succeeded',result:{state:'conflict',verified:false}}]).interviewId,'retained','later conflict cannot hide a committed save')
