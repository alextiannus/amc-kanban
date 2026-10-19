import {nativeHttp} from '@/lib/ai-native/http'
import {prepareVideoScript} from '@/lib/videoPreparation'
export const dynamic='force-dynamic'
export const maxDuration=120
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params
 return nativeHttp(request,(userId,body)=>prepareVideoScript(userId,id,body),40000)
}
