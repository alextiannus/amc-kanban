import assert from 'node:assert/strict'
import {projectBusinessResult,BUSINESS_RESULT_MAX_BYTES} from '../src/lib/ai-native/business-projection.ts'
const result=(value:any)=>({content:[{type:'text',text:JSON.stringify(value)}]})
const request={id:'request-original',status:'failed',reportId:'report-original'},workspace={researchRequest:request,researchReport:{id:'report-original',content:'中文研究内容'.repeat(100000)},marketingPlan:{content:'strategy'.repeat(50000)}}
const source=result({ok:true,brand:{id:'brand-original'},marketingSolution:workspace,brandPlan:workspace})
const before=JSON.stringify(source),bounded=projectBusinessResult('get_brand_marketing_plan',source),data=JSON.parse(bounded.content[0].text)
assert(Buffer.byteLength(JSON.stringify(bounded))<=BUSINESS_RESULT_MAX_BYTES)
assert.deepEqual(data.marketingSolution.researchRequest,request)
assert.equal(data.marketingSolution.researchReport.id,'report-original');assert.equal(data.partial,true);assert.equal(data.brandPlan,undefined)
assert.equal(JSON.stringify(source),before,'source remains unchanged')
const small=result({ok:true,draft:{id:'draft-original',status:'draft'}});assert.equal(projectBusinessResult('board_save_draft',small),small)
const drafts=result({ok:true,total:100,nextCursor:'cursor-original',drafts:Array.from({length:100},(_,i)=>({id:'draft-'+i,caption:'文案'.repeat(10000),status:'draft'}))})
const list=JSON.parse(projectBusinessResult('board_list_drafts',drafts).content[0].text);assert.equal(list.total,100);assert.equal(list.nextCursor,'cursor-original');assert.equal(list.drafts[0].id,'draft-0');assert.equal(list.partial,true)
const failed=projectBusinessResult('get_brand_marketing_plan',{...source,isError:true});assert.equal(failed.isError,true)
console.log('PASS bounded UTF-8 business results, exact IDs/status/count/cursor, explicit partial projection, unchanged sources and small receipts')
// Core must be able to retain the latest tool result within its actual context budget.
const {boundedHistory}=await import('../node_modules/@immedi/iaic-core/context/bounded-history.js')
const history=(r:any)=>({calls:[{id:'latest',status:'succeeded',result:r}],events:[]})
assert(Buffer.byteLength(boundedHistory(history(source),320000,'omit-old-results'))>320000,'reproduces the old latest-result overflow')
assert(Buffer.byteLength(boundedHistory(history(bounded),320000,'omit-old-results'))<=320000)
const extreme=projectBusinessResult('board_save_draft',result({ok:true,id:'x'.repeat(1000000)}))
assert.equal(extreme.isError,undefined);assert.equal(extreme.outcomeUnknown,true)
assert(Buffer.byteLength(JSON.stringify(extreme))<=BUSINESS_RESULT_MAX_BYTES)
console.log('PASS Core latest-result budget regression and unknown receipt on unrepresentable IDs')
