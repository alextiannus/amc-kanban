import {nativeHttp} from '@/lib/ai-native/http'
import {saveVideoToLibrary} from '@/lib/videoLibrary'
export const dynamic='force-dynamic'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params
 return nativeHttp(request,(userId,body)=>saveVideoToLibrary(userId,id,body))
}
