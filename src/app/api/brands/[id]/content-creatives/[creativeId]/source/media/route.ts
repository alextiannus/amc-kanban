import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { readCreativeSourceMedia } from '@/lib/brand-plan/creativeSourceMedia'
import { CreativeRevisionError } from '@/lib/brand-plan/creativeRevisionContract'

export const dynamic='force-dynamic'
const json=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}})
export async function GET(request:Request,context:{params:Promise<{id:string;creativeId:string}>}) {
  try {
    const auth=await resolveSessionOrApiKey(request)
    if(!auth)return json('Unauthorized',401)
    const {id,creativeId}=await context.params
    return await readCreativeSourceMedia(auth.user,id,new URL(request.url).searchParams.get('month')||'',creativeId,request.signal)
  } catch(error) {
    if(error instanceof CreativeRevisionError)return json(error.code,error.status)
    return json('creative_source_media_unavailable',502)
  }
}
