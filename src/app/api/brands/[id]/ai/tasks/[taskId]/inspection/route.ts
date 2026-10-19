import {nativeHttp} from '@/lib/ai-native/http'
import {inspectNativeTask} from '@/lib/ai-native/service'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string;taskId:string}>}
export async function GET(request:Request,context:Context){const {id,taskId}=await context.params;return nativeHttp(request,userId=>inspectNativeTask(userId,id,taskId))}
