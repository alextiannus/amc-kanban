import assert from 'node:assert/strict'
import {executionCreativeBrief} from '../src/lib/ai-native/execution-creative-brief.ts'
const facts={name:'真实品牌',description:'手工包子',productCatalog:[{name:'爆汁包'}]}
const workspace={coCreation:{interview:{content:'家庭午晚餐'},principal_strategy:{content:'推广家庭分享'}},marketingPlan:{coreSellingPoints:['现做与汤汁'],monthlyPlans:[{month:'2026-10',activities:['十月家庭分享活动']},{month:'2026-11',activities:['十一月新品']}]}}
const brief=executionCreativeBrief(facts,workspace,'2026-10')
assert.equal(brief.positioning,'家庭午晚餐');assert.deepEqual(brief.sellingPoints,['现做与汤汁']);assert.equal(brief.principal,'推广家庭分享');assert.deepEqual(brief.monthlyCampaign.activities,['十月家庭分享活动']);assert.deepEqual(brief.products,['爆汁包'])
console.log('PASS: execution matching uses current positioning, selling points, real products and the selected month campaign')
