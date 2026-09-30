import { nativeHttp } from '@/lib/ai-native/http'
import { autopilotSettings } from '@/lib/ai-native/autopilot-store'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,userId=>autopilotSettings(userId,id))}
export async function POST(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,(userId,body)=>autopilotSettings(userId,id,body))}
