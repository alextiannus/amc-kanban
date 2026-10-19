import {nativeHttp} from '@/lib/ai-native/http'
import {strategyVersions} from '@/lib/ai-native/service'
export const dynamic='force-dynamic'
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;return nativeHttp(request,userId=>strategyVersions(userId,id))}
