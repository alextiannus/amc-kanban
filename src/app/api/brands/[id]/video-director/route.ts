import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { generateText } from '@/lib/gemini'
import fs from 'fs'
import path from 'path'

type Params = { params: Promise<{ id: string }> }

type Actor = {
  id: string
  type: string
  role: string
}

async function getActor(request: Request): Promise<Actor | null> {
  const apiKey = extractApiKey(request)
  if (apiKey) {
    const authenticatedAgent = await getAgentFromApiKey(apiKey)
    if (authenticatedAgent) {
      return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
    }
    return null
  }

  try {
    const session = await getSession()
    if (session?.user) {
      return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
    }
  } catch {
    // Ignore and proceed.
  }
  return null
}

function extToMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/jpeg'
}

function localPathFromPublicUrl(urlOrPath: string): string {
  const relative = urlOrPath.startsWith('/') ? urlOrPath.slice(1) : urlOrPath
  return path.join(process.cwd(), 'public', relative)
}

async function normalizeImageInput(urlOrPath: string, origin: string): Promise<string | null> {
  const trimmed = (urlOrPath || '').trim()
  if (!trimmed) return null

  if (trimmed.startsWith('/api/integrations/postfast/file/')) {
    const parts = trimmed.split('/')
    const s3Key = parts.slice(6).join('/')
    return `https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/${s3Key}`
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return trimmed
  }

  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/')) {
    const localFile = localPathFromPublicUrl(trimmed)
    if (!fs.existsSync(localFile)) return `${origin}${trimmed}`
    const buf = fs.readFileSync(localFile)
    const mime = extToMime(localFile)
    return `data:${mime};base64,${buf.toString('base64')}`
  }

  // Fallback: likely an object key.
  return `https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/${trimmed}`
}

async function buildEnhancedPrompt(input: {
  brandName?: string
  userPrompt: string
  creativeHooks?: string
  imageCount: number
}) {
  const { brandName, userPrompt, creativeHooks, imageCount } = input
  const basePrompt = [userPrompt.trim(), creativeHooks?.trim()].filter(Boolean).join('\n\n')

  const systemPrompt = `You are VideoDirector, an expert image-to-video prompt engineer.
Task: rewrite and enhance the user's instruction into one strong production-ready prompt for image-to-video.

Requirements:
- Keep original creative intent, scene, and brand tone.
- Mention cinematic direction: subject motion, camera motion, lighting, composition, pacing.
- Mention output constraints: no flicker, no warping, coherent character identity, coherent style.
- Keep it concise but vivid (about 70-160 words).
- Do not add markdown fences.
- Return plain text only.

Context:
- Brand: ${brandName || 'N/A'}
- Number of input images: ${imageCount}

User input:
${basePrompt}`

  try {
    const refined = (await generateText(systemPrompt, 500))?.trim()
    if (refined) return refined
  } catch (err) {
    console.warn('[VideoDirector] Prompt enhancement failed, using fallback prompt.', err)
  }

  return `${basePrompt}\n\nStyle constraints: smooth motion, cinematic camera movement, realistic lighting, stable identity, no flicker, no deformation.`
}

