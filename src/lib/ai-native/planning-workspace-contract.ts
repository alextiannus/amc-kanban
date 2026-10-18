import {createHash} from 'node:crypto'
export const PLANNING_STAGES=['insight','interview','focus','selling_points','annual','quarter','direction','marketing_plan','execution_checklist'] as const
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
 if(scope.stage==='execution_checklist'){
  validateExecutionChecklist(data)
 }else if(scope.stage==='marketing_plan'){
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
 const saved={...(scope.stage==='interview'?{attachmentIds:current.coCreation?.interview?.attachmentIds||[]}:{}),title:scope.stage==='interview'?'品牌定位':draft.title,content:draft.content,taskId,updatedAt:now,status:'active'}
 if(scope.stage==='execution_checklist'){
  next.executionChecklist=mergeExecutionChecklist(current.executionChecklist,draft.data,now,scope.startMonth)
  next.coCreation={...current.coCreation,execution_checklist:saved};return next
 }
 if(scope.stage==='marketing_plan'){
  saved.content=marketingPlanMarkdown(draft.data,!/[\u4e00-\u9fff]/.test(draft.title+draft.content))
  next.marketingPlan={...draft.data,content:saved.content,title:draft.title,planningStartMonth:scope.startMonth,taskId,status:'active',updatedAt:now,inputVersions:planningInputVersions(current)}
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
 const data=scope.stage==='execution_checklist'?{items:[{id:'stable-task-id',month:scope.startMonth,action:'每项只选一种通用行动：制定次月内容与发布计划（本月内提前完成）、组织本月内容制作（素材准备、精修剪辑）、安排本月内容发布、复盘本月Monthly Insight Report并确定下月调整、策划次月营销活动（计划）（每月含末月，在次月前排期）；独立活动用策划××活动（计划）；审核并入制作，禁忌在访谈确定；曝光执行仅商家确认安排及预算后列入',plannedTime:'计划日期或时段'}],informationToSupplement:[]}:scope.stage==='marketing_plan'?marketingPlanShape(scope.startMonth):scope.stage==='annual'?{goal:'年度目标，未知基线注明待确认',theme:'年度主线',strategyPrinciples:['策略原则'],contentPillars:['内容支柱'],metrics:['指标、口径与复盘频率'],platformStrategy:[{platform:'真实订阅平台',role:'平台分工',contentApproach:'内容方式',customerAction:'用户行动'}]}:scope.stage==='quarter'?{strategy:'季度策略',focus:'季度重点',campaigns:['拟议活动'],contentThemes:['内容主题'],promotionPoints:[{name:'有依据的卖点',rationale:'选择依据',targetAudience:'目标客群',customerAction:'用户行动',platforms:['真实平台'],suggestedMonthlyPosts:2}],monthlyFocus:planningMonths(scope.startMonth,scope.quarter).map(month=>({month,focus:'本月重点',promotionPoints:['卖点']}))}:undefined
 return {planningDraft:{scope,expectedRevision:'exact amc.context.planningContext.workspace.revision (or amc.marketing_workspace.revision on older hosts)',title:scope.stage==='quarter'?planningQuarterLabel(scope):'本阶段草案标题',content:scope.stage==='marketing_plan'?'草案摘要、输入来源和关键待确认项；完整方案放入 data，宿主据 data 生成完整可编辑正文，不要重复输出整篇方案':scope.stage==='execution_checklist'?'简短说明清单范围和来源；所有行动完整放入 data.items，不重复整份清单':'本阶段完整策划文字，区分已确认资料、建议和未知；与 data 一致',...(data?{data}: {})}}
}


export function annualPlanningMonths(start:string){return Array.from({length:4},(_,quarter)=>planningMonths(start,quarter)).flat()}
export function sixPlanningMonths(start:string){return [...planningMonths(start),...planningMonths(start,1)]}
export function marketingPlanShape(start:string){return {
 strategyFramework:{summary:['阶段目标、主客群、主推、内容、转化及本月重点的一页摘要'],diagnosis:['来源观察→优先瓶颈→应对；SWOT对应行动'],objectives:['目标优先级/依据/基线/指标/周期；未知基线如实说明'],audience:['主次客群/消费场景/动机/顾虑/所需证据'],products:['真实产品/角色/优先级/利益/证据/暂不主推理由'],content:['内容主题、目的、品牌专属创意、真实参考来源、所需素材、希望顾客采取的行动及表达限制'],channels:['实际平台、内容安排、顾客下一步行动、访问或下单方法及目前障碍'],exposure:['适用曝光手段/目的/预算与确认状态/测量；无确认不执行'],review:['Monthly Insight指标/来源与限制/继续调整停止条件/次月反馈']},strategyDirection:['基于品牌定位提出的营销主方向、客群与取舍'],informationToSupplement:['影响当前策划的缺失信息及补充理由；无明确缺口时返回空数组'],
 brandCharacteristics:['品牌特点、定位与客群'],coreSellingPoints:['有来源的核心卖点及表达场景'],
 swot:{strengths:['优势及依据'],weaknesses:['劣势及依据'],opportunities:['机会及依据'],threats:['威胁及依据']},
 annualCalendar:annualPlanningMonths(start).map(month=>({month,theme:'月度活动节点',campaign:'简述品牌适用活动方向与时间；活动详细策划作为独立工作，日期未经核实写待确认'})),
 monthlyPlans:sixPlanningMonths(start).map(month=>({month,goal:'本月目标',theme:'主题',activities:['本月活动名称、目的、时间与关键店内配合，简洁标注拟议或已确认；详细活动方案作为独立工作'],preparation:['本月应提前启动的后续月份活动准备，含目标活动月与最迟启动日；无则空数组'],channels:['实际渠道'],content:['内容安排'],resources:'简述必要资源边界，未知不展开逐项索取',measurement:'指标口径及复盘方式'})),
 inStoreActivities:['订阅准备阶段一次性安排店内关注与Google评论贴纸制作、摆放及扫码验证，未完成持续跟进；网络评价与下单转化通过Monthly Insight Report检验，不承担门店经营'],brandCreatives:['创意概念、品牌关联、渠道及执行条件']}}
export function validateMarketingPlan(d:any,start:string){
 const str=(x:any)=>typeof x==='string'&&!!x.trim()&&x.length<=4000
 const list=(x:any)=>Array.isArray(x)&&x.length>0&&x.length<=24&&x.every(str)
 if(!d||!['brandCharacteristics','coreSellingPoints','inStoreActivities','brandCreatives'].every(k=>list(d[k]))||!d.swot||!['strengths','weaknesses','opportunities','threats'].every(k=>list(d.swot[k])))return fail('incomplete_marketing_plan')
 if(!Array.isArray(d.annualCalendar)||d.annualCalendar.length!==12||d.annualCalendar.some((m:any,i:number)=>m?.month!==annualPlanningMonths(start)[i]||!str(m.theme)||!str(m.campaign)))return fail('invalid_annual_calendar')
 if(!Array.isArray(d.monthlyPlans)||d.monthlyPlans.length!==6||d.monthlyPlans.some((m:any,i:number)=>m?.month!==sixPlanningMonths(start)[i]||!['goal','theme','resources','measurement'].every(k=>str(m[k]))||!['activities','channels','content'].every(k=>list(m[k]))))return fail('invalid_six_month_plan')
 if(d.monthlyPlans.some((m:any)=>m.preparation!==undefined&&(!Array.isArray(m.preparation)||m.preparation.length>12||!m.preparation.every(str))))return fail('invalid_monthly_preparation')
 if(d.strategyDirection!==undefined&&!list(d.strategyDirection)||d.informationToSupplement!==undefined&&(!Array.isArray(d.informationToSupplement)||d.informationToSupplement.length>24||!d.informationToSupplement.every(str)))return fail('invalid_strategy_supplement')
 if(d.strategyFramework!==undefined&&(!d.strategyFramework||Array.isArray(d.strategyFramework)||!['summary','diagnosis','objectives','audience','products','content','channels','exposure','review'].every(key=>list(d.strategyFramework[key]))||Object.keys(d.strategyFramework).some(key=>!['summary','diagnosis','objectives','audience','products','content','channels','exposure','review'].includes(key))))return fail('invalid_strategy_framework')
 if(marketingPlanMarkdown(d).length>24000)return fail('marketing_plan_document_too_long')
 if(Object.keys(d).some(k=>!['brandCharacteristics','coreSellingPoints','swot','annualCalendar','monthlyPlans','inStoreActivities','brandCreatives','strategyDirection','informationToSupplement','strategyFramework'].includes(k)))return fail('unexpected_marketing_plan_field')
}
export function planningInputVersions(current:any){return {interview:planningRevision(current.coCreation?.interview||null),...(current.coCreation?.principal_strategy?{principalStrategy:planningRevision(current.coCreation.principal_strategy)}:{})}}
export function planningInputsMatch(recorded:any,current:any){
 const {direction,...active}=recorded||{}
 return planningRevision(active)===planningRevision(planningInputVersions(current))
}
/** Compatibility helper: planning steps are optional; review state is advisory. */
export function assertPlanningConfirmed(current:any){return planningReviewState(current)}

export function planningReviewState(current:any){
 const interview=current.coCreation?.interview,direction=current.coCreation?.direction,plan=current.marketingPlan
 const interviewConfirmed=interview?.status==='confirmed'
 const directionConfirmed=direction?.status==='confirmed'&&interviewConfirmed&&direction.inputVersions?.interview===planningRevision(interview)
 return {interviewConfirmed,directionConfirmed,planNeedsReview:!!plan&&!planningInputsMatch(plan.inputVersions,current)}
}

/** The editable document contains every validated section, never only the model's short reply. */
export function marketingPlanMarkdown(d:any,english=false){
 const label=(zh:string,en:string)=>english?en:zh
 const list=(items:string[])=>items.map(s=>`- ${s}`).join('\n')
 return [
  ...(['summary','diagnosis','objectives','audience','products','content','channels','exposure','review'] as const).flatMap(key=>{const names:Record<string,[string,string]>={summary:['策略摘要','Strategy brief'],diagnosis:['现状与核心问题','Diagnosis'],objectives:['阶段目标与优先级','Objectives'],audience:['客群与消费场景','Audience and occasions'],products:['产品优先级与卖点策略','Product priorities'],content:['内容主线与品牌表达','Content strategy'],channels:['平台分工与转化路径','Channels and conversion'],exposure:['曝光投入与预算条件','Exposure and budget'],review:['月度复盘与调整机制','Review and iteration']};return d.strategyFramework?.[key]?.length?[`## ${label(...names[key])}\n${list(d.strategyFramework[key])}`]:[]}),
  ...(d.strategyDirection?.length?[`## ${label('营销方向','Marketing direction')}\n${list(d.strategyDirection)}`]:[]),
  `## ${label('品牌特点与定位','Brand characteristics')}\n${list(d.brandCharacteristics)}`,
  `## ${label('核心卖点','Core selling points')}\n${list(d.coreSellingPoints)}`,
  '## SWOT\n'+[['strengths','优势','Strengths'],['weaknesses','劣势','Weaknesses'],['opportunities','机会','Opportunities'],['threats','威胁','Threats']].map(([key,zh,en])=>`### ${label(zh,en)}\n${list(d.swot[key])}`).join('\n\n'),
  `## ${label('全年活动节点与策划','Annual campaigns')}\n`+d.annualCalendar.map((m:any)=>`### ${m.month} · ${m.theme}\n${m.campaign}`).join('\n\n'),
  `## ${label('未来六个月营销策划','Next six months')}\n`+d.monthlyPlans.map((m:any)=>`### ${m.month} · ${m.theme}\n${m.goal}\n\n${label('活动','Activities')}\n${list(m.activities)}\n\n${label('后续月份准备','Preparation for later months')}\n${list(m.preparation||[])}\n\n${label('渠道','Channels')}\n${list(m.channels)}\n\n${label('内容','Content')}\n${list(m.content)}\n\n${label('资源与预算','Resources and budget')}\n${m.resources}\n\n${label('衡量与复盘','Measurement')}\n${m.measurement}`).join('\n\n'),
  `## ${label('店内经营配合','In-store operations')}\n${list(d.inStoreActivities)}`,
  `## ${label('品牌营销创意','Brand marketing ideas')}\n${list(d.brandCreatives)}`,
  `## ${label('期望补充信息','Information to supplement')}\n${d.informationToSupplement?.length?list(d.informationToSupplement):label('现有方案未列出明确补充项，可补充近期变化。','No explicit gaps are listed. Add recent changes if needed.')}`,
 ].join('\n\n')
}

/** Generated tasks cannot declare completion. Existing execution records are human-owned. */
export const FOLLOW_REVIEW_SETUP_ID='amc-follow-review-setup'
/** Generated work stays within AMC's contracted marketing scope. Historical records remain readable. */
export function assertAmcExecutionAction(action:string){
 if(/员工培训|物料铺设|备货|订单承接|配送履约|收银核销|商家回访|回访商家|门店陈列|店内.{0,6}(陈列|铺设)|收集.{0,16}(会员|复购|顾客反馈|客户反馈)|staff training|order fulfil|order fulfill|stock preparation|merchant visit|collect.{0,24}(repeat purchases|customer feedback)/i.test(action))fail('execution_task_outside_amc_scope')
}
export function assertAmcExecutionChecklist(data:any){validateExecutionChecklist(data);for(const item of data.items)assertAmcExecutionAction(item.action)}
export function validateExecutionChecklist(data:any){
 const text=(v:any,max:number)=>typeof v==='string'&&!!v.trim()&&v.length<=max
 if(!data||!Array.isArray(data.items)||data.items.length>120||!Array.isArray(data.informationToSupplement)||data.informationToSupplement.length>24||data.informationToSupplement.some((v:any)=>!text(v,2000))||Object.keys(data).some(k=>!['items','informationToSupplement'].includes(k)))return fail('invalid_execution_checklist')
 const ids=new Set<string>()
 for(const item of data.items){if(!item||!text(item.id,100)||!/^[a-zA-Z0-9_-]+$/.test(item.id)||ids.has(item.id)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(item.month||'')||!text(item.action,2000)||!text(item.plannedTime,200)||Object.keys(item).some(k=>!['id','month','action','plannedTime'].includes(k)))return fail('invalid_execution_task');ids.add(item.id)}
}
export function mergeExecutionChecklist(previous:any,data:any,now:string,startMonth?:string){
 validateExecutionChecklist(data)
 const active=Array.isArray(previous?.items)?previous.items:[],history=Array.isArray(previous?.retiredItems)?previous.retiredItems:[]
 const old=[...active,...history]
 const used=new Set<string>()
 const items=data.items.map((item:any)=>{
  const match=old.find((v:any)=>!used.has(v.id)&&v.id===item.id)||old.find((v:any)=>!used.has(v.id)&&v.action.trim()===item.action.trim()&&v.plannedTime===item.plannedTime)
  if(match){used.add(match.id);return {...item,id:match.id,completed:match.completed===true,completedAt:match.completedAt||null,completedBy:match.completedBy||null}}
  return {...item,completed:false,completedAt:null,completedBy:null}
 })
 // Subscription preparation is a single durable work item, never a recurring monthly task.
 const setup=old.find((v:any)=>v.id===FOLLOW_REVIEW_SETUP_ID)
 if(!items.some((v:any)=>v.id===FOLLOW_REVIEW_SETUP_ID)&&setup?.completed!==true&&(setup||startMonth)){
  items.unshift({id:FOLLOW_REVIEW_SETUP_ID,month:setup?.month||startMonth,action:'安排店内关注与Google评论贴纸制作、摆放及扫码验证',plannedTime:setup?.plannedTime||'订阅后的准备阶段',completed:false,completedAt:null,completedBy:null});used.add(FOLLOW_REVIEW_SETUP_ID)
 }
 // A replacement list must stay concise. Retired work retains human completion history.
 const retiredItems=old.filter((item:any)=>!used.has(item.id)&&!items.some((v:any)=>v.id===item.id)).map((item:any)=>({...item,retiredAt:item.retiredAt||now}))
 return {items,retiredItems,informationToSupplement:data.informationToSupplement,updatedAt:now}
}
