import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {planningRevision} from '../src/lib/ai-native/planning-workspace-contract.ts'
import {readInterviewInformationSources,interviewInformationTaskBody} from '../src/lib/brand-plan/interview-information.ts'
import {savePlanningDocument} from '../src/lib/ai-native/planning-document.ts'
import {getBrandMarketingInputs,getBrandPlan} from '../src/lib/brand-plan/service.ts'
import {projectMarketingInputs,withoutStrategyQuotas,projectPositioningInputs} from '../src/lib/ai-native/brand-planning.ts'
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const id=randomUUID(),originalFetch=globalThis.fetch
try{
 await prisma.brand.create({data:{id,name:'Positioning fixture',description:'Owner-provided description',location:'Singapore',status:'ARCHIVED'}})
 let solution:any={coCreation:{interview:{content:'Existing user interview',attachmentIds:[]}}}
 await prisma.brandKnowledge.create({data:{brandId:id,marketingSolution:solution,businessHours:'10–18'}})
 const first=await readInterviewInformationSources(id)
 assert.deepEqual(Object.keys(first.sourceHashes).sort(),['brand','interview','report'])
 assert.equal((await readInterviewInformationSources(id,'en')).sourceRevision,first.sourceRevision,'Language cannot trigger re-positioning')
 assert.equal(interviewInformationTaskBody({...first,skillVersion:'upgraded',month:'2027-01'}).requestKey,interviewInformationTaskBody(first).requestKey,'Skill and month cannot trigger re-positioning')
 const organized='## 当前信息\nPreserved positioning.\n\n## 希望补充的信息\n- Confirm budget.'
 solution={coCreation:{interview:{content:organized,status:'draft',provenance:{organizedContentHash:planningRevision(organized),interviewInput:first.interviewInput,sourceHashes:first.sourceHashes}}}}
 await prisma.brandKnowledge.update({where:{brandId:id},data:{marketingSolution:solution}})
 assert.equal((await readInterviewInformationSources(id)).sourceRevision,first.sourceRevision,'Adopting a derived view cannot create a self-triggering generation loop')
 solution.coCreation.interview.status='confirmed';await prisma.brandKnowledge.update({where:{brandId:id},data:{marketingSolution:solution}})
 assert.equal((await readInterviewInformationSources(id)).sourceRevision,first.sourceRevision,'Confirmation alone does not change source facts')
 solution.coCreation.principal_strategy={content:'Owner strategy: emphasize trust',status:'draft'}
 await prisma.brandKnowledge.update({where:{brandId:id},data:{marketingSolution:solution}})
 assert.equal((await readInterviewInformationSources(id)).sourceRevision,first.sourceRevision,'Strategy input does not rewrite brand positioning')
 solution.coCreation.interview.content+='\nOwner correction: updated products.'
 await prisma.brandKnowledge.update({where:{brandId:id},data:{marketingSolution:solution}})
 const manual=await readInterviewInformationSources(id);assert.deepEqual(manual.changedSources,['interview'])
 await prisma.brand.update({where:{id},data:{description:'Updated owner description'}})
 const profile=await readInterviewInformationSources(id);assert.notEqual(profile.sourceHashes.brand,manual.sourceHashes.brand);assert.equal(profile.sourceHashes.report,manual.sourceHashes.report)
 await prisma.brandKnowledge.update({where:{brandId:id},data:{researchReport:{reportMarkdown:'# New report body',generatedAt:'2026-10-18'}}})
 const report=await readInterviewInformationSources(id);assert.notEqual(report.sourceHashes.report,profile.sourceHashes.report)
 await prisma.brandPlanInterview.create({data:{brandId:id,rawNotes:'Latest interview: updated audience'}})
 assert.notEqual((await readInterviewInformationSources(id)).sourceHashes.interview,report.sourceHashes.interview)
 globalThis.fetch=async()=>Response.json({ok:true,events:[{date:'2026-12-25',name:'Fixture holiday',source:'fixture evidence'}]})
 const long=projectPositioningInputs({latestInterview:{rawNotes:'x'.repeat(30000)+'LATEST OWNER CORRECTION'}});assert(long.partial);assert(long.report.latestInterview.rawNotes.endsWith('LATEST OWNER CORRECTION'))
 const beforeStrategy=await readInterviewInformationSources(id),view=await getBrandPlan(id)
 await savePlanningDocument(id,'fixture-owner',{stage:'principal_strategy',action:'save',content:'Owner strategy: emphasize trust',expectedRevision:view!.marketingSolutionRevision,requestKey:'owner-strategy-fixture'})
 assert.equal((await readInterviewInformationSources(id)).sourceRevision,beforeStrategy.sourceRevision,'Saving principal strategy does not change positioning sources')
 const inputs=await getBrandMarketingInputs(id,'2026-11')
 assert(inputs);assert.equal(inputs.brandPositioning.status,'confirmed');assert.equal(inputs.principalStrategy.content,'Owner strategy: emphasize trust')
 assert.equal((inputs as any).subscription,undefined);assert(inputs.platformPlanning.cadenceRule.includes('不规定'))
 assert.deepEqual(inputs.marketCalendar.years,[2026,2027])
 const projected=projectMarketingInputs(inputs);assert.equal(projected.report.marketCalendar.events[0].date,'2026-12-25');assert.equal(projected.report.brandPositioning.content,solution.coCreation.interview.content)
 assert.deepEqual(withoutStrategyQuotas({subscriptionStrategy:{quota:8},quarterlyPlans:[{focus:'Keep focus',suggestedMonthlyPosts:8}]}),{quarterlyPlans:[{focus:'Keep focus'}]})
 console.log('PASS: exactly three positioning source revisions, no language/Skill/month/self-generation loops, latest owner/brand/report changes, separate strategy input, holidays across years, exact dates, no subscription or posting counts')
}finally{globalThis.fetch=originalFetch;await prisma.brand.deleteMany({where:{id}});await prisma.$disconnect()}
