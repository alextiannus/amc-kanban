import { nativeHttp } from '@/lib/ai-native/http'
import { createNativeTask, listNativeTasks } from '@/lib/ai-native/service'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,userId=>listNativeTasks(userId,id,new URL(request.url).searchParams.get('cursor')||undefined))}
export async function POST(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,(userId,body)=>createNativeTask(userId,id,body))}
