import {nativeHttp} from '@/lib/ai-native/http'
import {readCreativeLibrary} from '@/lib/creative-library'
export const dynamic='force-dynamic'
export async function GET(request:Request,context:{params:Promise<{id:string;sourceId:string}>}){
  const {id,sourceId}=await context.params
  return nativeHttp(request,userId=>readCreativeLibrary(userId,id,sourceId))
}
