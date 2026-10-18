import assert from 'node:assert/strict'
import {conversationFrom} from '../src/lib/ai-native/contract'
import {assertAmcExecutionChecklist,mergeExecutionChecklist,validateExecutionChecklist,mergePlanningDraft,planningScope,planningDraftContract} from '../src/lib/ai-native/planning-workspace-contract'
const item={id:'store-sign',month:'2026-11',action:'安排11月内容发布',plannedTime:'2026-11-01'}
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
assert.equal(next.executionChecklist.items.find((v:any)=>v.id===item.id).completed,true)
console.log('execution checklist generation, validation and progress preservation PASS')

const large=JSON.stringify({kind:'conversation',brandId:'test',contextDigest:'a'.repeat(64),content:'Monthly checklist',planningDraft:{scope,expectedRevision:'a'.repeat(64),title:'执行清单',content:'六个月全部适用动作',data:{items:Array.from({length:60},(_,i)=>({id:'action-'+i,month:'2026-10',action:'核对店内配合动作'.repeat(60),plannedTime:'待确认'})),informationToSupplement:[]}}})
assert(Buffer.byteLength(large)>32000)
assert.doesNotThrow(()=>conversationFrom(large,{kind:'conversation',brandId:'test',topic:'brand_planning',planningScope:scope} as any))
console.log('Full monthly checklist artifact capacity PASS')

for(const action of ['收集会员复购与真实顾客反馈','完成元旦物料铺设与员工培训订单承接','月底回访商家并复盘数据','安排员工培训'])assert.throws(()=>assertAmcExecutionChecklist({items:[{...item,action}],informationToSupplement:[]}),/execution_task_outside_amc_scope/)
const prepared=mergePlanningDraft({}, {scope,expectedRevision:'a'.repeat(64),title:'执行清单',content:'清单',data},'new').executionChecklist
const setup=prepared.items.find((v:any)=>v.id==='amc-follow-review-setup');assert(setup&&!setup.completed)
const carried=mergeExecutionChecklist(prepared,data,'next','2026-12');assert.equal(carried.items.filter((v:any)=>v.id===setup.id).length,1);assert.equal(carried.items.find((v:any)=>v.id===setup.id).plannedTime,setup.plannedTime)
const done={...carried,items:carried.items.map((v:any)=>v.id===setup.id?{...v,completed:true,completedAt:'human-time',completedBy:'human'}:v)}
const after=mergeExecutionChecklist(done,data,'later','2027-01');assert(!after.items.some((v:any)=>v.id===setup.id));assert(after.retiredItems.find((v:any)=>v.id===setup.id).completed)
const again=mergeExecutionChecklist(after,data,'again','2027-02');assert(!again.items.some((v:any)=>v.id===setup.id))
console.log('PASS: AMC scope rejects merchant operations; one-time follow/review preparation carries until human completion and never resets')

assert.doesNotThrow(()=>validateExecutionChecklist({items:[{...item,action:'安排员工培训'}],informationToSupplement:[]}),'historical structural reading remains compatible; current writes enforce AMC scope')

assert.equal(setup.action,"安排店内关注与Google评论贴纸制作、摆放及扫码验证")
assert.doesNotThrow(()=>assertAmcExecutionChecklist({items:[{...item,id:"amc-follow-review-setup",action:setup.action}],informationToSupplement:[]}))
assert.equal(carried.items.find((v:any)=>v.id===setup.id).action,setup.action)
console.log("PASS: mandatory sticker production, placement and QR verification survives preparation carry-forward")
