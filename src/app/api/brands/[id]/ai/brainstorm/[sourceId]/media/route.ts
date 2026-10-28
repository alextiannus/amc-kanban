import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {brainstormVideo} from '@/lib/ai-native/brainstorm'
export const dynamic='force-dynamic'
export async function GET(request:Request,context:{params:Promise<{id:string;sourceId:string}>}){
 try{const auth=await resolveSessionOrApiKey(request);if(!auth)return Response.json({error:'Unauthorized'},{status:401});const {id,sourceId}=await context.params;return await brainstormVideo(auth.user.id,id,sourceId,request.signal,undefined,request.headers.get('range'),new URL(request.url).searchParams.get('kind')==='thumbnail')}
 catch(error){const e=error as {status?:number;statusCode?:number;code?:string};return Response.json({error:e.code||'creative_source_media_unavailable'},{status:e.statusCode||e.status||503,headers:{'Cache-Control':'no-store'}})}
}
