import type {Application} from '@immedi/iaic-core/developer/templates/agent/app.mjs'
import type {NativeActor} from './contract'
/** Authorized, receipt-only progress. Does not revalidate facts or expose tool inputs/results. */
export async function activeConversationStatus(app:Pick<Application,'runtime'|'tasks'>,actor:NativeActor,id:string,kind:string){
 if(kind!=='conversation')return null
 const state=await app.runtime.state(actor,id)
 if(!['queued','running'].includes(state.status))return null
 let stage=state.status==='queued'?'queued':'working'
 const store=app.tasks as {operationReceipts?:(actor:NativeActor,id:string)=>Promise<Array<{capability:string;status:string}>>}
 if(state.status==='running'&&store?.operationReceipts){
  const receipts=await store.operationReceipts(actor,id)
  const done=new Set(receipts.filter(r=>r.status==='succeeded').map(r=>r.capability))
  if(done.has('my_write_workspace'))stage='finalizing'
  else if(done.has('amc.context'))stage='reply'
 }
 return {id:state.id,kind:'conversation',status:state.status,waitingReason:state.waiting_reason,goal:state.input.goal,version:state.version,updatedAt:state.updated_at,progress:{stage}}
}
/** Wake the existing fenced executor; tick coalesces with any in-flight tick. */
export function wakeConversationWorker(app:Pick<Application,'runtime'>){
 void app.runtime.tick().catch(error=>console.error('[amc-ai] worker wake failed',error instanceof Error?error.name:'unknown'))
}
