import { prisma } from './prisma'
import { generateMultimodalText } from './gemini'

import fs from 'fs'
import path from 'path'

/**
 * Downloads a public image URL or local path and returns its content as a Base64 string.
 */
async function downloadToBase64(url: string): Promise<string> {
  // Case 1: Absolute URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    if (!res.ok) {
      throw new Error(`Failed to download image from ${url} (HTTP ${res.status})`)
    }
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer).toString('base64')
  }

  // Case 2: PostFast proxy URL -> redirect to S3 URL
  if (url.startsWith('/api/integrations/postfast/file/')) {
    const parts = url.split('/')
    const s3Key = parts.slice(6).join('/')
    const s3Url = `https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/${s3Key}`
    console.log(`[Platform Designer] PostFast proxy URL detected. Rewriting to direct S3: ${s3Url}`)
    return downloadToBase64(s3Url)
  }

  // Case 3: Local relative paths
  if (url.startsWith('/uploads/') || url.startsWith('/')) {
    let relativePath = url
    if (url.startsWith('/')) {
      relativePath = url.slice(1)
    }
    const absolutePath = path.join(process.cwd(), 'public', relativePath)
    console.log(`[Platform Designer] Local path detected. Reading directly from disk: ${absolutePath}`)
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Local file not found at: ${absolutePath}`)
    }
    const buffer = fs.readFileSync(absolutePath)
    return buffer.toString('base64')
  }

  // Case 4: Token fallback
  const s3Url = `https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/${url}`
  console.log(`[Platform Designer] Asset token detected. Fetching from S3: ${s3Url}`)
  return downloadToBase64(s3Url)
}

/**
 * Platform Designer Background Service:
 * Automatically downloads an uploaded image, sends it to Gemini Multimodal,
 * detects the content tags and categories, saves them to the database,
 * and notifies the frontend of updates.
 */
export async function triggerDesignerAutoTag(assetId: string): Promise<void> {
  console.log(`[Platform Designer] Auto-tagging triggered for Asset ID: ${assetId}`)

  try {
    // 1. Fetch asset details from DB
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId },
    })

    if (!asset) {
      console.warn(`[Platform Designer] Asset ${assetId} not found. Skipping auto-tagging.`)
      return
    }

    if (!asset.mimeType.startsWith('image/')) {
      console.log(`[Platform Designer] Asset ${assetId} is not an image (mimeType: ${asset.mimeType}). Skipping multimodal tag generation.`)
      return
    }

    // 2. Fetch brand details for context
    const brand = await prisma.brand.findUnique({
      where: { id: asset.brandId }
    })

    // Try to get requested industry from assignment decision logs to be as accurate as possible
    const decision = await prisma.assignmentDecisionLog.findFirst({
      where: { subjectId: asset.brandId },
      orderBy: { createdAt: 'desc' }
    })

    const nameLower = (brand?.name || '').toLowerCase()
    const descLower = (brand?.description || '').toLowerCase()
    let detectedIndustry = decision?.requestedIndustry || 'General'

    if (detectedIndustry === 'General' || !detectedIndustry) {
      if (nameLower.includes('pilates') || nameLower.includes('普拉提') || descLower.includes('pilates') || descLower.includes('fitness') || descLower.includes('yoga')) {
        detectedIndustry = 'Pilates/Fitness'
      } else if (nameLower.includes('装修') || nameLower.includes('白钢') || nameLower.includes('renovation') || descLower.includes('renovation') || descLower.includes('interior')) {
        detectedIndustry = 'Home Renovation/Steel Work'
      } else if (nameLower.includes('winery') || nameLower.includes('酒') || descLower.includes('winery') || descLower.includes('wine')) {
        detectedIndustry = 'Winery/Beverages'
      } else if (nameLower.includes('seafood') || nameLower.includes('海鲜') || nameLower.includes('烤鱼') || nameLower.includes('restaurant') || nameLower.includes('饭') || nameLower.includes('菜') || descLower.includes('food') || descLower.includes('restaurant') || descLower.includes('dining')) {
        detectedIndustry = 'Food & Beverage'
      }
    }

    // 3. Download the image and convert it to Base64
    console.log(`[Platform Designer] Downloading image from: ${asset.url}`)
    const base64Data = await downloadToBase64(asset.url)

    // 4. Construct prompt and request Gemini Multimodal analysis
    const brandContext = brand 
      ? `Brand Name: ${brand.name}
Brand Description: ${brand.description || `A premium brand in ${detectedIndustry} industry.`}
Brand Location: ${brand.address || brand.location || "Singapore"}`
      : "";

    const prompt = `You are an AI Designer and Image Curator specialized in Singapore brand marketing for the "${detectedIndustry}" industry.
Analyze this uploaded image and generate metadata tailored to the brand's industry context.

${brandContext}

Instructions:
1. Provide a short, descriptive caption (aiCaption) detailing what is shown in the image (max 1 sentence). Use bilingual Chinese/English.
2. Provide a list of 3-7 highly relevant keywords/tags (aiTags). The tags MUST:
   - Identify the specific subject shown in the image (matching the brand's theme/industry, e.g. specific dish name like "海南鸡饭 (Chicken Rice)" if F&B, "核心床训练 (Reformer Workout)" if Pilates, "定制白钢橱柜 (Custom Steel Cabinet)" if renovation/construction, etc.).
   - Use Chinese or bilingual format.
   - Do NOT use generic terms like "food", "dish", "plate", "image", "photo", "object".
   - Include visual style, color tone, and vibe tags relevant to the scene (e.g. "暖色调", "高端大气", "精致摆盘", "现代简约", "活力健康").

Return your output ONLY as a valid JSON object with the exact following keys:
{
  "aiCaption": "the descriptive caption",
  "aiTags": ["tag1", "tag2", "tag3"]
}
Do NOT wrap in markdown code blocks. Output ONLY valid JSON.`

    console.log(`[Platform Designer] Requesting Gemini analysis for Asset ${assetId}...`)
    const responseText = await generateMultimodalText(prompt, asset.mimeType, base64Data, 400)

    if (!responseText) {
      console.warn(`[Platform Designer] Gemini returned empty response for Asset ${assetId}.`)
      return
    }

    // 4. Parse the output JSON
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleanJson)

    if (parsed.aiCaption || parsed.aiTags) {
      const generatedTags: string[] = Array.isArray(parsed.aiTags) ? parsed.aiTags : []
      
      // Clean tags: remove the temporary "待确认" tag
      const filteredOriginalTags = asset.aiTags.filter(t => t !== '待确认')
      const mergedTags = Array.from(new Set([...filteredOriginalTags, ...generatedTags, asset.aiCategory || '素材库']))

      console.log(`[Platform Designer] Analysis success for ${assetId}. New tags: ${mergedTags.join(', ')}`)

      // 5. Save the updated tags and captions to DB
      await prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          aiCaption: parsed.aiCaption || asset.aiCaption,
          aiTags: {
            set: mergedTags,
          },
        },
      })

      // 6. Emit a board_update event to refresh the UI immediately
      const { eventEmitter } = await import('./events')
      eventEmitter.emit('board_update')
      console.log(`[Platform Designer] Saved updates and broadcasted UI update for ${assetId}.`)
    }
  } catch (error) {
    console.error(`[Platform Designer] Error auto-tagging asset ${assetId}:`, error)
  }
}
