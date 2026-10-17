import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {savePlanningDocument} from '../src/lib/ai-native/planning-document.ts'
import {readMarketingWorkspace} from '../src/lib/ai-native/brand-planning.ts'
import {actorFor} from '../src/lib/ai-native/contract.ts'
import {savePlanningDraft} from '../src/lib/ai-native/planning-workspace-save.ts'
import {marketingPlanShape,validatePlanningDraft,planningRevision,assertPlanningConfirmed} from '../src/lib/ai-native/planning-workspace-contract.ts'
const url=new URL(process.env.DATABASE_URL||'');assert(['localhost','127.0.0.1'].includes(url.hostname));assert(url.pathname.startsWith('/amc_lineage_test_'))
const brandId=randomUUID(),userId=randomUUID(),otherId=randomUUID()
let current:any={publishingCalendar:{keep:true}}
async function send(stage:string,action:string,content:string){const v=await savePlanningDocument(brandId,userId,{stage,action,content,requestKey:randomUUID(),expectedRevision:planningRevision(current)});current=(await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId}})).marketingSolution;return v}
try{
 await prisma.brand.create({data:{id:brandId,name:'Planning document test',status:'ARCHIVED'}})
 await prisma.brandKnowledge.create({data:{brandId,marketingSolution:current}})
 await assert.rejects(()=>send('direction','confirm','Direction'),/interview_confirmation_required/)
 await send('interview','save','Interview with source and open questions')
 assert.equal(current.coCreation.interview.status,'draft')
 await send('interview','confirm','Interview with source and open questions')
 await send('direction','save','Direction and selling point evidence')
 await send('direction','confirm','Direction and selling point evidence')
 assertPlanningConfirmed(current)
 await assert.rejects(()=>savePlanningDocument(brandId,userId,{stage:'interview',action:'save',content:'stale',expectedRevision:'0'.repeat(64)}),/planning_revision_conflict/)
 await assert.rejects(()=>savePlanningDocument(brandId,userId,{stage:'interview',action:'save',content:'Foreign attachment',attachmentIds:[otherId],expectedRevision:planningRevision(current)}),/attachment_not_found/)
 await send('interview','save','Updated interview')
 assert.throws(()=>assertPlanningConfirmed(current),/planning_confirmation_required/)
 assert.deepEqual(current.publishingCalendar,{keep:true})
 assert.equal(await prisma.auditLog.count({where:{resourceId:brandId}}),5)
 const longInterview='Known brand information. '.repeat(600)
 await send('interview','save',longInterview);await send('interview','confirm',longInterview)
 await send('direction','save','Direction and evidence');await send('direction','confirm','Direction and evidence')
 const source=await readMarketingWorkspace(actorFor(brandId,userId))
 assert.equal(source.confirmationState?.directionConfirmed,true,'Long document projection cannot invalidate trusted confirmation metadata')
 const scope={stage:'marketing_plan',mode:'draft',startMonth:'2026-11'} as const
 const full=validatePlanningDraft({scope,expectedRevision:planningRevision(current),title:'Complete plan',content:'Complete planning narrative',data:marketingPlanShape(scope.startMonth)},scope)
 await savePlanningDraft(userId,brandId,'full-plan-fixture',full)
 current=(await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId}})).marketingSolution
 assert(current.coCreation.marketing_plan.content.includes('2027-04'),'Editable document contains all six months')
 await send('marketing_plan','confirm',current.coCreation.marketing_plan.content)
 assert.equal(await prisma.brandMarketingSolution.count({where:{brandId,kind:'MARKETING_PLAN'}}),2)
 assert.equal(current.marketingPlan.status,'confirmed')
 console.log('PASS: draft/confirmation separation, trusted identity, upstream invalidation, conflict and attachment isolation, preserved calendar, audit history')
}finally{await prisma.auditLog.deleteMany({where:{resourceId:brandId}});await prisma.brand.deleteMany({where:{id:brandId}});await prisma.$disconnect()}
