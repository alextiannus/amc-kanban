import {nativeHttp} from '@/lib/ai-native/http'
import {readNativeTask} from '@/lib/ai-native/service'
import {readCreativeFeedbackSummary,recordCreativeCandidateDiscard} from '@/lib/brand-plan/creativeRevisions'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,userId=>readCreativeFeedbackSummary({id:userId,type:'HUMAN'},id,new URL(request.url).searchParams.get('cursor')))}
export async function POST(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,(userId,body)=>recordCreativeCandidateDiscard({id:userId,type:'HUMAN'},id,body,()=>readNativeTask(userId,id,body.taskId)),6000)}
