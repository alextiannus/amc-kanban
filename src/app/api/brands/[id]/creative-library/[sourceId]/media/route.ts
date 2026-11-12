import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {creativeLibraryMedia} from '@/lib/creative-library'
export const dynamic='force-dynamic'
export async function GET(request:Request,context:{params:Promise<{id:string;sourceId:string}>}){
  try{
    const auth=await resolveSessionOrApiKey(request)
    if(!auth)return Response.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}})
    const {id,sourceId}=await context.params
    return await creativeLibraryMedia(auth.user.id,id,sourceId,new URL(request.url).searchParams,request)
  }catch(error){const e=error as {status?:number;statusCode?:number;code?:string};return Response.json({error:e.code||'creative_source_media_unavailable'},{status:e.statusCode||e.status||503,headers:{'Cache-Control':'no-store'}})}
}
