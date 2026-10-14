import type {Application} from '@immedi/iaic-core/developer/templates/agent/app.mjs'
import type {NativeActor} from './contract'

/** Lifecycle-only polling never reads/revalidates sources or exposes a result.
 * Completed/paused/failed tasks use the existing full, authorized result path.
 */
export async function activeConversationStatus(app:Pick<Application,'runtime'>,actor:NativeActor,id:string,kind:string){
  if(kind!=='conversation')return null
  const state=await app.runtime.state(actor,id)
  if(!['queued','running'].includes(state.status))return null
  return {id:state.id,kind:'conversation',status:state.status,waitingReason:state.waiting_reason,goal:state.input.goal,version:state.version,updatedAt:state.updated_at,progress:{stage:state.status==='queued'?'queued':'working'}}
}

/** Wake the existing fenced executor; tick coalesces with any in-flight tick. */
export function wakeConversationWorker(app:Pick<Application,'runtime'>){
  void app.runtime.tick().catch(error=>console.error('[amc-ai] worker wake failed',error instanceof Error?error.name:'unknown'))
}
