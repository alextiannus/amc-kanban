import assert from 'node:assert/strict'
import {ContextAssembler} from '@immedi/iaic-core'
import {createAmcContextAssembler,AMC_CONTEXT_MAX_BYTES} from '../src/lib/ai-native/runtime-application.mjs'
const payload={skill:'AMC marketing Skill',report:'有来源的报告事实。'.repeat(6000),positioning:'最新商家补充。'.repeat(1400)}
const capability={implementation:{skills:[],instructions:'Use the trusted task and verified source data.'}}
const call={id:'context-call',capability:'fixture.context',input:{},status:'succeeded',result:payload}
const input={task:{input:{goal:'Organize brand positioning'}},capability,actor:{},history:{calls:[call],events:[{seq:1,kind:'call_settled',data:{callId:call.id}}]},dispatcher:{capabilities:new Map([['fixture.context',{authorize:async()=>true,revalidate:async()=>payload}]])}}
await assert.rejects(()=>new ContextAssembler({skillRoot:'skills',overflow:'omit-old-results'}).assemble(input),/Context size limit reached/)
const messages=await createAmcContextAssembler({skillRoot:'skills'}).assemble(input)
const delivered=JSON.parse(messages.at(-1)!.content)
assert.deepEqual(delivered.calls[0].result,payload,'Current source evidence is retained rather than silently clipped')
assert(Buffer.byteLength(messages.at(-1)!.content)<AMC_CONTEXT_MAX_BYTES)
const oversized={...input,history:{...input.history,calls:[{...call,result:{tooLarge:'x'.repeat(AMC_CONTEXT_MAX_BYTES+1)}}]},dispatcher:{capabilities:new Map([['fixture.context',{authorize:async()=>true,revalidate:async()=>({tooLarge:'x'.repeat(AMC_CONTEXT_MAX_BYTES+1)})}]])}}
await assert.rejects(()=>createAmcContextAssembler({skillRoot:'skills'}).assemble(oversized),/Context size limit reached/,'The application boundary remains finite')
console.log('PASS: default overflow reproduced; AMC report context fits losslessly; oversized context still stops')
