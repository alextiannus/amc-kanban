import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {CapabilityDispatcher} from '@immedi/iaic-core/capabilities/index.js'
import {prisma} from '../src/lib/prisma.ts'
import {actorFor} from '../src/lib/ai-native/contract.ts'
import {brandUnderstandingCapabilities} from '../src/lib/ai-native/brand-understanding-capabilities.ts'
import {readBrandUnderstanding,saveBrandUnderstanding} from '../src/lib/ai-native/brand-understanding-store.ts'
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const brand='understanding-'+randomUUID(),other=brand+'-other',user='fixture-user',actor=actorFor(brand,user)
let proposalTask='',proposalContent='',oversized=false
let revoked=false,intent:any={kind:'conversation',brandId:brand,goal:'我们的顾客是家庭，不面向儿童。',artifactPath:'work/test.json',requestKey:'request'}
const caps=brandUnderstandingCapabilities(async()=>intent,async a=>!revoked&&a.scopeId===actor.scopeId&&a.subjectId===actor.subjectId,async()=>({name:'Fixture',description:'真实品牌'}),{readPrevious:async()=>({status:'succeeded',report:{content:proposalContent}}),match:async(i,f,options)=>{assert.equal(options?.boundedCompleteSources,true);assert(i.goal.includes('direction'));assert(i.goal.includes('家庭'));return {sources:oversized?[]:[{inspirationCreativeId:'cre_fixture',sourceRevision:'fixture-v1',matchScore:90,sourceDigest:'a'.repeat(64)}],libraryDigest:'b'.repeat(64),contextDigest:'c'.repeat(64),retrievedAt:new Date().toISOString(),contentMatchRequestId:'fixture',gaps:oversized?[{code:'source_evidence_too_large',sourceCreativeId:'cre_huge'}]:[],libraryVersions:{}}}})
const dispatcher=new CapabilityDispatcher({capabilities:caps,validateActor:()=>true})
const invoke=(name:string,input:any={},id=randomUUID())=>dispatcher.invoke(name,input,{actor,taskId:id,callId:randomUUID()})
const read=async()=>await invoke('amc.brand_understanding.read') as any
try{
 await prisma.brand.createMany({data:[{id:brand,name:'Understanding fixture'},{id:other,name:'Other brand'}]})
 await prisma.brandKnowledge.create({data:{brandId:brand,marketingSolution:{marketingPlan:{content:'preserve strategy'},publishingCalendar:{months:{'2026-12':[{id:'selected',planning:'preserve edits'}]}}}}})
 let current=await read(),task=randomUUID(),patch={entries:[{key:'audience',scope:'brand',kind:'fact',quote:intent.goal}]},input={expectedRevision:current.revision,patch}
 const auditBefore=await prisma.auditLog.count({where:{action:'BRAND_UNDERSTANDING_SAVED',actorId:user}})
 await assert.rejects(()=>invoke('amc.brand_understanding.save',{...input,patch:{entries:[{...patch.entries[0],quote:'面向儿童。'}]}}),(e:any)=>e.preflightRejected===true&&e.preflightFeedback.includes('whole_user_statement_required'))
 assert.equal((await read()).revision,current.revision)
 assert.equal(await prisma.auditLog.count({where:{action:'BRAND_UNDERSTANDING_SAVED',actorId:user}}),auditBefore)
 const saved:any=await invoke('amc.brand_understanding.save',input,task);assert.equal(saved.verified,true);assert.equal(saved.current,true)
 const replay:any=await invoke('amc.brand_understanding.save',input,task);assert.equal(replay.revision,saved.revision)
 current=await read();assert.equal(current.current.length,1)
 assert.equal((await readBrandUnderstanding(other)).current.length,0)
 const preserved:any=(await prisma.brandKnowledge.findUnique({where:{brandId:brand}}))?.marketingSolution
 assert.equal(preserved.marketingPlan.content,'preserve strategy');assert.equal(preserved.publishingCalendar.months['2026-12'][0].planning,'preserve edits')
 // Changing current understanding cannot overwrite the old operation receipt.
 intent.goal='我们的顾客是上班族。'
 await invoke('amc.brand_understanding.save',{expectedRevision:current.revision,patch:{entries:[{...patch.entries[0],quote:intent.goal}]}},randomUUID())
 current=await read();assert.equal(current.current.length,0);assert.equal(current.unresolved.length,1)
 const old:any=await invoke('amc.brand_understanding.save',input,task);assert.equal(old.verified,true);assert.equal(old.current,false)
 await assert.rejects(()=>invoke('amc.brand_understanding.save',input),/changed_read_again/)
 intent.goal='更正：我们的顾客是家庭，不面向儿童。'
 await invoke('amc.brand_understanding.save',{expectedRevision:current.revision,patch:{entries:[{...patch.entries[0],quote:intent.goal,resolve:true}]}})
 current=await read();assert.equal(current.unresolved.length,0)
 const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit'}).format(new Date()).replace('/','-')
 intent.goal='请给出近期营销规划'
 proposalTask=randomUUID();proposalContent='家庭聚餐主题；拍摄原料到成品，具体日期待确认。'
 await invoke('amc.brand_understanding.save',{expectedRevision:current.revision,patch:{plans:[{month,content:proposalContent,status:'proposed',quote:intent.goal}]}},proposalTask)
 current=await read()
 await assert.rejects(()=>invoke('amc.brand_understanding.match',{month,expectedRevision:current.revision}),/month_direction_required/)
 const preview:any=await invoke('amc.brand_understanding.match',{month,expectedRevision:current.revision,exploratory:true});assert.equal(preview.sources[0].inspirationCreativeId,'cre_fixture')
 intent.goal='就按这个方向做';intent.afterTaskId=proposalTask
 await invoke('amc.brand_understanding.save',{expectedRevision:current.revision,patch:{plans:[{month,content:current.plans[0].content,status:'decided',quote:intent.goal,acceptPrevious:true}]}})
 current=await read();const matched:any=await invoke('amc.brand_understanding.match',{month,expectedRevision:current.revision});assert.equal(matched.briefRevision,current.revision)
 oversized=true
 const unavailable:any=await invoke('amc.brand_understanding.match',{month,expectedRevision:current.revision})
 assert.equal(unavailable.status,'source_evidence_unavailable');assert.equal(unavailable.sources.length,0)
 oversized=false
 const simultaneous=await Promise.allSettled(['本店位于新加坡。','本店营业到晚上。'].map((goal,i)=>saveBrandUnderstanding({brandId:brand,userId:user,taskId:randomUUID(),goal,expectedRevision:current.revision,patch:{entries:[{key:'concurrent'+i,scope:'brand',kind:'fact',quote:goal}]}})))
 assert.equal(simultaneous.filter(x=>x.status==='fulfilled').length,1)
 current=await read();assert.equal(current.plans[0].status,'needs_recheck')
 await assert.rejects(()=>invoke('amc.brand_understanding.match',{month,expectedRevision:matched.briefRevision}),/changed_read_again/)
 // A current exact direction can reconfirm after facts change, even if the model adds acceptPrevious.
 intent.goal=month+'确定以家庭聚餐为本月方向。';delete intent.afterTaskId
 const direct:any=await invoke('amc.brand_understanding.save',{expectedRevision:current.revision,patch:{plans:[{month,content:intent.goal,quote:intent.goal,status:'decided',acceptPrevious:true}]}})
 assert.equal(direct.verified,true);current=await read();assert.equal(current.plans[0].status,'decided')
 intent.goal='就按之前的方案做'
 await assert.rejects(()=>invoke('amc.brand_understanding.save',{expectedRevision:current.revision,patch:{plans:[{month,content:'not the current user statement',quote:intent.goal,status:'decided',acceptPrevious:true}]}}),(e:any)=>e.preflightRejected===true&&e.preflightFeedback.includes('previous_visible_direction_required'))
 revoked=true;await assert.rejects(()=>read(),/denied/);revoked=false
 intent={...intent,brandId:other};await assert.rejects(()=>read(),/conversation_task_required/)
 console.log('real PostgreSQL + capabilities: replay, conflicts, original receipt, isolation, scope, concurrency, proposed/decided plans, matching binding, revocation and unrelated work preservation passed')
}finally{
 await prisma.auditLog.deleteMany({where:{resourceType:'BrandKnowledge',metadata:{path:['brandId'],equals:brand}}})
 await prisma.brandKnowledge.deleteMany({where:{brandId:{in:[brand,other]}}});await prisma.brand.deleteMany({where:{id:{in:[brand,other]}}});await prisma.$disconnect()
}
