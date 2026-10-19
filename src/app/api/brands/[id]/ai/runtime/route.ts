import {nativeHttp} from '@/lib/ai-native/http'
import {nativeAssistantRuntime} from '@/lib/ai-native/service'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,userId=>nativeAssistantRuntime(userId,id))}
