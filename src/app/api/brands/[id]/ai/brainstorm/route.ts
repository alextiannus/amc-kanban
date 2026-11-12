import {withBrainstormBrowse} from '@/lib/ai-native/brainstorm-context'
import {nativeHttp} from '@/lib/ai-native/http'
import {continueBrainstorm,loadMoreBrainstorm,copyBrainstorm,listBrainstorm,refreshBrainstorm,decideBrainstorm,replicateBrainstorm,dismissCalendarCreative,decideSavedBrainstorm} from '@/lib/ai-native/brainstorm'
import {nativeError} from '@/lib/ai-native/contract'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){const {id}=await context.params,q=new URL(request.url).searchParams;return nativeHttp(request,userId=>withBrainstormBrowse(userId,id,q.get('browseSessionId'),()=>q.has('continueCreativeId')?continueBrainstorm(userId,id,q.get('continueCreativeId'),q.get('sourceId')):listBrainstorm(userId,id,undefined,q.get('view')==='first',q.get('after')||undefined,q.get('keywords')==='separate'),q.get('library')==='1'))}
export async function POST(request:Request,context:Context){
 const {id}=await context.params,q=new URL(request.url).searchParams
 return nativeHttp(request,(userId,body)=>withBrainstormBrowse(userId,id,q.get('browseSessionId'),()=>!body||typeof body!=='object'||Array.isArray(body)?Promise.reject(nativeError('invalid_brainstorm_request',400)):body.action==='loadMore'?loadMoreBrainstorm(userId,id,body):body.action==='copy'?copyBrainstorm(userId,id,body):body.action==='refresh'?refreshBrainstorm(userId,id,body):body.action==='decide'?decideBrainstorm(userId,id,body):body.action==='decideSaved'?decideSavedBrainstorm(userId,id,body):body.action==='dismiss'?dismissCalendarCreative(userId,id,body):body.action==='replicate'?replicateBrainstorm(userId,id,body):Promise.reject(nativeError('invalid_brainstorm_request',400)),q.get('library')==='1'))
}
