import { nativeHttp } from '@/lib/ai-native/http'
import { nativePreference } from '@/lib/ai-native/service'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,userId=>nativePreference(userId,id))}
export async function POST(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,(userId,body)=>nativePreference(userId,id,body))}
