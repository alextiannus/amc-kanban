import {withBrainstormBrowse} from '@/lib/ai-native/brainstorm-context'
import {brainstormSourceLink} from '@/lib/ai-native/brainstorm'
import {nativeHttp} from '@/lib/ai-native/http'

export const dynamic='force-dynamic'

export async function GET(request:Request,context:{params:Promise<{id:string;sourceId:string}>}){
 const {id,sourceId}=await context.params,q=new URL(request.url).searchParams
 return nativeHttp(request,userId=>withBrainstormBrowse(userId,id,q.get('browseSessionId'),()=>brainstormSourceLink(userId,id,sourceId,{creativeId:q.get('creativeId'),sourceDigest:q.get('sourceDigest')})))
}
