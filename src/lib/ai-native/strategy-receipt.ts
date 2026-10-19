import {planningRevision} from './planning-workspace-contract'
/** Compare business sections, never timestamps, internal identity, or approval state. */
export const STRATEGY_SECTIONS=['strategyFramework','strategyDirection','brandCharacteristics','coreSellingPoints','swot','annualCalendar','monthlyPlans','inStoreActivities','brandCreatives','informationToSupplement'] as const
export function strategyChanges(before:any,after:any){
 const changed:string[]=STRATEGY_SECTIONS.filter(key=>planningRevision(before?.[key]??null)!==planningRevision(after?.[key]??null))
 if((before?.structuredDataStale||after?.structuredDataStale)&&before?.content!==after?.content)changed.push('content')
 return changed
}
