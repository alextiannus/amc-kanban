import {createHash} from 'node:crypto'
export const PLANNING_STAGES=['insight','interview','focus','selling_points','annual','quarter','direction','marketing_plan'] as const
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
 if(scope.stage==='marketing_plan'){
  validateMarketingPlan(data,scope.startMonth)
 }else if(scope.stage==='annual'){
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
 const saved={...(scope.stage==='interview'?{attachmentIds:current.coCreation?.interview?.attachmentIds||[]}:{}),title:scope.stage==='interview'?'品牌定位':draft.title,content:draft.content,taskId,updatedAt:now,status:'draft'}
 if(scope.stage==='marketing_plan'){
  assertPlanningConfirmed(current)
  saved.content=marketingPlanMarkdown(draft.data,!/[\u4e00-\u9fff]/.test(draft.title+draft.content))
  next.marketingPlan={...draft.data,content:saved.content,title:draft.title,planningStartMonth:scope.startMonth,taskId,status:'draft',updatedAt:now,inputVersions:planningInputVersions(current)}
  next.coCreation={...current.coCreation,marketing_plan:saved};return next
 }
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
 const data=scope.stage==='marketing_plan'?marketingPlanShape(scope.startMonth):scope.stage==='annual'?{goal:'年度目标，未知基线注明待确认',theme:'年度主线',strategyPrinciples:['策略原则'],contentPillars:['内容支柱'],metrics:['指标、口径与复盘频率'],platformStrategy:[{platform:'真实订阅平台',role:'平台分工',contentApproach:'内容方式',customerAction:'用户行动'}]}:scope.stage==='quarter'?{strategy:'季度策略',focus:'季度重点',campaigns:['拟议活动'],contentThemes:['内容主题'],promotionPoints:[{name:'有依据的卖点',rationale:'选择依据',targetAudience:'目标客群',customerAction:'用户行动',platforms:['真实平台'],suggestedMonthlyPosts:2}],monthlyFocus:planningMonths(scope.startMonth,scope.quarter).map(month=>({month,focus:'本月重点',promotionPoints:['卖点']}))}:undefined
 return {planningDraft:{scope,expectedRevision:'exact amc.context.planningContext.workspace.revision (or amc.marketing_workspace.revision on older hosts)',title:scope.stage==='quarter'?planningQuarterLabel(scope):'本阶段草案标题',content:'本阶段完整策划文字，区分已确认资料、建议和未知；与 data 一致',...(data?{data}: {})}}
}


export function sixPlanningMonths(start:string){return [...planningMonths(start),...planningMonths(start,1)]}
export function marketingPlanShape(start:string){return {
 brandCharacteristics:['品牌特点、定位与客群'],coreSellingPoints:['有来源的核心卖点及表达场景'],
 swot:{strengths:['优势及依据'],weaknesses:['劣势及依据'],opportunities:['机会及依据'],threats:['威胁及依据']},
 annualCalendar:Array.from({length:12},(_,i)=>({month:`${start.slice(0,4)}-${String(i+1).padStart(2,'0')}`,theme:'年度节点主题',campaign:'拟议活动策划，日期未经核实写待确认'})),
 monthlyPlans:sixPlanningMonths(start).map(month=>({month,goal:'本月目标',theme:'主题',activities:['具体活动'],channels:['实际渠道'],content:['内容安排'],resources:'执行资源、预算与负责人角色，未知写待确认',measurement:'指标口径及复盘方式'})),
 inStoreActivities:['店内产品、陈列、话术、转化、会员与复购配合'],brandCreatives:['创意概念、品牌关联、渠道及执行条件']}}
