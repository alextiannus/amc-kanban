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
const checklist={...artifact,planningProgress:{stage:execution.stage,summary:'行动清单'},planningDraft:{...artifact.planningDraft,scope:execution,data:{items:[{id:'oct_1',month:'2026-10',action:'核实公开联系电话',plannedTime:'2026-10-20'}],informationToSupplement:[]}}}
assert(validate(checklist),JSON.stringify(validate.errors))
for(const extra of [{completed:true},{owner:'某人'}]){const bad=structuredClone(checklist);Object.assign(bad.planningDraft.data.items[0],extra);assert.equal(validate(bad),false)}
console.log('PASS: full model schema rejects missing conversation kind, cross-year annual rows, array measurements, mismatched scope and AI-owned completion; exact structured transport preserved')

const discussion=new Ajv({strict:false}).compile(planningArtifactSchema({...scope,mode:'discuss'}))
const {planningDraft:_,...reply}=artifact
assert(discussion(reply),'ordinary stage discussion must not force a whole new draft')
