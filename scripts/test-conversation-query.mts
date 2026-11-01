import assert from 'node:assert/strict'
import {savedInterviewQuery,assertConversationRepairBudget} from '../src/lib/ai-native/conversation-query.ts'
import {conversationInput} from '../src/lib/ai-native/contract.ts'
for(const goal of ['AMC的商家访谈现在有什么内容？','查看已保存品牌访谈','Show the saved merchant interview','Summarize the existing interview']){
 assert(savedInterviewQuery({kind:'conversation',goal}),goal)
}
for(const goal of ['根据已有访谈生成策略','更新访谈内容','查看访谈并制定计划','Create an interview plan','Hello'])assert(!savedInterviewQuery({kind:'conversation',goal}),goal)
assert(!savedInterviewQuery({kind:'conversation',goal:'查看已有访谈',planningScope:{mode:'draft'}}))
assert.equal(conversationInput({goal:'AMC的商家访谈现在有什么内容？'}).topic,'brand_planning')
const failure={kind:'verification',data:{verified:false}}
assertConversationRepairBudget([failure,failure])
assert.throws(()=>assertConversationRepairBudget([failure,failure,failure]),(e:any)=>e.code==='INVALID_MODEL_ACTION')
assertConversationRepairBudget([failure,failure,{kind:'input'},failure])
assertConversationRepairBudget([failure,failure,{kind:'verification',data:{verified:true}}])
console.log('PASS: existing interview queries only, fresh-chat routing, durable repair bound and new-input reset')
