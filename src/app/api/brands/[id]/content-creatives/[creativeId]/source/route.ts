import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { readCreativeSource } from '@/lib/brand-plan/creativeSource'
import { CreativeRevisionError } from '@/lib/brand-plan/creativeRevisionContract'

export const dynamic = 'force-dynamic'
const json = (value:unknown,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}})
export async function GET(request:Request,context:{params:Promise<{id:string;creativeId:string}>}) {
  try {
    const auth = await resolveSessionOrApiKey(request)
    if (!auth) return json({error:'Unauthorized'},401)
    const {id,creativeId} = await context.params
    return json(await readCreativeSource(auth.user,id,new URL(request.url).searchParams.get('month') || '',creativeId))
  } catch(error) {
    if (error instanceof CreativeRevisionError) return json({error:error.code},error.status)
    console.error('[creative-source] request failed',error instanceof Error?error.name:'unknown')
    return json({error:'creative_source_unavailable'},503)
  }
}
