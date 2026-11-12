import {nativeHttp} from '@/lib/ai-native/http'
import {searchCreativeLibrary,addCreativeLibrary} from '@/lib/creative-library'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){
  const {id}=await context.params,query=new URL(request.url).searchParams
  return nativeHttp(request,userId=>searchCreativeLibrary(userId,id,query.get('q')||'',Number(query.get('page')||1)))
}
export async function POST(request:Request,context:Context){
  const {id}=await context.params
  return nativeHttp(request,(userId,body)=>addCreativeLibrary(userId,id,body))
}
