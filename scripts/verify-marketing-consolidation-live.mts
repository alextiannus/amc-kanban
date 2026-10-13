// Read-only production acceptance: two configured model calls; never saves brand plans.
import assert from 'node:assert/strict'
import {prisma} from '../src/lib/prisma.ts'
import {buildMarketingExpertPrompt} from '../src/lib/brand-plan/marketingExpert.ts'
import {callLLM} from '../src/lib/llmRouter.ts'
import {readMarketingWorkspace} from '../src/lib/ai-native/brand-planning.ts'
import {actorFor} from '../src/lib/ai-native/contract.ts'
assert(process.env.RENDER,'Run with the existing configured central model on Render')
const brandId='cmpaz4kwn0000lv2aa67iic3o'
try{
 const before=await prisma.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true}})
 const workspace=await readMarketingWorkspace(actorFor(brandId,'cmrsz84qu009foe2a8xsmimo7'))
 assert.equal(workspace.brandId,brandId);assert.equal(workspace.status,'available')
 const input:any={brand:{name:'隔离验收品牌',location:'Singapore'},merchantInterview:{summary:'验收假设：品牌主选择家庭聚餐；预算未知，不编业绩。'},productCatalog:[{name:'招牌烤鱼',isSignature:true}],subscriptionStrategy:{platformCoverage:['instagram'],monthlyContentQuota:4},planningWindow:{selectedStartMonth:'2027-01'},currentQuarter:{quarter:'Q1',year:2027,startMonth:'2027-01',endMonth:'2027-03',periodLabel:'2027-01 至 2027-03',months:['2027-01','2027-02','2027-03']}}
 for(const scope of ['annual_strategy','quarter'] as const){
  const {prompt,trace}=await buildMarketingExpertPrompt(scope,input)
  const result=await callLLM('marketing_plan',prompt,8192,{temperature:0.35,jsonMode:true,deadlineMs:65000,attemptTimeoutMs:[60000],maxAttempts:1,allowDefaultFallback:true,allowAnyFallback:false,allowSystemFallback:false})
  assert(!result.error,result.error)
  const output=JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''))
  assert(!output.kind&&!output.content,'Must return structured plan, not conversation artifact')
  if(scope==='annual_strategy'){assert(output.goal&&output.theme);assert.equal(output.strategyPrinciples.length,3);input.annualStrategy=output}
  else{assert.equal(output.monthlyFocus.length,3);assert.deepEqual(output.monthlyFocus.map((x:any)=>x.month),input.currentQuarter.months);assert.equal(output.promotionPoints.length,2)}
  console.log('PLANNING_LIVE '+JSON.stringify({phase:'structured_passed',scope,skillVersion:trace.skillVersion,model:result.modelName,output}))
 }
 const after=await prisma.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true}})
 assert.deepEqual(before,after,'Read-only acceptance must not change saved plans')
 console.log('PLANNING_LIVE '+JSON.stringify({phase:'passed',workspaceRead:true,brandPlansUnchanged:true}))
}finally{await prisma.$disconnect()}
