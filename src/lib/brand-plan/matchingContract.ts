import {creativeDigest, record} from './creativeRevisionContract'
export const MATCH_REQUEST_KIND='CREATIVE_MATCH_REQUEST'
export const MATCH_SHORTFALL_MESSAGE='暂未找到更多满足策划要求的创意，已保留排期空档。系统将在每天夜间继续匹配，符合要求后自动补充，供你审核。'
export type PlanSlot={id:string;date:string;platform:string}
export function planningSnapshot(workspace:any){return {annualPlan:workspace.annualPlan||null,quarterlyPlans:workspace.quarterlyPlans||[]}}
export function planningHash(workspace:any){return creativeDigest(planningSnapshot(workspace))}
export function localPlanningTime(timezone:string|undefined,now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now)
 const get=(key:string)=>parts.find(p=>p.type===key)!.value
 return {day:`${get('year')}-${get('month')}-${get('day')}`,night:Number(get('hour'))>=1&&Number(get('hour'))<6}
}
const platformSlug=(item:any)=>String(item.platformSlug||item.platform||'').toLowerCase().replace('google business','google_business').replace('小红书','xiaohongshu')
export function openSlots(slots:PlanSlot[],items:any[],today:string){
 const remaining=[...slots]
 for(const item of items){
  if(['archived','deleted','归档','已删除'].includes(item.status))continue
  // Stable slot identity survives a subsequent human date/platform edit.
  let at=remaining.findIndex(slot=>slot.id===item.planningRequest?.slotId)
  if(at<0)at=remaining.findIndex(slot=>slot.platform===platformSlug(item)&&slot.date===item.date)
  if(at<0)at=remaining.findIndex(slot=>slot.platform===platformSlug(item))
  if(at>=0)remaining.splice(at,1)
 }
 return {pending:remaining.filter(slot=>slot.date>=today),expired:remaining.filter(slot=>slot.date<today),filled:slots.length-remaining.length}
}
export function requestView(row:any,workspace:any,today:string){
 if(!row)return null
 const input=record(row.input),state=record(row.output),slots=openSlots(input.slots||[],workspace.publishingCalendar?.months?.[row.period]||[],today)
 const stale=input.planHash!==planningHash(workspace)
 return {id:row.id,month:row.period,target:input.slots.length,...slots,status:stale?'plan_changed':!slots.pending.length?(slots.expired.length?'expired':'complete'):state.status||'queued',lastRun:state.run||null,message:!stale&&state.status==='matched'&&slots.pending.length?MATCH_SHORTFALL_MESSAGE:null,error:state.error||null}
}

export function planningBrief(workspace:any,month:string){
 const annual=record(workspace.annualPlan),quarter=`Q${Math.ceil(Number(month.slice(5))/3)}`
 const applies=(value:any)=>value.startMonth&&value.endMonth?value.startMonth<=month&&value.endMonth>=month:(!value.year||String(value.year)===month.slice(0,4))&&String(value.quarter||'').includes(quarter)
 const quarters=[...(workspace.quarterlyPlans||[]),...(annual.quarterlyPlans||[])].filter(applies).map(value=>({...value,monthlyFocus:(value.monthlyFocus||[]).filter((focus:any)=>focus.month===month||focus.month===month.slice(5)||focus.month===String(Number(month.slice(5))))}))
 return {month,goal:annual.goal,theme:annual.theme,strategy:annual.strategy,strategyPrinciples:annual.strategyPrinciples,contentPillars:annual.contentPillars,platformStrategy:annual.platformStrategy,quarterlyFocus:(annual.quarterlyFocus||[]).filter(applies),quarters}
}
