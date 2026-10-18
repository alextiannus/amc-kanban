import assert from 'node:assert/strict'
import {conversationFrom} from '../src/lib/ai-native/contract'
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
assert.equal(merged.items.length,1)
assert.equal(merged.retiredItems.length,1)
assert.equal(merged.retiredItems[0].id,old.items[1].id)
const restored=mergeExecutionChecklist(merged,{...data,items:old.items.map(({completed,completedAt,completedBy,...task}:any)=>({...task,month:task.month||'2026-11'}))},'later')
assert.equal(restored.items.length,2);assert.equal(restored.retiredItems.length,0);assert.equal(restored.items[0].completed,true)
assert.equal(mergeExecutionChecklist(null,data,'now').items[0].completed,false)
const scope=planningScope({stage:'execution_checklist',mode:'draft',startMonth:'2026-10'})
assert.ok(planningDraftContract(scope).planningDraft?.data)
const next=mergePlanningDraft({executionChecklist:old},{scope,expectedRevision:'a'.repeat(64),title:'执行清单',content:'清单',data},'task')
assert.equal(next.executionChecklist.items[0].completed,true)
console.log('execution checklist generation, validation and progress preservation PASS')

const large=JSON.stringify({kind:'conversation',brandId:'test',contextDigest:'a'.repeat(64),content:'Monthly checklist',planningDraft:{scope,expectedRevision:'a'.repeat(64),title:'执行清单',content:'六个月全部适用动作',data:{items:Array.from({length:60},(_,i)=>({id:'action-'+i,month:'2026-10',action:'核对店内配合动作'.repeat(60),plannedTime:'待确认'})),informationToSupplement:[]}}})
assert(Buffer.byteLength(large)>32000)
assert.doesNotThrow(()=>conversationFrom(large,{kind:'conversation',brandId:'test',topic:'brand_planning',planningScope:scope} as any))
console.log('Full monthly checklist artifact capacity PASS')
