import {nativeHttp} from '@/lib/ai-native/http'
import {loadMoreBrainstorm,copyBrainstorm,listBrainstorm,refreshBrainstorm,decideBrainstorm,replicateBrainstorm,dismissCalendarCreative,decideSavedBrainstorm} from '@/lib/ai-native/brainstorm'
import {nativeError} from '@/lib/ai-native/contract'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,userId=>listBrainstorm(userId,id,undefined,new URL(request.url).searchParams.get('view')==='first'))}
export async function POST(request:Request,context:Context){
 const {id}=await context.params
 return nativeHttp(request,(userId,body)=>!body||typeof body!=='object'||Array.isArray(body)?Promise.reject(nativeError('invalid_brainstorm_request',400)):body.action==='loadMore'?loadMoreBrainstorm(userId,id,body):body.action==='copy'?copyBrainstorm(userId,id,body):body.action==='refresh'?refreshBrainstorm(userId,id,body):body.action==='decide'?decideBrainstorm(userId,id,body):body.action==='decideSaved'?decideSavedBrainstorm(userId,id,body):body.action==='dismiss'?dismissCalendarCreative(userId,id,body):body.action==='replicate'?replicateBrainstorm(userId,id,body):Promise.reject(nativeError('invalid_brainstorm_request',400)))
}
