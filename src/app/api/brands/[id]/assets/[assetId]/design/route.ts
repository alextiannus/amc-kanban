import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { generateText } from '@/lib/gemini'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

type Params = { params: Promise<{ id: string; assetId: string }> }

async function getActor(request: Request) {
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
  } catch (e) {
    // Ignore and proceed (e.g. cookies() called outside request scope)
  }
  return null
}

async function downloadToBuffer(urlOrPath: string): Promise<Buffer> {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    const res = await fetch(urlOrPath, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    if (!res.ok) {
      throw new Error(`Failed to download image from ${urlOrPath} (HTTP ${res.status})`)
    }
    return Buffer.from(await res.arrayBuffer())
  }

  // PostFast proxy URL -> redirect to S3 URL
  if (urlOrPath.startsWith('/api/integrations/postfast/file/')) {
    const parts = urlOrPath.split('/')
    const s3Key = parts.slice(6).join('/')
    const s3Url = `https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/${s3Key}`
    return downloadToBuffer(s3Url)
  }

  // Local relative paths
  if (urlOrPath.startsWith('/uploads/') || urlOrPath.startsWith('/')) {
    let relativePath = urlOrPath
    if (urlOrPath.startsWith('/')) {
      relativePath = urlOrPath.slice(1)
    }
    const resolvedPath = path.join(process.cwd(), 'public', relativePath)
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Local file not found at: ${resolvedPath}`)
    }
    return fs.readFileSync(resolvedPath)
  }

  // S3 Key fallback
  const s3Url = `https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/${urlOrPath}`
  return downloadToBuffer(s3Url)
}

export async function POST(request: Request, { params }: Params) {
  const actor = await getActor(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, assetId } = await params
  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const userPrompt = (body.prompt || '').trim()
  if (!userPrompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

  // 1. Fetch original asset
  const original = await prisma.mediaAsset.findFirst({
    where: { id: assetId, brandId }
  })
  if (!original) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  }

  if (original.mimeType.startsWith('video/')) {
    return NextResponse.json({ error: 'AI design operation only supports images' }, { status: 400 })
  }

  // 2. Fetch brand details for context
  const brand = await prisma.brand.findUnique({
    where: { id: brandId }
  })

  // 3. Request Gemini to parse natural language instructions into structural operations
  const systemPrompt = `You are a helper that translates a user's natural language command for editing an image into a structured JSON command.
  
  Available parameters and options:
  - "crop": "1:1" | "9:16" | "4:3" | "16:9" | null (only if user explicitly mentions aspect ratio or cropping format, e.g. square/vertical/正方形/裁剪成)
  - "watermarkText": string | null (custom text watermark to overlay, only if explicitly requested, e.g. overlay text, add watermark)
  - "watermarkPosition": "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | null (defaults to "bottom-right" if user specifies watermark text)
  - "coverTagText": string | null (promotional badge text, only if requested, e.g. "店长推荐", "halal", "优惠")
  - "grayscale": boolean (turn image black and white, grayscale, e.g. 黑白, 黑白化, 去色)
  - "blur": number | null (blur radius, e.g. 5, 10, or null, only if user requests blur/模糊)
  - "rotate": number | null (angle in degrees clockwise, e.g. 90, 180, 270, or null, only if user requests rotation)
  - "sharpen": boolean (enhance detail/sharpness, only if user requests)
  - "brightness": number | null (brightness multiplier, e.g. 1.15 for bright/调亮, 0.85 for dark/调暗, or null)
  - "saturation": number | null (saturation multiplier, e.g. 1.15 for saturated/高饱和/艳丽, 0.85 for muted/去饱和, or null)
  
  Analyze this user command: "${userPrompt}"
  
  Return ONLY a valid JSON object with the exact keys above. If a parameter is not requested by the user, return null (or false for booleans). Output ONLY valid JSON, do NOT wrap in markdown code blocks.`;

  console.log(`[Asset Designer AI] User command: "${userPrompt}"`)
  let parsed: any = {}
  try {
    const textResponse = await generateText(systemPrompt, 300)
    if (textResponse) {
      const cleanJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim()
      parsed = JSON.parse(cleanJson)
      console.log(`[Asset Designer AI] Parsed instructions:`, parsed)
    }
  } catch (err) {
    console.error(`[Asset Designer AI] Gemini parser failed, falling back to rule-based parser:`, err)
  }

  // Fallback Rule-Based Parser in case Gemini is unavailable or fails
  const lowerPrompt = userPrompt.toLowerCase()
  const instructions = {
    crop: parsed.crop !== undefined ? parsed.crop : (
      lowerPrompt.includes('1:1') || lowerPrompt.includes('正方形') || lowerPrompt.includes('square') ? '1:1' :
      lowerPrompt.includes('9:16') || lowerPrompt.includes('竖屏') || lowerPrompt.includes('story') ? '9:16' :
      lowerPrompt.includes('4:3') ? '4:3' :
      lowerPrompt.includes('16:9') || lowerPrompt.includes('横屏') ? '16:9' : null
    ),
    watermarkText: parsed.watermarkText !== undefined ? parsed.watermarkText : (
      lowerPrompt.includes('水印') || lowerPrompt.includes('watermark') ? (
        brand?.watermarkText || brand?.name || 'Uncle Lim\'s 🇸🇬'
      ) : null
    ),
    watermarkPosition: parsed.watermarkPosition || 'bottom-right',
    coverTagText: parsed.coverTagText !== undefined ? parsed.coverTagText : (
      lowerPrompt.includes('标签') || lowerPrompt.includes('badge') || lowerPrompt.includes('sticker') ? (
        lowerPrompt.includes('halal') ? 'halal' : '店长推荐'
      ) : null
    ),
    grayscale: parsed.grayscale !== undefined ? parsed.grayscale : (
      lowerPrompt.includes('黑白') || lowerPrompt.includes('grayscale') || lowerPrompt.includes('gray') || lowerPrompt.includes('去色')
    ),
    blur: parsed.blur !== undefined ? parsed.blur : (
      lowerPrompt.includes('模糊') || lowerPrompt.includes('blur') ? 6 : null
    ),
    rotate: parsed.rotate !== undefined ? parsed.rotate : (
      lowerPrompt.includes('旋转') || lowerPrompt.includes('rotate') ? (
        lowerPrompt.includes('180') ? 180 : lowerPrompt.includes('270') ? 270 : 90
      ) : null
    ),
    sharpen: parsed.sharpen !== undefined ? parsed.sharpen : (
      lowerPrompt.includes('锐化') || lowerPrompt.includes('清晰') || lowerPrompt.includes('sharpen')
    ),
    brightness: parsed.brightness !== undefined ? parsed.brightness : (
      lowerPrompt.includes('亮') || lowerPrompt.includes('bright') ? 1.15 :
      lowerPrompt.includes('暗') || lowerPrompt.includes('dark') ? 0.85 : null
    ),
    saturation: parsed.saturation !== undefined ? parsed.saturation : (
      lowerPrompt.includes('饱和') || lowerPrompt.includes('艳丽') || lowerPrompt.includes('saturat') ? 1.15 :
      lowerPrompt.includes('去饱和') || lowerPrompt.includes('素雅') ? 0.85 : null
    )
  }

  try {
    // 4. Download source asset image buffer
    const sourceBuffer = await downloadToBuffer(original.url)

    // 5. Apply basic image operations with Sharp
    let sharpObj = sharp(sourceBuffer)

    // A. Apply rotation first if requested
    if (typeof instructions.rotate === 'number') {
      console.log(`[Asset Designer AI] Applying rotate: ${instructions.rotate} degrees`)
      sharpObj = sharpObj.rotate(instructions.rotate)
    }

    // B. Apply crop
    if (instructions.crop) {
      const metadata = await sharpObj.metadata()
      const width = metadata.width || 1200
      const height = metadata.height || 1200
      let targetWidth = width
      let targetHeight = height

      if (instructions.crop === '1:1') {
        targetWidth = Math.min(width, height)
        targetHeight = targetWidth
      } else if (instructions.crop === '9:16') {
        if (width * (16 / 9) > height) {
          targetHeight = height
          targetWidth = Math.round(height * (9 / 16))
        } else {
          targetWidth = width
          targetHeight = Math.round(width * (16 / 9))
        }
      } else if (instructions.crop === '4:3') {
        if (width * (3 / 4) > height) {
          targetHeight = height
          targetWidth = Math.round(height * (4 / 3))
        } else {
          targetWidth = width
          targetHeight = Math.round(width * (3 / 4))
        }
      } else if (instructions.crop === '16:9') {
        if (width * (9 / 16) > height) {
          targetHeight = height
          targetWidth = Math.round(height * (16 / 9))
        } else {
          targetWidth = width
          targetHeight = Math.round(width * (9 / 16))
        }
      }

      console.log(`[Asset Designer AI] Applying smart crop resize to: ${targetWidth}x${targetHeight}`)
      sharpObj = sharpObj.resize(targetWidth, targetHeight, {
        fit: 'cover',
        position: 'attention'
      })
    }

    // C. Apply adjustments (normalize, brightness, saturation, grayscale, blur, sharpen)
    sharpObj = sharpObj.normalize()

    if (instructions.brightness || instructions.saturation) {
      console.log(`[Asset Designer AI] Modulating brightness: ${instructions.brightness}, saturation: ${instructions.saturation}`)
      sharpObj = sharpObj.modulate({
        brightness: instructions.brightness || 1.0,
        saturation: instructions.saturation || 1.0
      })
    }

    if (instructions.grayscale) {
      console.log(`[Asset Designer AI] Applying grayscale`)
      sharpObj = sharpObj.grayscale()
    }

    if (typeof instructions.blur === 'number' && instructions.blur > 0) {
      console.log(`[Asset Designer AI] Applying blur: radius ${instructions.blur}`)
      sharpObj = sharpObj.blur(instructions.blur)
    }

    if (instructions.sharpen) {
      console.log(`[Asset Designer AI] Applying sharpen`)
      sharpObj = sharpObj.sharpen()
    }

    // D. Composite watermark and promotional cover tags
    const currentBuffer = await sharpObj.toBuffer()
    const metadata = await sharp(currentBuffer).metadata()
    const width = metadata.width || 1200
    const height = metadata.height || 1200

    let finalSharp = sharp(currentBuffer)
    const composites: any[] = []
    const padding = 20

    // Watermark composite
    if (instructions.watermarkText) {
      const wWidth = Math.round(width * 0.45)
      const wHeight = Math.round(height * 0.08)
      const fontSize = Math.max(12, Math.round(wHeight * 0.4))
      const escapedText = instructions.watermarkText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const svg = `
        <svg width="${wWidth}" height="${wHeight}">
          <style>
            .text { fill: #ffffff; font-size: ${fontSize}px; font-family: sans-serif; font-weight: bold; text-anchor: middle; dominant-baseline: middle; }
            .bg { fill: rgba(0, 0, 0, 0.45); rx: 6px; ry: 6px; }
          </style>
          <rect x="2" y="2" width="${wWidth - 4}" height="${wHeight - 4}" class="bg" />
          <text x="${wWidth / 2}" y="${wHeight / 2}" class="text">${escapedText}</text>
        </svg>
      `
      const watermarkInput = Buffer.from(svg)
      const pos = instructions.watermarkPosition || 'bottom-right'
      let wLeft = width - wWidth - padding
      let wTop = height - wHeight - padding
      if (pos === 'top-left') { wLeft = padding; wTop = padding; }
      else if (pos === 'top-right') { wLeft = width - wWidth - padding; wTop = padding; }
      else if (pos === 'bottom-left') { wLeft = padding; wTop = height - wHeight - padding; }
      else if (pos === 'center') { wLeft = Math.round((width - wWidth) / 2); wTop = Math.round((height - wHeight) / 2); }

      composites.push({ input: watermarkInput, left: wLeft, top: wTop })
    }

    // Cover tag composite
    if (instructions.coverTagText) {
      let tagText = instructions.coverTagText.trim()
      if (!tagText.startsWith('🔥') && !tagText.startsWith('✨') && !tagText.startsWith('🎁') && !tagText.startsWith('⭐')) {
        tagText = `🔥 ${tagText}`
      }
      const tWidth = Math.round(width * 0.35)
      const tHeight = Math.round(height * 0.07)
      const tFontSize = Math.max(11, Math.round(tHeight * 0.45))
      const escapedTagText = tagText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const svg = `
        <svg width="${tWidth}" height="${tHeight}">
          <style>
            .badge { fill: url(#grad); rx: 16px; ry: 16px; }
            .text { fill: #ffffff; font-size: ${tFontSize}px; font-family: sans-serif; font-weight: 900; text-anchor: middle; dominant-baseline: middle; }
          </style>
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#ff5e62;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#ff9966;stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="${tWidth - 4}" height="${tHeight - 4}" class="badge" />
          <text x="${tWidth / 2}" y="${tHeight / 2}" class="text">${escapedTagText}</text>
        </svg>
      `
      const tagInput = Buffer.from(svg)

      // Prevent overlapping watermarks
      let tLeft = padding
      let tTop = padding
      if (instructions.watermarkPosition === 'top-left' && instructions.watermarkText) {
        tLeft = width - tWidth - padding
        tTop = padding
      }
      composites.push({ input: tagInput, left: tLeft, top: tTop })
    }

    if (composites.length > 0) {
      finalSharp = finalSharp.composite(composites)
    }

    // Save final designed buffer to file
    const outputBuffer = await finalSharp.jpeg({ quality: 92 }).toBuffer()
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'designer')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const filename = `design-${assetId}-${Date.now()}.jpg`
    const outputPath = path.join(uploadDir, filename)
    fs.writeFileSync(outputPath, outputBuffer)

    const publicUrl = `/uploads/designer/${filename}`
    console.log(`[Asset Designer AI] Saved designed image locally: ${outputPath}`)

    // 6. Create a NEW MediaAsset in the database (do NOT overwrite original)
    const newAsset = await prisma.mediaAsset.create({
      data: {
        brandId,
        url: publicUrl,
        filename: `edit-${original.filename || 'asset.jpg'}`,
        mimeType: 'image/jpeg',
        sizeBytes: outputBuffer.length,
        width,
        height,
        aiReady: true,
        aiCategory: original.aiCategory || '素材库',
        aiTags: Array.from(new Set([...original.aiTags, 'AI设计'])),
        aiCaption: `AI修改 (${userPrompt}): ${original.aiCaption || ''}`,
        sourceType: 'designer',
        uploadedBy: actor.id
      }
    })

    console.log(`[Asset Designer AI] Registered new asset in DB: ${newAsset.id}`)
    return NextResponse.json({ ok: true, asset: newAsset })

  } catch (err: any) {
    console.error(`[Asset Designer AI] Processing error:`, err)
    return NextResponse.json({ error: err.message || 'Image processing failed' }, { status: 500 })
  }
}
