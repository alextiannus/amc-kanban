import {creativeDigest, record} from './creativeRevisionContract'
export const MATCH_REQUEST_KIND='CREATIVE_MATCH_REQUEST'
export const MATCH_SHORTFALL_MESSAGE='暂未找到更多满足策划要求的创意。系统将在每天夜间继续匹配，找到后加入内容创意供你审核。'
export type CreativeTarget={id:string;platform:string}
export function planningSnapshot(workspace:any){return {annualPlan:workspace.annualPlan||null,quarterlyPlans:workspace.quarterlyPlans||[]}}
export function planningHash(workspace:any){return creativeDigest(planningSnapshot(workspace))}
export function localPlanningTime(timezone:string|undefined,now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now)
 const get=(key:string)=>parts.find(p=>p.type===key)!.value
 return {day:`${get('year')}-${get('month')}-${get('day')}`,night:Number(get('hour'))>=1&&Number(get('hour'))<6}
}
export function requestTargets(input:Record<string,any>):CreativeTarget[]{
 const source=Array.isArray(input.targets)?input.targets:Array.isArray(input.slots)?input.slots:[]
 return source.filter((target:any)=>target&&typeof target.id==='string'&&typeof target.platform==='string').map((target:any)=>({id:target.id,platform:target.platform}))
}
export function openTargets(targets:CreativeTarget[],items:any[]):CreativeTarget[]{
 const active=items.filter(item=>!['archived','deleted','归档','已删除'].includes(item?.status)&&item?.planningRequest&&(item.planningRequest.targetId||item.planningRequest.slotId))
 const occupied=new Set<string>(),matched=new Set<any>()
 // Preserve exact bindings first; an older request must not displace a newer receipt.
 for(const item of active){const id=item.planningRequest.targetId||item.planningRequest.slotId;if(targets.some(target=>target.id===id)&&!occupied.has(id)){occupied.add(id);matched.add(item)}}
 for(const item of active){
  if(matched.has(item))continue
  const binding=item.planningRequest,id=binding.targetId||binding.slotId
  const platform=typeof binding.platform==='string'?binding.platform:targets.find(target=>id.endsWith(`-${target.platform}`))?.platform||(Array.isArray(item.platformTargets)&&item.platformTargets.length===1?item.platformTargets[0]:undefined)
  const target=targets.find(target=>target.platform===platform&&!occupied.has(target.id))
  if(target)occupied.add(target.id)
 }
 return targets.filter(target=>!occupied.has(target.id))
}
export function requestView(row:any,workspace:any,_today?:string){
 if(!row)return null
 const input=record(row.input),state=record(row.output),targets=requestTargets(input),pending=openTargets(targets,workspace.publishingCalendar?.months?.[row.period]||[])
 const stale=input.planHash!==planningHash(workspace)
 return {id:row.id,month:row.period,target:input.targetCount||targets.length,platformTargets:input.platformTargets||[],filled:targets.length-pending.length,pending,expired:[],status:stale?'plan_changed':!pending.length?'complete':state.status||'queued',lastRun:state.run||null,message:!stale&&state.status==='matched'&&pending.length?MATCH_SHORTFALL_MESSAGE:null,error:state.error||null}
}

export function planningBrief(workspace:any,month:string){
 const annual=record(workspace.annualPlan),quarter=`Q${Math.ceil(Number(month.slice(5))/3)}`
 const applies=(value:any)=>value.startMonth&&value.endMonth?value.startMonth<=month&&value.endMonth>=month:(!value.year||String(value.year)===month.slice(0,4))&&String(value.quarter||'').includes(quarter)
 const quarters=[...(workspace.quarterlyPlans||[]),...(annual.quarterlyPlans||[])].filter(applies).map(value=>({...value,monthlyFocus:(value.monthlyFocus||[]).filter((focus:any)=>focus.month===month||focus.month===month.slice(5)||focus.month===String(Number(month.slice(5))))}))
 return {month,goal:annual.goal,theme:annual.theme,strategy:annual.strategy,strategyPrinciples:annual.strategyPrinciples,contentPillars:annual.contentPillars,platformStrategy:annual.platformStrategy,quarterlyFocus:(annual.quarterlyFocus||[]).filter(applies),quarters}
}
