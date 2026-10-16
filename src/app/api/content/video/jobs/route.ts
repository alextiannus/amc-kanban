import { NextResponse } from 'next/server'
import type {Prisma} from '@prisma/client'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import {pinVideoEditor,editorForLibrary} from '@/lib/videoLineage'
import {requireActorPermission} from '@/lib/role-permissions/delegation'
import {allowedRoleWriteOrigin} from '@/lib/role-permissions/request-origin'
import {canUserAccessBrand} from '@/lib/user-management/brandAccess'
import {verifyVideoReceipt,videoReceiptDigest} from '@/lib/videoReceipt'

export const dynamic = 'force-dynamic'

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: authenticatedAgent.role }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

export async function GET(request: Request) {
  try {
    const actor = await getActor(request)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const id = text(url.searchParams.get('id'))
    const brandId = text(url.searchParams.get('brandId'))
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const job = await prisma.videoProductionJob.findFirst({
      where: { id, ...(brandId ? { brandId } : {}) },
    })
    if (!job) return NextResponse.json({ error: 'Video job not found' }, { status: 404 })

    const ok = await canSessionAccessBrandProject(job.brandId, actor.id, actor.type, actor.role)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ success: true, job: serializeJob(job) })
  } catch (err: any) {
    console.error('[VideoJobs] get failed:', err)
    return NextResponse.json({ error: err.message || 'Video job lookup failed' }, { status: statusFromError(err) })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActor(request)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if(!allowedRoleWriteOrigin(request))return NextResponse.json({error:'Forbidden'},{status:403})
    const raw=await request.text()
    if(Buffer.byteLength(raw,'utf8')>9*1024*1024)return NextResponse.json({error:'video_payload_too_large'},{status:413})
    const body = JSON.parse(raw)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const id = text(body.id)
    const brandId = text(body.brandId)
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

    const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const job=await prisma.$transaction(async (tx:Prisma.TransactionClient)=>{
    if(!await canUserAccessBrand(brandId,actor.id,'WRITE'))throw Object.assign(new Error('Not found'),{status:404})
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${brandId+':'+id}))`
    const existing = await tx.videoProductionJob.findUnique({
      where: { id },
      select: { id:true,brandId: true, createdBy:true, plan:true, creativeId:true,idea:true,assetIds:true,mediaUrls:true },
    })
    if (existing && existing.brandId !== brandId) {
      throw Object.assign(new Error('Not found'),{status:404})
    }
    await requireActorPermission(actor.id,'content.video-making.create',brandId)
    if(existing?.createdBy&&existing.createdBy!==actor.id)throw Object.assign(new Error('video_owner_required'),{status:403})
    const oldEditor=(existing?.plan as any)?._mmVideoJob?.editor
    const metadata=body.plan?._mmVideoJob||{}
    const oldMetadata=(existing?.plan as any)?._mmVideoJob||{}
    const projectId=text(body.plan?.basicVideoProjectId)||text(metadata.basicVideoProjectId)
    const oldProjectId=text((existing?.plan as any)?.basicVideoProjectId)||text(oldMetadata.basicVideoProjectId)
    if(oldProjectId&&projectId!==oldProjectId)throw Object.assign(new Error('video_project_immutable'),{status:409})
    if(projectId){
      const legacy=metadata.videoReceipt?.editorDigest===videoReceiptDigest(null)
      verifyVideoReceipt({receipt:metadata.videoReceipt,projectId,brandId,ownerId:actor.id,editor:legacy?null:metadata.editor,revisions:metadata.revisions||[],revisionsHasMore:Boolean(metadata.revisionsHasMore),existing:oldMetadata.videoReceipt})
      if(legacy&&metadata.editor?.creativeRevisionId)throw Object.assign(new Error('video_lineage_unverified'),{status:409})
      metadata.basicVideoProjectId=projectId
      metadata.revisionsCursor=metadata.videoReceipt.historyCursor||null
      body.plan={...body.plan,basicVideoProjectId:projectId,_mmVideoJob:metadata}
    }else{
      metadata.revisions=[]
      metadata.revisionsHasMore=false
      metadata.revisionsCursor=null
      delete metadata.videoReceipt
      body.plan={...body.plan,_mmVideoJob:metadata}
    }
    if(!metadata.editor&&body.creativeId&&!existing)throw Object.assign(new Error('video_lineage_required'),{status:409})
    if(existing&&(existing.creativeId||null)!==(body.creativeId||null))throw Object.assign(new Error('video_lineage_immutable'),{status:409})
    if(metadata.editor){
      const original=existing||(!metadata.editor.creativeRevisionId&&metadata.editor.originVideoJobId?await tx.videoProductionJob.findUnique({where:{id:metadata.editor.originVideoJobId}}):null)
      if(original&&(original.brandId!==brandId||original.createdBy!==actor.id))throw Object.assign(new Error('video_lineage_not_found'),{status:404})
      const originalEditor=(original?.plan as any)?._mmVideoJob?.editor
      const legacyExisting=original?.creativeId&&!originalEditor?.creativeRevisionId&&!metadata.editor.creativeRevisionId
        ?editorForLibrary(original,await tx.mediaAsset.findMany({where:{brandId,id:{in:original.assetIds||[]}},select:{id:true,url:true,mimeType:true,aiCaption:true}})):null
      if(legacyExisting&&!originalEditor?.assets)legacyExisting.assets=(original!.assetIds||[]).flatMap(id=>legacyExisting.assets.filter((asset:any)=>asset.id===id))
      metadata.editor=await pinVideoEditor(tx,brandId,metadata.editor,legacyExisting||oldEditor)
      if(!oldEditor){
        const ids=metadata.editor.assets.map((asset:any)=>asset.id)
        if(ids.some((id:any)=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Object.assign(new Error('invalid_video_assets'),{status:400})
        const trusted=await tx.mediaAsset.findMany({where:{brandId,id:{in:ids}},select:{id:true,url:true,mimeType:true,aiCaption:true}})
        if(trusted.length!==ids.length)throw Object.assign(new Error('video_asset_not_found'),{status:404})
        if(!projectId)metadata.editor.assets=ids.map((id:string)=>trusted.find(asset=>asset.id===id))
      }
      if(metadata.editor.creativeId!==(body.creativeId||null))throw Object.assign(new Error('video_lineage_immutable'),{status:409})
      if(projectId&&metadata.videoReceipt.editorDigest!==videoReceiptDigest(null))verifyVideoReceipt({receipt:metadata.videoReceipt,projectId,brandId,ownerId:actor.id,editor:metadata.editor,revisions:metadata.revisions||[],revisionsHasMore:Boolean(metadata.revisionsHasMore),existing:oldMetadata.videoReceipt})
      body.assetIds=metadata.editor.assets.map((asset:any)=>asset.id)
      body.mediaUrls=metadata.editor.assets.map((asset:any)=>asset.url)
      body.plan={...body.plan,_mmVideoJob:metadata}
    }else if(oldEditor){throw Object.assign(new Error('video_lineage_required'),{status:409})}

    return tx.videoProductionJob.upsert({
      where: { id },
      create: {
        id,
        brandId,
        creativeId: optionalText(body.creativeId),
        title: text(body.title) || '短视频制作',
        platform: text(body.platform) || 'tiktok',
        idea: text(body.idea) || '根据所选素材制作一条适合发布的短视频。',
        status: text(body.status) || 'generating',
        progress: numberValue(body.progress) ?? 0,
        thumbnailUrl: optionalText(body.thumbnailUrl),
        finalVideoUrl: optionalText(body.finalVideoUrl),
        narration: optionalText(body.narration),
        musicBrief: optionalText(body.musicBrief),
        creatorType: optionalText(body.creatorType),
        aspectRatio: optionalText(body.aspectRatio),
        assetIds: stringArray(body.assetIds),
        mediaUrls: stringArray(body.mediaUrls),
        scenes: jsonValue(body.scenes, []),
        plan: jsonOrNull(body.plan),
        sceneExecutions: jsonOrNull(body.sceneExecutions),
        finalExecution: jsonOrNull(body.finalExecution),
        voiceoverState: voiceoverState(body),
        error: optionalText(body.error),
        createdBy: actor.id,
      },
      update: {
        creativeId: optionalText(body.creativeId),
        title: text(body.title) || '短视频制作',
        platform: text(body.platform) || 'tiktok',
        idea: text(body.idea) || '根据所选素材制作一条适合发布的短视频。',
        status: text(body.status) || 'generating',
        progress: numberValue(body.progress) ?? 0,
        thumbnailUrl: optionalText(body.thumbnailUrl),
        finalVideoUrl: optionalText(body.finalVideoUrl),
        narration: optionalText(body.narration),
        musicBrief: optionalText(body.musicBrief),
        creatorType: optionalText(body.creatorType),
        aspectRatio: optionalText(body.aspectRatio),
        assetIds: stringArray(body.assetIds),
        mediaUrls: stringArray(body.mediaUrls),
        scenes: jsonValue(body.scenes, []),
        plan: jsonOrNull(body.plan),
        sceneExecutions: jsonOrNull(body.sceneExecutions),
        finalExecution: jsonOrNull(body.finalExecution),
        voiceoverState: voiceoverState(body),
        error: optionalText(body.error),
      },
    })

    })
    return NextResponse.json({ success: true, job: serializeJob(job) })
  } catch (err: any) {
    console.error('[VideoJobs] save failed:', err)
    return NextResponse.json({ error: err.message || 'Video job save failed' }, { status: statusFromError(err) })
  }
}

function serializeJob(job: any) {
  return {
    createdBy:job.createdBy,
    ...(job.voiceoverState || {}),
    id: job.id,
    brandId: job.brandId,
    creativeId: job.creativeId,
    title: job.title,
    platform: job.platform,
    idea: job.idea,
    status: job.status,
    scenes: Array.isArray(job.scenes) ? job.scenes : [],
    finalVideoUrl: job.finalVideoUrl,
    thumbnailUrl: job.thumbnailUrl,
    narration: job.narration,
    musicBrief: job.musicBrief,
    progress: job.progress,
    error: job.error,
    plan: job.plan,
    creatorType: job.creatorType,
    aspectRatio: job.aspectRatio,
    assetIds: job.assetIds || [],
    mediaUrls: job.mediaUrls || [],
    sceneExecutions: job.sceneExecutions || {},
    finalExecution: job.finalExecution,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : job.createdAt,
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : job.updatedAt,
  }
}

function statusFromError(err: any) {
  if(err instanceof SyntaxError)return 400
  return typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500
}

function jsonOrNull(value: unknown) {
  return value && typeof value === 'object' ? value as any : null
}

function jsonValue(value: unknown, fallback: unknown) {
  return value && typeof value === 'object' ? value as any : fallback as any
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined
  }
  return undefined
}

function optionalText(value: unknown): string | null {
  const result = text(value)
  return result || null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => text(item)).filter(Boolean) : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function voiceoverState(body: any) {
  const fields = ['voiceSelection', 'voiceTaskId', 'awaitingVoiceover', 'voiceoverRequired', 'voiceoverVoiceId', 'brandVoiceProfileId', 'brandVoiceLabel', 'musicUrl', 'selectedMusicPrompt', 'script']
  return Object.fromEntries(fields.filter(key => body[key] !== undefined).map(key => [key, body[key]]))
}
