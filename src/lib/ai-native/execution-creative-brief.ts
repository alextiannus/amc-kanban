const short=(v:unknown,n=1200)=>typeof v==='string'?v.trim().slice(0,n):''
/** Execution matching uses the current strategy and monthly campaign; strategy generation never searches. */
export function executionCreativeBrief(facts:any,workspace:any,month:string){
 const w=workspace?.workspace||workspace||{},inputs=w.marketingInputs||{},solution=w.coCreation||{}
 return {brand:short(facts.name,200),category:short(facts.industry,200),description:short(facts.description),positioning:short(inputs.brandPositioning?.content||solution.interview?.content,3000),sellingPoints:(w.marketingPlan?.coreSellingPoints||[]).filter((v:unknown)=>typeof v==='string').slice(0,6).map((v:string)=>short(v,350)),principal:short(inputs.principalStrategy?.content||solution.principal_strategy?.content),monthlyCampaign:(w.marketingPlan?.monthlyPlans||[]).find((v:any)=>v.month===month)||null,products:(facts.productCatalog||[]).slice(0,12).map((v:any)=>short(v.name,120)),platforms:(inputs.platformPlanning?.knownBrandPlatforms||[]).filter((v:unknown)=>typeof v==='string').slice(0,8)}
}
