import {nativeHttp} from '@/lib/ai-native/http'
import {readCalendarMatching,requestCalendarMatching} from '@/lib/ai-native/calendar-planning'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,userId=>readCalendarMatching(userId,id,new URL(request.url).searchParams.get('month')||''))}
export async function POST(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,(userId,body)=>requestCalendarMatching(userId,id,body))}
