import { prisma } from './prisma'
import { generateMultimodalText } from './gemini'

/**
 * Downloads a public image URL and returns its content as a Base64 string.
 */
async function downloadToBase64(url: string): Promise<string> {
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

    // 2. Download the image and convert it to Base64
    console.log(`[Platform Designer] Downloading image from: ${asset.url}`)
    const base64Data = await downloadToBase64(asset.url)

    // 3. Construct prompt and request Gemini Multimodal analysis
    const prompt = `You are an AI Designer and Image Curator. 
Analyze this uploaded image and generate:
1. A short, descriptive caption of what is in the image (max 1 sentence) for F&B marketing context.
2. A list of 3-7 relevant keywords/tags (such as food names, cooking style, vibes, color tone).

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
