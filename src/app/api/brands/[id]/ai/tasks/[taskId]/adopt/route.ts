import { nativeHttp } from '@/lib/ai-native/http'
import { adoptNativeCandidate } from '@/lib/ai-native/service'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string;taskId:string}>}
export async function POST(request:Request,context:Context){const {id,taskId}=await context.params;return nativeHttp(request,(userId,body)=>adoptNativeCandidate(userId,id,taskId,body))}
