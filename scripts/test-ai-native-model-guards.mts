import assert from 'node:assert/strict'
import {boundInvalidActions,assertTaskAllowance} from '../src/lib/ai-native/model-guards.ts'
let failure=true;let original:any;const provider=boundInvalidActions({name:'fixture',next:async()=>{if(!failure)return {type:'finish'};original=Object.assign(new Error('Invalid arguments'),{code:'INVALID_MODEL_ACTION',invalidAction:true,usage:{inputTokens:17,outputTokens:4},usageEvidence:{providerReference:'fixture'}});throw original}})
async function invalid(taskId:string,retry:boolean){await assert.rejects(()=>provider.next({billingContext:{taskId}}),(e:any)=>e===original&&e.invalidAction===retry&&e.usage.outputTokens===4&&e.usageEvidence.providerReference==='fixture')}
await invalid('a',true);await invalid('b',true);await invalid('a',true);await invalid('a',false);await invalid('b',true)
failure=false;assert.equal((await provider.next({billingContext:{taskId:'b'}})).type,'finish');failure=true
await invalid('b',true);await invalid('b',true);await invalid('b',false)
const outage=new Error('network');await assert.rejects(()=>boundInvalidActions({next:async()=>{throw outage}}).next({}),(e)=>e===outage)
assertTaskAllowance({platformUnits:'450000',complete:true});assert.throws(()=>assertTaskAllowance({platformUnits:'450001',complete:true}),(e:any)=>e.statusCode===429&&e.limitReached);assert.throws(()=>assertTaskAllowance({platformUnits:0,complete:false}),(e:any)=>e.statusCode===409)
console.log('PASS: invalid actions stop at three, task isolation and valid reset, original usage preserved, quota boundaries')
