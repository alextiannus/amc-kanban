import {nativeHttp} from '@/lib/ai-native/http'
import {brandKeywordsForUser} from '@/lib/ai-native/brand-keywords'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){const {id}=await context.params;const query=new URL(request.url).searchParams;return nativeHttp(request,user=>brandKeywordsForUser(user,id,query.has('q')?{action:'catalog',q:query.get('q')}:{action:'read'}))}
export async function POST(request:Request,context:Context){const {id}=await context.params;return nativeHttp(request,(user,body)=>brandKeywordsForUser(user,id,{...body,action:'save'}))}
