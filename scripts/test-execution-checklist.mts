import assert from 'node:assert/strict'
import {mergeExecutionChecklist,validateExecutionChecklist,mergePlanningDraft,planningScope,planningDraftContract} from '../src/lib/ai-native/planning-workspace-contract'
const item={id:'store-sign',month:'2026-11',action:'更新店内节庆陈列',plannedTime:'2026-11-01'}
const data={items:[item],informationToSupplement:[]}
validateExecutionChecklist(data)
assert.throws(()=>validateExecutionChecklist({...data,items:[{...item,completed:true}]}))
assert.throws(()=>validateExecutionChecklist({...data,items:[item,item]}))
const old={items:[{...item,completed:true,completedAt:'2026-10-18',completedBy:'human'},{id:'old',action:'旧行动',plannedTime:'待确认',completed:false}]}
const merged=mergeExecutionChecklist(old,{...data,items:[{...item,plannedTime:'2026-11-02'}]},'now')
assert.equal(merged.items[0].completed,true)
assert.equal(merged.items[0].completedBy,'human')
assert.equal(merged.items.length,2)
assert.equal(mergeExecutionChecklist(null,data,'now').items[0].completed,false)
const scope=planningScope({stage:'execution_checklist',mode:'draft',startMonth:'2026-10'})
assert.ok(planningDraftContract(scope).planningDraft?.data)
const next=mergePlanningDraft({executionChecklist:old},{scope,expectedRevision:'a'.repeat(64),title:'执行清单',content:'清单',data},'task')
assert.equal(next.executionChecklist.items[0].completed,true)
console.log('execution checklist generation, validation and progress preservation PASS')
