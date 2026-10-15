import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {readVideoLineage} from '@/lib/videoLineageAccess'
export async function GET(request:Request){
  try{
    const auth=await resolveSessionOrApiKey(request)
    if(!auth)return Response.json({error:'Unauthorized'},{status:401})
    const q=new URL(request.url).searchParams
    const editor=await readVideoLineage(auth.user.id,q.get('brandId')||'',{creativeId:q.get('creativeId'),creativeRevisionId:q.get('creativeRevisionId'),originVideoJobId:q.get('originVideoJobId'),script:'',assets:[]})
    return Response.json({editor},{headers:{'Cache-Control':'no-store'}})
  }catch(error:any){return Response.json({error:error.message},{status:error.status||503})}
}