export function validateMarketingPlan(d:any,start:string){
 const str=(x:any)=>typeof x==='string'&&!!x.trim()&&x.length<=4000
 const list=(x:any)=>Array.isArray(x)&&x.length>0&&x.length<=24&&x.every(str)
 if(!d||!['brandCharacteristics','coreSellingPoints','inStoreActivities','brandCreatives'].every(k=>list(d[k]))||!d.swot||!['strengths','weaknesses','opportunities','threats'].every(k=>list(d.swot[k])))return fail('incomplete_marketing_plan')
 if(!Array.isArray(d.annualCalendar)||d.annualCalendar.length!==12||d.annualCalendar.some((m:any,i:number)=>m?.month!==`${start.slice(0,4)}-${String(i+1).padStart(2,'0')}`||!str(m.theme)||!str(m.campaign)))return fail('invalid_annual_calendar')
 if(!Array.isArray(d.monthlyPlans)||d.monthlyPlans.length!==6||d.monthlyPlans.some((m:any,i:number)=>m?.month!==sixPlanningMonths(start)[i]||!['goal','theme','resources','measurement'].every(k=>str(m[k]))||!['activities','channels','content'].every(k=>list(m[k]))))return fail('invalid_six_month_plan')
 if(marketingPlanMarkdown(d).length>24000)return fail('marketing_plan_document_too_long')
 if(Object.keys(d).some(k=>!['brandCharacteristics','coreSellingPoints','swot','annualCalendar','monthlyPlans','inStoreActivities','brandCreatives'].includes(k)))return fail('unexpected_marketing_plan_field')
}
export function planningInputVersions(current:any){return {interview:planningRevision(current.coCreation?.interview||null),direction:planningRevision(current.coCreation?.direction||null),...(current.coCreation?.principal_strategy?{principalStrategy:planningRevision(current.coCreation.principal_strategy)}:{})}}
export function assertPlanningConfirmed(current:any){
 const interview=current.coCreation?.interview,direction=current.coCreation?.direction
 if(interview?.status!=='confirmed'||direction?.status!=='confirmed'||direction.inputVersions?.interview!==planningRevision(interview))throw Object.assign(Error('planning_confirmation_required'),{statusCode:409})
}

export function planningReviewState(current:any){
 const interview=current.coCreation?.interview,direction=current.coCreation?.direction,plan=current.marketingPlan
 const interviewConfirmed=interview?.status==='confirmed'
 const directionConfirmed=direction?.status==='confirmed'&&interviewConfirmed&&direction.inputVersions?.interview===planningRevision(interview)
 return {interviewConfirmed,directionConfirmed,planNeedsReview:!!plan&&(!directionConfirmed||planningRevision(plan.inputVersions)!==planningRevision(planningInputVersions(current)))}
}

/** The editable document contains every validated section, never only the model's short reply. */
export function marketingPlanMarkdown(d:any,english=false){
 const label=(zh:string,en:string)=>english?en:zh
 const list=(items:string[])=>items.map(s=>`- ${s}`).join('\n')
 return [
  `## ${label('品牌特点与定位','Brand characteristics')}\n${list(d.brandCharacteristics)}`,
  `## ${label('核心卖点','Core selling points')}\n${list(d.coreSellingPoints)}`,
  '## SWOT\n'+[['strengths','优势','Strengths'],['weaknesses','劣势','Weaknesses'],['opportunities','机会','Opportunities'],['threats','威胁','Threats']].map(([key,zh,en])=>`### ${label(zh,en)}\n${list(d.swot[key])}`).join('\n\n'),
  `## ${label('全年活动节点与策划','Annual campaigns')}\n`+d.annualCalendar.map((m:any)=>`### ${m.month} · ${m.theme}\n${m.campaign}`).join('\n\n'),
  `## ${label('未来六个月营销策划','Next six months')}\n`+d.monthlyPlans.map((m:any)=>`### ${m.month} · ${m.theme}\n${m.goal}\n\n${label('活动','Activities')}\n${list(m.activities)}\n\n${label('渠道','Channels')}\n${list(m.channels)}\n\n${label('内容','Content')}\n${list(m.content)}\n\n${label('资源与预算','Resources and budget')}\n${m.resources}\n\n${label('衡量与复盘','Measurement')}\n${m.measurement}`).join('\n\n'),
  `## ${label('店内经营配合','In-store operations')}\n${list(d.inStoreActivities)}`,
  `## ${label('品牌营销创意','Brand marketing ideas')}\n${list(d.brandCreatives)}`,
 ].join('\n\n')
}
