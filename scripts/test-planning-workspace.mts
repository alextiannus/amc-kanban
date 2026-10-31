import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {marketingPlanV2Shape,planningScope,planningMonths,planningQuarterLabel,planningRevision,validatePlanningDraft,mergePlanningDraft} from '../src/lib/ai-native/planning-workspace-contract.ts'
import {savePlanningDraft} from '../src/lib/ai-native/planning-workspace-save.ts'
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const scope=planningScope({stage:'quarter',quarter:2,startMonth:'2027-01',mode:'draft'}),id=randomUUID(),userId=randomUUID()
const current={annualPlan:{planningStartMonth:'2027-01',goal:'Keep the annual goal',quarterlyPlans:[{quarter:'Q1',startMonth:'2027-01',focus:'Keep Q1'}],quarterlyFocus:[]},publishingCalendar:{months:{'2027-01':[{id:'keep'}]}},other:'preserved'}
const draft=validatePlanningDraft({scope,expectedRevision:planningRevision(current),title:planningQuarterLabel(scope),content:'Complete proposed quarter, not yet adopted',data:{strategy:'Q3 strategy',focus:'Q3 focus',campaigns:['Proposed event'],contentThemes:['Theme'],promotionPoints:[],monthlyFocus:planningMonths(scope.startMonth,2).map(month=>({month,focus:'Month focus',promotionPoints:[]}))}},scope)
assert.throws(()=>planningScope({...scope,quarter:4}));assert.throws(()=>validatePlanningDraft({...draft,scope:{...scope,quarter:1}},scope))
assert.throws(()=>validatePlanningDraft({...draft,data:{...draft.data,monthlyFocus:[{month:'2027-01'}]}},scope))
assert.equal(planningRevision({b:1,a:2}),planningRevision({a:2,b:1}))
const merged=mergePlanningDraft(current,draft,'task')
assert.equal(merged.annualPlan.goal,current.annualPlan.goal);assert.deepEqual(merged.annualPlan.quarterlyPlans[0],current.annualPlan.quarterlyPlans[0]);assert.deepEqual(merged.publishingCalendar,current.publishingCalendar)
const rolling={annualPlan:{planningStartMonth:'2026-11',quarterlyPlans:['2026-11','2027-02','2027-05','2027-08'].map((startMonth,i)=>({startMonth,quarter:['Q4','Q1','Q2','Q3'][i],focus:`Keep ${i}`})),quarterlyFocus:[]}}
const rollingResult=mergePlanningDraft(rolling,{...draft,scope:{...scope,startMonth:'2026-11'}},'rolling-task')
assert.equal(rollingResult.annualPlan.quarterlyPlans.length,4)
assert.deepEqual(rollingResult.annualPlan.quarterlyPlans[3],rolling.annualPlan.quarterlyPlans[3],'Q3 calendar label must not overwrite the fourth rolling period')
assert.equal(rollingResult.annualPlan.quarterlyPlans[2].quarter,'Q2')
assert.equal(rollingResult.annualPlan.quarterlyPlans[2].startMonth,'2027-05')
assert.throws(()=>mergePlanningDraft(current,{...draft,scope:{...scope,startMonth:'2028-01'}},'other'))
try{
 await prisma.brand.create({data:{id,name:'Planning workspace test',status:'ARCHIVED'}})
 await prisma.brandKnowledge.create({data:{brandId:id,marketingSolution:current}})
 const [first,retry]=await Promise.all([savePlanningDraft(userId,id,'task-one',draft),savePlanningDraft(userId,id,'task-one',draft)])
 assert.equal(first.receiptId,retry.receiptId);assert.notEqual(first.replayed,retry.replayed)
 await assert.rejects(()=>savePlanningDraft(userId,id,'stale-task',draft),/planning_revision_conflict/)
 const saved=await prisma.brandKnowledge.findUnique({where:{brandId:id}})
 assert.deepEqual((saved!.marketingSolution as any).publishingCalendar,current.publishingCalendar)
 assert.equal((saved!.marketingSolution as any).annualPlan.quarterlyPlans.length,2)
 assert.equal(await prisma.brandMarketingSolution.count({where:{brandId:id}}),1)
 const noteScope=planningScope({stage:'focus',mode:'draft',startMonth:'2027-01'})
 const note=validatePlanningDraft({scope:noteScope,expectedRevision:planningRevision(saved!.marketingSolution),title:'Focus',content:'Co-created positioning, not verified merchant facts'},noteScope)
 await savePlanningDraft(userId,id,'note',note)
 const after=await prisma.brandKnowledge.findUnique({where:{brandId:id}})
 assert.deepEqual((after!.marketingSolution as any).annualPlan,(saved!.marketingSolution as any).annualPlan)
 assert.equal((after!.marketingSolution as any).coCreation.focus.content,note.content)
 const marketingScope=planningScope({stage:'marketing_plan',mode:'draft',startMonth:'2027-01'})
 const marketing=validatePlanningDraft({scope:marketingScope,expectedRevision:planningRevision(after!.marketingSolution),title:'七章策略',content:'摘要',data:marketingPlanV2Shape('2027-01')},marketingScope)
 const savedV2=await savePlanningDraft(userId,id,'seven-chapter',marketing)
 const replayV2=await savePlanningDraft(userId,id,'seven-chapter',marketing)
 assert.equal(savedV2.verified,true);assert.equal(replayV2.receiptId,savedV2.receiptId);assert.equal(replayV2.version,savedV2.version)
 const v2:any=(await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId:id}})).marketingSolution
 assert(v2.marketingPlan.content.includes('7. 店内运营与AMC活动'));assert.equal(Object.keys(v2.marketingPlan.strategySections).length,7)
 assert.equal(await prisma.brandMarketingSolution.count({where:{brandId:id,kind:'MARKETING_PLAN'}}),1)
 const markdown='# 品牌策略\n\n原样保留 \"引号\" 和换行。\n'
 const doc=validatePlanningDraft({scope:marketingScope,expectedRevision:planningRevision(v2),title:'原文策略',content:markdown},marketingScope)
 const docReceipt=await savePlanningDraft(userId,id,'document',doc)
 assert.equal(docReceipt.verified,true)
 assert.equal((await savePlanningDraft(userId,id,'document',doc)).version,docReceipt.version)
 const docSaved:any=(await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId:id}})).marketingSolution
 assert.equal(docSaved.marketingPlan.content,markdown);assert.equal(docSaved.marketingPlan.documentFormat,'markdown')
 assert.equal(docSaved.marketingPlan.strategySections,undefined)
 assert.equal((await prisma.brandMarketingSolution.findFirstOrThrow({where:{brandId:id,kind:'MARKETING_PLAN'},orderBy:{version:'desc'}})).output.content,markdown)
 console.log('PASS: scoped drafts, exact months, unrelated quarters/calendar preservation, canonical hash, concurrent idempotency, stale draft rejection, version history, separate co-creation notes')
}finally{await prisma.auditLog.deleteMany({where:{actorId:userId}});await prisma.brand.deleteMany({where:{id}});await prisma.$disconnect()}
