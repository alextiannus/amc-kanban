import assert from 'node:assert/strict'
process.env.DATABASE_URL='postgresql://localhost/unused'
const {activeConversationStatus}=await import('../src/lib/ai-native/conversation-status.ts')
let reads=0,hasSave=false
const actor={} as any,receipt={state:'saved',verified:true,addedAnswers:[],revision:'fixture'}
const app:any={runtime:{state:async(a:any,id:string)=>{assert.equal(a,actor);return {id,status:'running',input:{goal:'confirm'},version:1}}},tasks:{operationReceipts:async()=>hasSave?[{capability:'amc.interview.save',status:'succeeded'}]:[{capability:'amc.context',status:'succeeded'}],history:async(a:any,id:string)=>{assert.equal(a,actor);assert.equal(id,'task');reads++;return {calls:[{capability:'amc.interview.save',status:'succeeded',result:receipt}]}}}}
assert.equal((await activeConversationStatus(app,actor,'task','conversation'))?.progress.stage,'reply');assert.equal(reads,0)
hasSave=true;assert.deepEqual((await activeConversationStatus(app,actor,'task','conversation'))?.interviewSave,receipt);assert.equal(reads,1)
console.log('PASS saved interview receipt is visible during generation; ordinary polling avoids full history')