async function pollKieVideo(taskId: string, apiKey: string) {
  let retries = 20
  while (retries > 0) {
    await new Promise(resolve => setTimeout(resolve, 3000))
    const recordRes = await fetch(`https://api.kie.ai/api/v1/veo/record-info?taskId=${taskId}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    })

    const recordJson = await recordRes.json()
    if (recordJson.code === 200 && recordJson.data?.response?.resultUrls?.length > 0) {
      return recordJson.data.response.resultUrls[0] as string
    }
    if (recordJson.code !== 200 && recordJson.code !== 400 && recordJson.code !== 202) {
      throw new Error(`Error during polling Kie.ai task: code ${recordJson.code}`)
    }
    retries--
  }
  return ''
}

export async function POST(request: Request, { params }: Params) {
  const actor = await getActor(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params
  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const userPrompt = String(body.prompt || '').trim()
  const creativeHooks = String(body.creativeHooks || '').trim()
  const imageAssetIds = Array.isArray(body.imageAssetIds) ? body.imageAssetIds.filter(Boolean) : []
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter(Boolean) : []

  if (!userPrompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } })

  const assets = imageAssetIds.length > 0
    ? await prisma.mediaAsset.findMany({
        where: {
          id: { in: imageAssetIds },
          brandId,
        },
        select: { id: true, url: true, mimeType: true, filename: true, aiTags: true, aiCaption: true, aiCategory: true },
      })
    : []

  const assetImageUrls = assets
    .filter(a => a.mimeType?.startsWith('image/'))
    .map(a => a.url)

  const mergedImageUrls = Array.from(new Set([...imageUrls, ...assetImageUrls])).slice(0, 9)
  if (mergedImageUrls.length === 0) {
    return NextResponse.json({ error: 'At least one image is required for VideoDirector.' }, { status: 400 })
  }

  const origin = new URL(request.url).origin
  const normalizedImages = (
    await Promise.all(mergedImageUrls.map(u => normalizeImageInput(String(u), origin)))
  ).filter((v): v is string => Boolean(v))

  if (normalizedImages.length === 0) {
    return NextResponse.json({ error: 'No valid input images found.' }, { status: 400 })
  }

  const enhancedPrompt = await buildEnhancedPrompt({
    brandName: brand?.name,
    userPrompt,
    creativeHooks,
    imageCount: normalizedImages.length,
  })

  const apiKey = process.env.KIEAI_API_KEY
  let finalVideoUrl = ''

  if (!apiKey) {
    return NextResponse.json({ error: 'VideoDirector provider key is not configured.' }, { status: 500 })
  }

  const generateRes = await fetch('https://api.kie.ai/api/v1/veo/generate', {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    method: 'POST',
    body: JSON.stringify({
      prompt: enhancedPrompt,
      imageUrls: normalizedImages,
      model: 'veo3_fast',
      aspectRatio: '9:16',
    }),
  })

  const generateJson = await generateRes.json()
  if (generateJson.code !== 200 && generateJson.code !== 201) {
    return NextResponse.json({ error: generateJson.message || `Failed to create VideoDirector task (code ${generateJson.code})` }, { status: 502 })
  }

  const taskId = generateJson.data?.taskId
  if (!taskId) {
    return NextResponse.json({ error: 'No taskId returned from video provider.' }, { status: 502 })
  }

  finalVideoUrl = await pollKieVideo(taskId, apiKey)
  if (!finalVideoUrl) {
    return NextResponse.json({ error: 'Video generation timed out. Please retry.' }, { status: 504 })
  }

  const videoBuffer = await fetch(finalVideoUrl).then(res => res.arrayBuffer()).then(ab => Buffer.from(ab))
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'video-director')
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  const filename = `video-director-${Date.now()}.mp4`
  const outputPath = path.join(uploadDir, filename)
  fs.writeFileSync(outputPath, videoBuffer)
  const publicUrl = `/uploads/video-director/${filename}`

  const mergedTags = Array.from(new Set([
    ...assets.flatMap(a => a.aiTags || []),
    'AI视频',
    'VideoDirector',
  ]))

  const newAsset = await prisma.mediaAsset.create({
    data: {
      brandId,
      url: publicUrl,
      filename,
      mimeType: 'video/mp4',
      sizeBytes: videoBuffer.length,
      aiReady: true,
      aiCategory: assets[0]?.aiCategory || '素材库',
      aiTags: mergedTags,
      aiCaption: `VideoDirector 图生视频: ${enhancedPrompt}`,
      sourceType: 'video_director',
      uploadedBy: actor.id,
    },
  })

  return NextResponse.json({
    ok: true,
    asset: newAsset,
    enhancedPrompt,
    imageCount: normalizedImages.length,
  })
}
