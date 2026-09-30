import {nativeHttp} from '@/lib/ai-native/http'
import {readIdeaPool} from '@/lib/ai-native/idea-pool'
export const dynamic='force-dynamic'
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params
  return nativeHttp(request,userId=>readIdeaPool(userId,id))
}
