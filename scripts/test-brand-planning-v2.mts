import assert from 'node:assert/strict'
import {insightReport,latestInsightReport} from '../src/lib/brand-plan/insight-report.ts'
import {marketingPlanShape,validatePlanningDraft,planningRevision,mergePlanningDraft,assertPlanningConfirmed,planningInputVersions,planningInputsMatch,planningReviewState} from '../src/lib/ai-native/planning-workspace-contract.ts'
const baseline=insightReport('baseline','research',{content:'baseline',generatedAt:'2026-09-01'})!
const monthly=insightReport('monthly','management',{content:'monthly',periodEnd:'2026-09-30',generatedAt:'2026-10-02'})!
assert.equal(latestInsightReport([baseline,monthly])?.id,'monthly')
assert.equal(insightReport('pending','research',{content:'unfinished',status:'running'}),null)
assert.equal(insightReport('empty','management',{generatedAt:'2026-10-18'}),null)
assert.equal(latestInsightReport([insightReport('undated','research',{content:'no timestamp'}),baseline])?.id,'baseline')
assert.equal(latestInsightReport([monthly,{...monthly,id:'aaa'}])?.id,'aaa')
const scope={stage:'marketing_plan',mode:'draft',startMonth:'2026-11'} as const
const shape=marketingPlanShape(scope.startMonth)
assert.deepEqual(shape.monthlyPlans.map(m=>m.month),['2026-11','2026-12','2027-01','2027-02','2027-03','2027-04'])
const interview={content:'Real interview',status:'confirmed'},direction={content:'Verified direction',status:'confirmed',inputVersions:{interview:planningRevision(interview)}}
const current={coCreation:{interview,direction},annualPlan:{goal:'keep',quarterlyPlans:[{quarter:'Q1',focus:'keep'}]},publishingCalendar:{months:{'2026-11':['keep']}}}
assertPlanningConfirmed(current)
const draft=validatePlanningDraft({scope,expectedRevision:planningRevision(current),title:'Brand plan',content:'Full brand marketing narrative',data:shape},scope)
const merged=mergePlanningDraft(current,draft,'task')
assert.deepEqual(merged.annualPlan,current.annualPlan)
assert.deepEqual(merged.publishingCalendar,current.publishingCalendar)
assert.equal(merged.marketingPlan.status,'draft')
assert(merged.coCreation.marketing_plan.content.includes('SWOT'))
assert(merged.coCreation.marketing_plan.content.includes('2027-04'))
assert.deepEqual(merged.marketingPlan.inputVersions,planningInputVersions(current))
assert.throws(()=>validatePlanningDraft({...draft,data:{...shape,swot:null}},scope),/incomplete_marketing_plan/)
assert.throws(()=>validatePlanningDraft({...draft,data:{...shape,monthlyPlans:shape.monthlyPlans.slice(1)}},scope),/invalid_six_month_plan/)
assert.throws(()=>validatePlanningDraft({...draft,data:{...shape,annualCalendar:shape.annualCalendar.slice(1)}},scope),/invalid_annual_calendar/)
assert.doesNotThrow(()=>assertPlanningConfirmed({...current,coCreation:{...current.coCreation,interview:{...interview,content:'edited',status:'draft'}}}))
assert.doesNotThrow(()=>mergePlanningDraft({...current,coCreation:{}},draft,'unconfirmed'),'A strategy can be drafted without visiting prior stages')
console.log('PASS: latest completed reports, missing timestamps, stable ties, seven sections, exact rolling six months, confirmation binding, preserved legacy calendar')

const positioningOnly={coCreation:{interview}}
assertPlanningConfirmed(positioningOnly)
const threeStep=mergePlanningDraft(positioningOnly,{...draft,expectedRevision:planningRevision(positioningOnly)},'three-step')
assert(threeStep.coCreation.marketing_plan.content.includes('Information to supplement'))
assert(threeStep.coCreation.marketing_plan.content.includes('Marketing direction'))
assert.equal(planningReviewState(threeStep).planNeedsReview,false)
assert.equal(planningReviewState({...threeStep,coCreation:{...threeStep.coCreation,direction:{content:'legacy edit',status:'draft'}}}).planNeedsReview,false)
assert(planningInputsMatch({...planningInputVersions(positioningOnly),direction:'legacy-version'},positioningOnly))
console.log('PASS: positioning-only strategy confirmation, integrated direction/gaps and legacy direction edits do not invalidate strategy')
