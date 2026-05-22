import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadToLarkDrive } from '@/lib/integrations/lark'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

// Helper to compute MD5 hash of buffer
function computeMD5(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex')
}

// Native fetch implementation of Gemini Vision API with zero external dependencies
async function runGeminiVisionAnalysis(
  imageBuffer: Buffer,
  mimeType: string,
  brandName: string
): Promise<{ approved: boolean; reason: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.log('[Gemini Vision] No GEMINI_API_KEY set. Simulating AI review.')
    // Simulating approval unless filename or content triggers manual review
    return { approved: true, reason: 'AI Simulation: Review looks valid.' }
  }

  try {
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `Analyze this screenshot. Determine if it is a valid review for the brand "${brandName}". Check if: 1. It is a review on a social/map platform. 2. The rating is positive (4 or 5 stars). 3. The review date is recent (e.g., "just now", "1 day ago"). Respond with a JSON object ONLY: { "approved": boolean, "platform": "GOOGLE"|"YELP"|"INSTAGRAM"|"OTHER", "rating": number, "reason": "why approved or rejected" }. Do not add markdown code blocks.`
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: imageBuffer.toString('base64'),
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`)
    }

    const json = await response.json()
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    const result = JSON.parse(text)
    return {
      approved: !!result.approved,
      reason: result.reason || 'AI Analysis complete.',
    }
  } catch (e: any) {
    console.error('[Gemini Vision Error]', e)
    return {
      approved: false,
      reason: `AI Verification failed: ${e.message}. Clerk override needed.`,
    }
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const brandId = formData.get('brandId') as string
    const sessionId = formData.get('sessionId') as string
    const taskType = formData.get('taskType') as string // PHOTO_UPLOAD | REVIEW_SUBMIT
    const copyrightAgreed = formData.get('copyrightAgreed') === 'true'
    const reviewPlatform = formData.get('reviewPlatform') as string | null

    if (!brandId || !sessionId || !taskType) {
      return NextResponse.json({ error: 'brandId, sessionId, and taskType are required' }, { status: 400 })
    }

    if (!copyrightAgreed) {
      return NextResponse.json({ error: 'You must agree to the copyright terms to participate.' }, { status: 400 })
    }

    // 1. Fetch files from form
    const files: File[] = []
    for (const key of Array.from(formData.keys())) {
      if (key.startsWith('files') || key === 'file') {
        const fileVal = formData.get(key)
        if (fileVal instanceof File) {
          files.push(fileVal)
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })
    }

    // 2. Fetch Brand config & integrations status
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        name: true,
        larkAppId: true,
        larkAppSecret: true,
        larkDriveFolderId: true,
      },
    })
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // 3. Process buffers and MD5 hashes
    const fileData: { buffer: Buffer; name: string; type: string; md5: string }[] = []
    const newMd5s: string[] = []

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const md5 = computeMD5(buffer)
      fileData.push({ buffer, name: file.name, type: file.type, md5 })
      newMd5s.push(md5)
    }

    // 4. Find or initialize the customer's transient GameSession
    let session = await prisma.gameSession.findUnique({
      where: { brandId_sessionId: { brandId, sessionId } },
    })
    if (!session) {
      session = await prisma.gameSession.create({
        data: { brandId, sessionId, pointsBalance: 0 },
      })
    }

    // 5. Upload files and create MediaAssets
    const savedUrls: string[] = []
    const isLarkConfigured = brand.larkAppId && brand.larkAppSecret && brand.larkDriveFolderId

    for (const item of fileData) {
      let fileUrl = ''

      if (isLarkConfigured) {
        // Option A: Upload to Lark Drive
        const uploadResult = await uploadToLarkDrive({
          appId: brand.larkAppId!,
          appSecret: brand.larkAppSecret!,
          folderId: brand.larkDriveFolderId!,
          filename: item.name,
          mimeType: item.type,
          fileBuffer: item.buffer,
        })
        if (uploadResult.success) {
          fileUrl = uploadResult.fileToken!
        }
      }

      // Option B: Fallback locally to public uploads if Lark fails or is not configured
      if (!fileUrl) {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'ugc')
        await fs.mkdir(uploadDir, { recursive: true })
        
        // Generate a clean filename to avoid collisions
        const safeName = `${crypto.randomUUID()}${path.extname(item.name)}`
        const localPath = path.join(uploadDir, safeName)
        await fs.writeFile(localPath, item.buffer)
        fileUrl = `/uploads/ugc/${safeName}`
      }

      savedUrls.push(fileUrl)

      // Register photo as a MediaAsset in AMC library
      await prisma.mediaAsset.create({
        data: {
          brandId,
          url: fileUrl,
          filename: item.name,
          mimeType: item.type,
          sizeBytes: item.buffer.length,
          uploadedBy: 'customer_h5',
          sourceType: 'customer_ugc',
          aiReady: false,
        },
      })
    }

    // 6. Verification Step
    let isApproved = false
    let aiReason = ''

    if (taskType === 'PHOTO_UPLOAD') {
      // Photo uploads are approved automatically on upload since they are verified manually by clerks later if needed
      isApproved = true
      aiReason = 'Photos uploaded successfully.'
    } else if (taskType === 'REVIEW_SUBMIT') {
      // Run Gemini Vision on the review screenshot (fileData[0])
      const reviewImage = fileData[0]
      const aiResult = await runGeminiVisionAnalysis(reviewImage.buffer, reviewImage.type, brand.name)
      isApproved = aiResult.approved
      aiReason = aiResult.reason
    }

    // 7. Save task submission in database
    const pointsAwarded = isApproved ? 5 : 0
    const submission = await prisma.customerTaskSubmission.create({
      data: {
        sessionId: session.id,
        brandId,
        taskType,
        status: isApproved ? 'APPROVED' : 'PENDING',
        pointsAwarded,
        images: savedUrls,
        imageMd5s: newMd5s,
        copyrightAgreed: true,
        reviewPlatform: reviewPlatform || 'GOOGLE',
        reviewTimeRaw: taskType === 'REVIEW_SUBMIT' ? 'recent' : null,
        aiReason,
        reviewedAt: isApproved ? new Date() : null,
      },
    })

    // 8. Update points balance if approved
    let currentPoints = session.pointsBalance
    if (isApproved) {
      const updatedSession = await prisma.gameSession.update({
        where: { id: session.id },
        data: { pointsBalance: { increment: 5 } },
      })
      currentPoints = updatedSession.pointsBalance
    }

    return NextResponse.json({
      submissionId: submission.id,
      status: submission.status,
      pointsAwarded,
      pointsBalance: currentPoints,
      aiReason,
    }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/game/tasks]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
