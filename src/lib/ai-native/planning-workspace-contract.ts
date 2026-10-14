import {createHash} from 'node:crypto'
export const PLANNING_STAGES=['insight','interview','focus','selling_points','annual','quarter'] as const
export type PlanningScope={stage:typeof PLANNING_STAGES[number];mode:'discuss'|'draft';startMonth:string;quarter?:number}
export type PlanningDraft={scope:PlanningScope;expectedRevision:string;title:string;content:string;data?:Record<string,any>}
const fail=(code:string)=>{throw Object.assign(new Error(code),{code,statusCode:400})}
export function planningScope(value:any):PlanningScope{
 if(!value||!PLANNING_STAGES.includes(value.stage)||!['discuss','draft'].includes(value.mode)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value.startMonth))return fail('invalid_planning_scope')
 if(value.stage==='quarter'&&(!Number.isInteger(value.quarter)||value.quarter<0||value.quarter>3))return fail('invalid_planning_quarter')
 return {stage:value.stage,mode:value.mode,startMonth:value.startMonth,...(value.stage==='quarter'?{quarter:value.quarter}:{})}
}
export function planningMonths(start:string,quarter=0){const [y,m]=start.split('-').map(Number);return Array.from({length:3},(_,i)=>{const n=y*12+m-1+quarter*3+i;return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`})}
export function planningQuarterLabel(scope:PlanningScope){const range=planningMonths(scope.startMonth,scope.quarter);return `Q${scope.quarter!+1} · ${range[0]} – ${range[2]}`}
export function planningRevision(value:unknown):string{
 const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
 return createHash('sha256').update(JSON.stringify(canonical(value||{}))).digest('hex')
}
export function validatePlanningDraft(value:any,scope:PlanningScope):PlanningDraft{
 if(!value||scope.mode!=='draft'||JSON.stringify(planningScope(value.scope))!==JSON.stringify(planningScope(scope))||!/^[a-f0-9]{64}$/.test(value.expectedRevision))return fail('planning_draft_binding_mismatch')
 const str=(v:any,max=2500)=>typeof v==='string'&&!!v.trim()&&v.length<=max
 const strings=(v:any,max=16)=>Array.isArray(v)&&v.length<=max&&v.every(x=>str(x))
 if(!str(value.title,200)||!str(value.content,14000))return fail('invalid_planning_draft')
 const data=value.data
 if(scope.stage==='annual'){
  if(!data||!str(data.goal)||!str(data.theme)||!strings(data.strategyPrinciples)||!strings(data.contentPillars)||!strings(data.metrics)||!Array.isArray(data.platformStrategy)||data.platformStrategy.length>12||data.platformStrategy.some((p:any)=>!p||!['platform','role','contentApproach','customerAction'].every(k=>str(p[k])))||Object.keys(data).some(k=>!['goal','theme','strategyPrinciples','contentPillars','metrics','platformStrategy'].includes(k)))return fail('invalid_annual_draft')
 }else if(scope.stage==='quarter'){
  if(!value.title.startsWith(planningQuarterLabel(scope)))return fail('planning_quarter_title_mismatch')
  const months=planningMonths(scope.startMonth,scope.quarter)
  if(!data||!str(data.strategy)||!str(data.focus)||!strings(data.campaigns)||!strings(data.contentThemes)||!Array.isArray(data.promotionPoints)||data.promotionPoints.length>8||data.promotionPoints.some((p:any)=>!p||!['name','rationale','targetAudience','customerAction'].every(k=>str(p[k]))||!strings(p.platforms)||!Number.isInteger(p.suggestedMonthlyPosts)||p.suggestedMonthlyPosts<0||p.suggestedMonthlyPosts>100)||!Array.isArray(data.monthlyFocus)||data.monthlyFocus.length!==3||data.monthlyFocus.some((m:any,i:number)=>m?.month!==months[i]||!str(m.focus)||!strings(m.promotionPoints))||Object.keys(data).some(k=>!['strategy','focus','campaigns','contentThemes','promotionPoints','monthlyFocus'].includes(k)))return fail('invalid_quarter_draft')
 }else if(data!==undefined)return fail('unexpected_planning_data')
 return {scope,expectedRevision:value.expectedRevision,title:value.title,content:value.content,...(data?{data}: {})}
}
export function mergePlanningDraft(current:any,draft:PlanningDraft,taskId:string){
 const scope=draft.scope,now=new Date().toISOString(),next={...current}
 const saved={title:draft.title,content:draft.content,taskId,updatedAt:now}
 if(!['annual','quarter'].includes(scope.stage)){next.coCreation={...current.coCreation,[scope.stage]:saved};return next}
 const annual=current.annualPlan||{},existingStart=annual.planningStartMonth||annual.quarterlyPlans?.[0]?.startMonth||annual.quarterlyFocus?.[0]?.startMonth
 if(existingStart&&existingStart!==scope.startMonth&&(annual.quarterlyPlans?.length||annual.quarterlyFocus?.length))return fail('planning_period_conflict')
 if(scope.stage==='annual')next.annualPlan={...annual,...draft.data,planningStartMonth:scope.startMonth,generatedAt:now,generationMode:'LLM',sourceTaskId:taskId}
 else{
  const months=planningMonths(scope.startMonth,scope.quarter)
  // Legacy plans use calendar-quarter labels. Match the exact period first;
  // Q1-Q4 labels alone can point at another period in a rolling year.
  const at=(items:any[])=>{const list=Array.isArray(items)?items:[];const index=list.findIndex(v=>v?.startMonth===months[0]);return index>=0?index:list.findIndex((v,i)=>!v?.startMonth&&i===scope.quarter)}
  const existing=annual.quarterlyPlans?.[at(annual.quarterlyPlans)]||annual.quarterlyFocus?.[at(annual.quarterlyFocus)]
  const quarter=existing?.quarter||`Q${Math.floor((Number(months[0].slice(5))-1)/3)+1}`
  const q:Record<string,any>={...draft.data,quarter,year:Number(months[0].slice(0,4)),startMonth:months[0],endMonth:months[2],periodLabel:`${months[0]} 至 ${months[2]}`,sourceTaskId:taskId}
  const replace=(items:any[],item:any)=>{const list=Array.isArray(items)?items:[],index=at(list),next=index>=0?list.map((v,i)=>i===index?item:v):[...list,item];return next.every(v=>v.startMonth)?next.sort((a,b)=>a.startMonth.localeCompare(b.startMonth)):next}
  next.annualPlan={...annual,planningStartMonth:scope.startMonth,generatedAt:now,generationMode:'LLM',quarterlyPlans:replace(annual.quarterlyPlans,q),quarterlyFocus:replace(annual.quarterlyFocus,{quarter,focus:q.focus,campaigns:q.campaigns,startMonth:q.startMonth,endMonth:q.endMonth,periodLabel:q.periodLabel})}
 }
 // Mixed human-adopted revisions must not inherit a previous generator's model identity.
 delete next.annualPlan.llmProvider;delete next.annualPlan.llmModel;delete next.annualPlan.llmError
 next.annualPlan.lastModifiedByTaskId=taskId
 next.coCreation={...current.coCreation,[scope.stage==='quarter'?`quarter_${scope.quarter}`:'annual']:saved}
 return next
}
export function planningDraftContract(scope:PlanningScope){
 if(scope.mode!=='draft')return {}
 const data=scope.stage==='annual'?{goal:'年度目标，未知基线注明待确认',theme:'年度主线',strategyPrinciples:['策略原则'],contentPillars:['内容支柱'],metrics:['指标、口径与复盘频率'],platformStrategy:[{platform:'真实订阅平台',role:'平台分工',contentApproach:'内容方式',customerAction:'用户行动'}]}:scope.stage==='quarter'?{strategy:'季度策略',focus:'季度重点',campaigns:['拟议活动'],contentThemes:['内容主题'],promotionPoints:[{name:'有依据的卖点',rationale:'选择依据',targetAudience:'目标客群',customerAction:'用户行动',platforms:['真实平台'],suggestedMonthlyPosts:2}],monthlyFocus:planningMonths(scope.startMonth,scope.quarter).map(month=>({month,focus:'本月重点',promotionPoints:['卖点']}))}:undefined
 return {planningDraft:{scope,expectedRevision:'exact amc.context.planningContext.workspace.revision (or amc.marketing_workspace.revision on older hosts)',title:scope.stage==='quarter'?planningQuarterLabel(scope):'本阶段草案标题',content:'本阶段完整策划文字，区分已确认资料、建议和未知；与 data 一致',...(data?{data}: {})}}
}
