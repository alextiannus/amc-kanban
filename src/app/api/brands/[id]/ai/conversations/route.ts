import {nativeHttp} from '@/lib/ai-native/http'
import {nativeConversations} from '@/lib/ai-native/service'
export const dynamic='force-dynamic'
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;return nativeHttp(request,userId=>nativeConversations(userId,id,new URL(request.url).searchParams.get('id')||undefined,new URL(request.url).searchParams.get('before')||undefined,new URL(request.url).searchParams.get('q')||undefined))}
