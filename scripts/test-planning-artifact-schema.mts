import assert from 'node:assert/strict'
import Ajv from 'ajv'
import {conversationFrom} from '../src/lib/ai-native/contract.ts'
import {planningArtifactSchema} from '../src/lib/ai-native/planning-artifact-schema.ts'
import {marketingPlanShape,validatePlanningDraft} from '../src/lib/ai-native/planning-workspace-contract.ts'
import {nativeWireTools,nativeWireCall} from '../src/lib/ai-native/tool-wire.ts'
const scope={stage:'marketing_plan',mode:'draft',startMonth:'2026-10'} as const
const data=marketingPlanShape(scope.startMonth)
const artifact={kind:'conversation',brandId:'real-brand',content:'摘要',contextDigest:'a'.repeat(64),planningProgress:{stage:scope.stage,summary:'完整草案'},planningDraft:{scope,expectedRevision:'b'.repeat(64),title:'营销策略',content:'摘要',data}}
const schema=planningArtifactSchema(scope),valid=new Ajv({strict:false}).compile(schema)
assert(valid(artifact),JSON.stringify(valid.errors));validatePlanningDraft(artifact.planningDraft,scope)
for(const mutate of [(x:any)=>delete x.kind,(x:any)=>x.planningDraft.data.annualCalendar.push({month:'2027-01',theme:'元旦',campaign:'跨年内容'}),(x:any)=>x.planningDraft.data.monthlyPlans[0].measurement=['错误数组'],(x:any)=>x.planningDraft.scope.startMonth='2026-11']){
 const bad=structuredClone(artifact);mutate(bad);assert.equal(valid(bad),false,'reject actual observed production format defects');assert.throws(()=>conversationFrom(JSON.stringify(bad),{kind:'conversation',brandId:artifact.brandId,planningScope:scope} as any))
}
const writer={name:'my_write_workspace',description:'write',parameters:{type:'object',properties:{path:{type:'string'},content:{type:'string'},mediaType:{type:'string'},expectedRevision:{type:'integer'}}}}
const wire=nativeWireTools([writer],true,scope);assert.deepEqual(wire[0].parameters.properties.content,schema)
const call=nativeWireCall({function:{name:writer.name,arguments:JSON.stringify({path:'work/result.json',expectedRevision:0,mediaType:'application/json',content:artifact})}},{usage:{}} as any,[writer],true)
assert.deepEqual(JSON.parse(JSON.parse(call.function.arguments).content),artifact)
const execution={...scope,stage:'execution_checklist'} as const
const validate=new Ajv({strict:false}).compile(planningArtifactSchema(execution))
const checklist={...artifact,planningProgress:{stage:execution.stage,summary:'行动清单'},planningDraft:{...artifact.planningDraft,scope:execution,data:{items:[{id:'oct_1',month:'2026-10',action:'制定圣诞活动方案',plannedTime:'2026-10-20'}],informationToSupplement:[]}}}
assert(validate(checklist),JSON.stringify(validate.errors))
for(const extra of [{completed:true},{owner:'某人'}]){const bad=structuredClone(checklist);Object.assign(bad.planningDraft.data.items[0],extra);assert.equal(validate(bad),false)}
console.log('PASS: full model schema rejects missing conversation kind, incorrect annual month counts, array measurements, mismatched scope and AI-owned completion; exact structured transport preserved')

const discussion=new Ajv({strict:false}).compile(planningArtifactSchema({...scope,mode:'discuss'}))
const {planningDraft:_,...reply}=artifact
assert(discussion(reply),'ordinary stage discussion must not force a whole new draft')

const oldCalendar=structuredClone(artifact);oldCalendar.planningDraft.data.annualCalendar=oldCalendar.planningDraft.data.annualCalendar.map((m,i)=>({...m,month:`2026-${String(i+1).padStart(2,"0")}`}));assert.equal(valid(oldCalendar),false)
const gapTask=structuredClone(checklist);gapTask.planningDraft.data.informationToSupplement=["电话待确认"];assert.equal(validate(gapTask),false)

// New strategy evidence must survive formatting and adoption; legacy saved plans stay readable.
const rich=structuredClone(artifact)
rich.planningDraft.data.strategyFramework.audience=['核心客群｜家庭备餐｜需要真实产品与购买入口证据']
assert(valid(rich),JSON.stringify(valid.errors))
const {marketingPlanMarkdown,validateMarketingPlan,mergePlanningDraft}=await import('../src/lib/ai-native/planning-workspace-contract.ts')
const adopted=mergePlanningDraft({},rich.planningDraft,'rich-task')
assert(adopted.coCreation.marketing_plan.content.includes(rich.planningDraft.data.strategyFramework.audience[0]))
assert(adopted.coCreation.marketing_plan.content.includes('平台分工与转化路径'))
const legacy=structuredClone(rich.planningDraft.data);delete (legacy as any).strategyFramework
assert.doesNotThrow(()=>validateMarketingPlan(legacy,scope.startMonth))
for(const key of ['summary','audience','channels','review']){
 const broken=structuredClone(rich);(broken.planningDraft.data.strategyFramework as any)[key]=[]
 assert.equal(valid(broken),false);assert.throws(()=>validateMarketingPlan(broken.planningDraft.data,scope.startMonth))
}
console.log('PASS: strategy evidence and audience/conversion/review sections persist in adopted document; old plans remain compatible')
