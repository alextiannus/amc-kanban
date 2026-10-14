/** Presentation only, derived from authorized Core history; never a second task lifecycle. */
export function conversationProgress(status:string,calls:readonly {capability:string;status:string}[],historyUnavailable=false){
  if(historyUnavailable)return {stage:'checking' as const}
  if(status==='succeeded')return {stage:'complete' as const}
  if(status!=='running')return {stage:status==='queued'?'queued' as const:'checking' as const}
  const completed=new Set(calls.filter(c=>c.status==='succeeded').map(c=>c.capability))
  return {stage:completed.has('my_write_workspace')?'finalizing' as const:completed.has('amc.growth_insight')?'reply' as const:completed.has('amc.marketing_workspace')?'insight' as const:completed.has('amc.context')?'planning' as const:'context' as const}
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
  if(planning)delete knowledge.researchEvidence // authoritative Growth tool remains required
  return {...base,knowledge}
}
