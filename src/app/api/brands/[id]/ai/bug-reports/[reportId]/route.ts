import {nativeHttp} from '@/lib/ai-native/http'
import {getBugReport} from '@/lib/platform-ai/bug-reports'
export const dynamic='force-dynamic'
export async function GET(request:Request,context:{params:Promise<{id:string;reportId:string}>}){
  const {id,reportId}=await context.params
  return nativeHttp(request,userId=>getBugReport(userId,id,reportId))
}
