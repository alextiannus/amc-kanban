import {nativeHttp} from '@/lib/ai-native/http'
import {submitBugReport} from '@/lib/platform-ai/bug-reports'
export const dynamic='force-dynamic'
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params
  return nativeHttp(request,(userId,body)=>submitBugReport(userId,id,body),100000)
}
