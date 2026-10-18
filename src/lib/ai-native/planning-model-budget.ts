/** Full structured plans need room for 12 calendar rows and six monthly plans. */
export const DEFAULT_NATIVE_OUTPUT_TOKENS=6000
export const FULL_PLANNING_OUTPUT_TOKENS=18000
export function fullPlanningScope(scope:any){return scope&&['marketing_plan','execution_checklist'].includes(scope.stage)}
export function nativeOutputTokens(full:boolean,limits:Record<string,number>={}){
 const ceiling=full?FULL_PLANNING_OUTPUT_TOKENS:DEFAULT_NATIVE_OUTPUT_TOKENS
 const configured=(full?limits.brand_planning:undefined)||limits.ai_native||limits.text||ceiling
 return Math.min(ceiling,configured)
}
