/** Presentation only, derived from authorized Core history; never a second task lifecycle. */
export function conversationProgress(status:string,calls:readonly {capability:string;status:string;result?:unknown}[],historyUnavailable=false){
  if(historyUnavailable)return {stage:'checking' as const}
  if(status==='succeeded')return {stage:'complete' as const}
  if(status!=='running')return {stage:status==='queued'?'queued' as const:'checking' as const}
  const completed=new Set(calls.filter(c=>c.status==='succeeded').map(c=>c.capability))
  return {stage:completed.has('my_write_workspace')?'finalizing' as const:(completed.has('amc.growth_insight')||calls.some(c=>c.capability==='amc.context'&&c.status==='succeeded'&&(c.result as any)?.planningContext?.insight))?'reply' as const:completed.has('amc.marketing_workspace')?'insight' as const:completed.has('amc.context')?'planning' as const:'context' as const}
}

/** Avoid copying the same catalog/portfolio and old Growth excerpt into every model turn.
 * The full unmodified facts still bind the artifact digest and its verification.
 */
export function conversationKnowledge(value:unknown,planning:boolean){
  const facts=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
  const {productCatalog,creativePortfolio,...base}=facts
  if(!base.knowledge||typeof base.knowledge!=='object'||Array.isArray(base.knowledge))return base
  const knowledge={...base.knowledge as Record<string,unknown>}
  // Only remove menu duplication when the canonical catalog actually exists.
  if(Array.isArray(productCatalog))delete knowledge.menuItems
  if(planning)delete knowledge.researchEvidence // authoritative Growth evidence is supplied separately
  return {...base,knowledge}
}

/** Use the latest actual source read, including the bundled context; old tasks stay readable. */
export function conversationInsight(calls:readonly {capability:string;status:string;result?:unknown}[]){
  for(const call of [...calls].reverse()){
    if(call.status!=='succeeded')continue
    if(call.capability==='amc.growth_insight')return call.result as {status?:string;reportVersionId?:string;partial?:boolean;generatedAt?:unknown}|undefined
    if(call.capability==='amc.context'&&(call.result as any)?.planningContext?.insight)return (call.result as any).planningContext.insight as {status?:string;reportVersionId?:string;partial?:boolean;generatedAt?:unknown}
  }
}

/** Presentation-only recovery for internal draft writes; never reconcile a call or its usage. */
export function planningWriteRecovery(intent:any,status:string,reason:string|undefined,calls:readonly {capability:string;status:string}[]){
 const reads=['amc.context','my_read_workspace','assistant.skills.read','amc.marketing_workspace','amc.growth_insight','amc.planning_budget']
 return intent?.kind==='conversation'&&intent.topic==='brand_planning'&&['marketing_plan','execution_checklist'].includes(intent.planningScope?.stage)&&status==='waiting'&&reason==='external_result'&&calls.some(c=>c.capability==='my_write_workspace'&&c.status==='unknown')&&calls.every(c=>['succeeded','failed','unknown'].includes(c.status)&&(c.capability==='my_write_workspace'||reads.includes(c.capability))&&(c.status!=='unknown'||c.capability==='my_write_workspace'))?'draft_write_unresolved':undefined
}
