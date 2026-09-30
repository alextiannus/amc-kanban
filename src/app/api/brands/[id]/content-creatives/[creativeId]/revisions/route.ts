import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { allowedRoleWriteOrigin } from '@/lib/role-permissions/request-origin'
import { CreativeRevisionError, readCreativeRevisions, saveCreativeRevision } from '@/lib/brand-plan/creativeRevisions'

export const dynamic = 'force-dynamic'
type Context = {params: Promise<{id:string;creativeId:string}>}
const json = (body: unknown, status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}})
async function handle(request: Request, context: Context, write=false) {
  try {
    const auth = await resolveSessionOrApiKey(request)
    if (!auth) return json({error:'Unauthorized'},401)
    if (write && !allowedRoleWriteOrigin(request)) return json({error:'Forbidden'},403)
    const {id,creativeId} = await context.params
    const url = new URL(request.url)
    const month = url.searchParams.get('month') || ''
    if (write) {
      const raw = await request.text()
      if (raw.length > 100000) return json({error:'creative_payload_too_large'},413)
      let body: unknown
      try {body=JSON.parse(raw)} catch {return json({error:'invalid_json'},400)}
      return json(await saveCreativeRevision(auth.user,id,month,creativeId,body))
    }
    return json(await readCreativeRevisions(auth.user,id,month,creativeId,url.searchParams.get('revisionId') || undefined, undefined, url.searchParams.has('beforeVersion') ? Number(url.searchParams.get('beforeVersion')) : undefined))
  } catch(error) {
    if (error instanceof CreativeRevisionError) return json({error:error.code},error.status)
    console.error('[creative-revisions] request failed', error instanceof Error ? error.name : 'unknown')
    return json({error:'creative_revision_unavailable'},503)
  }
}
export const GET = (request: Request, context: Context) => handle(request,context)
export const POST = (request: Request, context: Context) => handle(request,context,true)
