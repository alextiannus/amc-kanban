import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { overview } from '@/lib/model-management/registry'
import { validateSelection } from '@/lib/model-management/validation'
import { importLegacyModels } from '@/lib/model-management/migration'
import { saveDraft, saveModelVersion, publishDraft, readDraft } from '@/lib/model-management/draft'
export const maxDuration=300
async function admin(){const s=await getSession();return s?.user?.role==='ADMIN'?s.user:null}
export async function GET(){if(!await admin())return NextResponse.json({error:'Forbidden'},{status:403});try{return NextResponse.json(await overview(),{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Central model configuration unavailable; check migration and encryption key'},{status:503})}}
export async function POST(request:Request){
  const actor=await admin();if(!actor)return NextResponse.json({error:'Forbidden'},{status:403})
  try{
    const input=await request.json(),id=String(actor.id)
    if(input.action==='save-model')return NextResponse.json(await saveModelVersion(input.model,input.expectedRevision,id))
    if(input.action==='save-draft')return NextResponse.json(await saveDraft(input.selection,input.expectedRevision,id))
    if(input.action==='import')return NextResponse.json(await importLegacyModels(id,input.expectedRevision))
    if(input.action==='validate'){
      const draft=await readDraft()
      if(!draft||draft.revision!==input.expectedRevision)throw new Error('Draft changed; reload before validation')
      if(draft.initializationReport?.complete===false||(draft.baseVersion===null&&!draft.initializationReport?.complete))throw new Error('Initialize existing configuration and resolve its issues before validation')
      return NextResponse.json(await validateSelection(draft.configuration))
    }
    if(input.action==='publish')return NextResponse.json(await publishDraft(input.expectedRevision,input.validationId,id))
    return NextResponse.json({error:'Invalid operation'},{status:400})
  }catch(e){
    const message=e instanceof Error?e.message:'Central model operation failed'
    const safe=e&&typeof e==='object'&&('code' in e||'clientVersion' in e)||/prisma|queryRaw|executeRaw|cipher|authenticate data/i.test(message)
    return NextResponse.json({error:safe?'Central model operation failed; check the database migration and encryption key':message},{status:409})
  }
}
