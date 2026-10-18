import {actorFor,nativeError} from '../ai-native/contract'
import {getNativeHost,controlNativeTask} from '../ai-native/service'
/** An explicit retry may replace only a stopped, side-effect-free interview draft.
 * Old usage reservations and artifacts remain intact. The new task uses normal allowance checks.
 */
export async function prepareInterviewRetry(userId:string,brandId:string,taskId:string,status:string){
 const {app}=await getNativeHost(true,'conversation'),actor=actorFor(brandId,userId)
 const store=app.tasks as unknown as {history:(actor:unknown,id:string)=>Promise<{calls:Array<{capability:string;status:string}>}>}
 const history=await store.history(actor,taskId)
 if(history.calls.some(c=>!['amc.context','my_write_workspace'].includes(c.capability)||!['succeeded','failed'].includes(c.status)))throw nativeError('interview_recovery_requires_review',409)
 if(status==='waiting')await controlNativeTask(userId,brandId,taskId,{action:'cancel',requestKey:`interview-recovery-${taskId}`})
}
