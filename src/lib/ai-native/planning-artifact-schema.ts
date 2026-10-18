import {sixPlanningMonths,type PlanningScope} from './planning-workspace-contract'
/** Model-facing guidance only: the application verifier remains authoritative. */
export function planningArtifactSchema(scope:PlanningScope){
 const text={type:'string',minLength:1,maxLength:4000}
 const list={type:'array',items:text,minItems:1,maxItems:24}
 const object=(properties:Record<string,unknown>,required=Object.keys(properties),additionalProperties=false)=>({type:'object',properties,required,additionalProperties})
 const month={type:'string',enum:sixPlanningMonths(scope.startMonth)}
 const data=scope.stage==='execution_checklist'
 ?object({items:{type:'array',maxItems:120,items:object({id:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,100}$'},month,action:{...text,maxLength:2000},plannedTime:{...text,maxLength:200}})},informationToSupplement:{...list,minItems:0}})
 :object({strategyDirection:list,brandCharacteristics:list,coreSellingPoints:list,swot:object({strengths:list,weaknesses:list,opportunities:list,threats:list}),annualCalendar:{type:'array',minItems:12,maxItems:12,description:'Exactly January through December of the start year, in order. Cross-year months belong ONLY in monthlyPlans.',items:object({month:{type:'string',enum:Array.from({length:12},(_,i)=>`${scope.startMonth.slice(0,4)}-${String(i+1).padStart(2,'0')}`)},theme:text,campaign:text})},monthlyPlans:{type:'array',minItems:6,maxItems:6,items:object({month,goal:text,theme:text,activities:list,channels:list,content:list,resources:text,measurement:{...text,description:'One string; never an array.'}})},inStoreActivities:list,brandCreatives:list,informationToSupplement:{...list,minItems:0}})
 return object({kind:{type:'string',const:'conversation'},brandId:text,content:{...text,maxLength:14000},contextDigest:{type:'string',pattern:'^[a-f0-9]{64}$'},planningProgress:object({stage:{type:'string',const:scope.stage},summary:{...text,maxLength:500}}),planningDraft:object({scope:object({stage:{type:'string',const:scope.stage},mode:{type:'string',const:'draft'},startMonth:{type:'string',const:scope.startMonth}}),expectedRevision:{type:'string',pattern:'^[a-f0-9]{64}$'},title:{...text,maxLength:200},content:{...text,maxLength:14000},data})},scope.mode==='draft'?undefined:['kind','brandId','content','contextDigest','planningProgress'],true)
}
