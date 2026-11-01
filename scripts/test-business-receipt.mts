import assert from 'node:assert/strict'
import {businessReceipts} from '../src/lib/ai-native/business-receipt.ts'
const call=(tool:string,data:any,extra:any={})=>({capability:'amc.business.write',status:'succeeded',result:{tool,verified:true,state:'returned',result:{content:[{type:'text',text:JSON.stringify(data)}]},...extra}})
assert.equal(businessReceipts([call('board_save_draft',{ok:true})])[0].state,'saved')
assert.equal(businessReceipts([call('generate_brand_research_report',{ok:true})])[0].state,'accepted')
assert.equal(businessReceipts([call('board_save_draft',{ok:false})])[0].state,'failed')
assert.equal(businessReceipts([call('board_save_draft',{}, {verified:false,state:'unknown'})])[0].state,'unknown')
assert.equal(businessReceipts([call('board_save_draft',{})])[0].state,'unknown')
assert.deepEqual(businessReceipts([{...call('board_save_draft',{ok:true}),status:'failed'}]),[])
console.log('PASS mechanical receipts distinguish saved, accepted, failed and unknown without model prose')
