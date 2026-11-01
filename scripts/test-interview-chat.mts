import {ContextAssembler} from '@immedi/iaic-core'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {CapabilityDispatcher} from '@immedi/iaic-core/capabilities/index.js'
import {prisma} from '../src/lib/prisma.ts'
import {actorFor,conversationFrom} from '../src/lib/ai-native/contract.ts'
import {interviewCapabilities,interviewReceipt} from '../src/lib/ai-native/interview-capabilities.ts'
import {readConversationInterview,saveConversationInterview} from '../src/lib/ai-native/interview-store.ts'
import {confirmsInterview,visibleInterviewDraft} from '../src/lib/ai-native/interview-contract.ts'
import {allowedTaskTools} from '../src/lib/ai-native/task-tools.ts'
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const brand='interview-'+randomUUID(),actor=actorFor(brand,'fixture-user'),other=brand+'-other',task=randomUUID()
let proposal=randomUUID()
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
 intent={...intent,goal:'确认这份整理内容，保存为访谈记录',afterTaskId:proposal};snapshot=await read()
 const confirmed:any=await invoke('amc.interview.save',{mode:'confirm_previous',expectedRevision:snapshot.revision},randomUUID());assert.equal(confirmed.source,'user_confirmed_draft')
 assert((await read()).interview.rawNotes.includes('只做自然内容'))
 // The exact screenshot confirmation saves the persisted visible proposal, even when the model omitted typed metadata.
 const standard=['品牌','定位','经营目标','目标顾客','选择理由与阻碍','竞争与差异','产品与服务','表达要求','待补充'].map(label=>label+'：'+(label==='品牌'?'测试品牌':'待补充')).join('\n\n')
 proposal=randomUUID();intent.afterTaskId=proposal
 previous={status:'succeeded',report:{content:'精简版 v0.2\n'+standard}}
 intent.goal='确认，按这份 v0.2 保存';snapshot=await read()
 const recovered:any=await invoke('amc.interview.save',{mode:'confirm_previous',expectedRevision:snapshot.revision},randomUUID())
 assert.equal(recovered.verified,true)
 assert((await read()).interview.rawNotes.includes('测试品牌'))
 intent.goal='好，就照刚才整理的内容存起来吧';snapshot=await read()
 const natural:any=await invoke('amc.interview.save',{mode:'confirm_previous',expectedRevision:snapshot.revision,answers:[{question:'injected',answer:'must never be saved'}]},randomUUID());assert.equal(natural.verified,true,'semantic tool routing does not require a whitelist phrase')
 assert(!(await read()).interview.rawNotes.includes('must never be saved'),'confirm mode ignores supplied answers and saves only actual persisted draft')
 intent.goal='确认，但是渠道改为投流';await assert.rejects(()=>invoke('amc.interview.save',{mode:'confirm_previous',expectedRevision:snapshot.revision}),/interview_confirmation_requires_revision/)
 intent.goal='对';previous={status:'succeeded',report:{content:'No typed draft'}};await assert.rejects(()=>invoke('amc.interview.save',{mode:'confirm_previous',expectedRevision:snapshot.revision}),/previous_interview_draft_required/)
 intent.goal='不要保存，我只想讨论';await assert.rejects(()=>invoke('amc.interview.save',{mode:'user_answers',expectedRevision:snapshot.revision,answers:[{question:'内容',answer:intent.goal}]}),/interview_save_not_requested/)
 intent={...intent,brandId:other};await assert.rejects(()=>invoke('amc.interview.read'),/conversation_task_required/)
 for(const goal of ['对','确认以上访谈','confirm and save','确认保存','确认，按这份 v0.2 保存','按上面的 v0.2 草案确认保存','确认保存上一条草案'])assert(confirmsInterview(goal))
 for(const goal of ['不对','确认第一项','对，但预算不同','Do not save','确认，按这份 v0.2 保存？','确认，按这份 v0.2 保存，但预算改成十万','确认第一项并保存','不确认保存'])assert(!confirmsInterview(goal))
 const reply={kind:'conversation',brandId:brand,content:'Visible answer',contextDigest:'a'.repeat(64),interviewDraft:{answers:[{question:'Q',answer:'Hidden answer'}]}}
 assert.throws(()=>conversationFrom(JSON.stringify(reply),{...intent,brandId:brand}),/interview_draft_must_be_visible/)
 assert.deepEqual(allowedTaskTools(['amc.interview.read','amc.interview.save'],{kind:'video_rewrite'} as any,[]),[])
 console.log('PASS real PostgreSQL chat interview: no-report save/readback, exact full user evidence, preservation, replay, concurrent conflict, authorized prior draft confirmation, negatives, cross-brand/permission denial and visible proposal')
}finally{await prisma.auditLog.deleteMany({where:{actorId:actor.subjectId,metadata:{path:['brandId'],equals:brand}}});await prisma.brand.deleteMany({where:{id:{in:[brand,other]}}});await prisma.$disconnect()}

assert.equal(interviewReceipt([{capability:'amc.interview.save',status:'succeeded',result:{state:'saved',verified:true,interviewId:'retained'}},{capability:'amc.interview.save',status:'succeeded',result:{state:'conflict',verified:false}}]).interviewId,'retained','later conflict cannot hide a committed save')

const labels=['品牌','定位','经营目标','目标顾客','选择理由与阻碍','竞争与差异','产品与服务','表达要求','待补充']
const body=labels.map((label,i)=>`**${label}：** ${i===1?'能力规划，不代表已上线':i===6?'历史价格，待核实':'待补充'}`).join('\n\n')
const content=body+'\n\n待确认：请确认以上整理内容，确认后再保存为访谈记录。'
const extracted=visibleInterviewDraft(content)!
assert.equal(extracted.answers.length,9)
assert.equal(extracted.answers[1].answer,'能力规划，不代表已上线')
assert.equal(extracted.answers[6].answer,'历史价格，待核实')
assert.equal(extracted.answers[8].answer,'待补充')
assert.equal(visibleInterviewDraft('这里没有待保存正文'),undefined)
assert.equal(visibleInterviewDraft(body.replace('目标顾客','未知标签')),undefined)
assert.equal(visibleInterviewDraft(body+'\n品牌：另一份'),undefined)
const restored=conversationFrom(JSON.stringify({kind:'conversation',brandId:brand,content,contextDigest:'a'.repeat(64)}),{kind:'conversation',brandId:brand} as any)
assert.deepEqual(restored.interviewDraft,extracted,'persisted visible body automatically binds exact draft')
console.log('PASS natural confirmation, exact visible nine-field recovery and retained qualifiers')
