import {nativeHttp} from '@/lib/ai-native/http'
import {adoptNativePlanningDraft} from '@/lib/ai-native/service'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string;taskId:string}>}
export async function POST(request:Request,context:Context){const {id,taskId}=await context.params;return nativeHttp(request,userId=>adoptNativePlanningDraft(userId,id,taskId),2000)}
