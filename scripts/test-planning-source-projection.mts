import assert from 'node:assert/strict'
import {projectSavedMarketingPlan,projectSavedExecutionChecklist} from '../src/lib/ai-native/brand-planning.ts'
import {marketingPlanShape} from '../src/lib/ai-native/planning-workspace-contract.ts'
const content='完整经营策略。'.repeat(1800)+'\n2027-03 最后月份复盘与期望补充信息'
const old={...marketingPlanShape('2026-10'),title:'Reviewed plan',status:'draft',planningStartMonth:'2026-10',content,structuredDataStale:true}
old.monthlyPlans[5].activities=['obsolete_generated_activity']
const before=structuredClone(old),edited=projectSavedMarketingPlan(old)
assert.equal(edited.report.content,content);assert.equal(edited.partial,false)
assert(!('monthlyPlans' in edited.report),'stale generated arrays cannot contradict the edited document')
assert(!JSON.stringify(edited.report).includes('obsolete_generated_activity'))
assert.deepEqual(old,before)
const active={...marketingPlanShape('2026-10'),content,structuredDataStale:false}
const current=projectSavedMarketingPlan(active)
assert.equal(current.report.content,content)
assert(!('annualCalendar' in current.report));assert(!('monthlyPlans' in current.report))
const legacy=projectSavedMarketingPlan({...active,content:''})
assert.equal(legacy.report.annualCalendar.length,12);assert.equal(legacy.report.monthlyPlans.length,6)
assert.deepEqual(legacy.report.monthlyPlans[5],active.monthlyPlans[5])
assert(JSON.stringify(current.report).length<JSON.stringify(active).length)
assert.equal(active.monthlyPlans.length,6,'persistent source remains intact')
assert.equal(current.partial,false)
const items=Array.from({length:120},(_,i)=>({id:`task_${i}_`+'a'.repeat(70),month:i<60?'2026-10':'2027-03',action:`具体行动${i}：`+'保留完整店内动作'.repeat(12),plannedTime:'2027-03-29',completed:i%2===0,completedBy:'private-actor'}))
const checklist={items,informationToSupplement:['待商家确认活动机制']},snapshot=structuredClone(checklist)
const projected=projectSavedExecutionChecklist(checklist)
assert.equal(projected.partial,false);assert.equal(projected.report.items.length,120)
assert.equal(projected.report.items[119].id,items[119].id);assert.equal(projected.report.items[119].action,items[119].action)
assert.equal(projected.report.items[118].completed,true)
assert(!('completedBy' in projected.report.items[0]),'completion identity stays in server audit, not AI planning inputs')
assert.deepEqual(checklist,snapshot)
assert.equal(projectSavedExecutionChecklist({items:[...items,items[0]]}).partial,true)
console.log('PASS: full edited strategy through last month; stale arrays omitted; all 120 task IDs/actions/completion flags intact; source objects and server audit unchanged')
