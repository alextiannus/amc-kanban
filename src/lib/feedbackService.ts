import { prisma } from './prisma.ts'
import { boundedEditDistance } from './feedbackDistance.ts'

/**
 * Computes Levenshtein distance between two strings.
 */
// Two rows of memory; oversized comparisons are excluded from training below.
const correctionDistance=(a:string,b:string)=>boundedEditDistance(a,b,20_000,4_000_000)

/**
 * Calculates an exact ratio, or null when comparison exceeds the budget.
 */
export function calculateDiffRatio(original: string, corrected: string): number | null {
  const oClean = (original || '').trim()
  const cClean = (corrected || '').trim()
  if (!oClean && !cClean) return 0
  if (!oClean || !cClean) return 1
  const measured = correctionDistance(oClean,cClean)
  if (!measured) return null
  const maxLength = Math.max(Array.from(oClean).length, Array.from(cClean).length)
  return measured.distance / maxLength
}

/**
 * Records user modification feedback.
 * If the modification ratio falls between 10% and 40%, it is recorded
 * in the database for the Coordinator to approve as a Few-Shot training example.
 */
export async function recordUserCorrection(
  brandId: string,
  originalText: string,
  correctedText: string
): Promise<{ recorded: boolean; diffRatio: number | null; error?: string }> {
  try {
    const diffRatio = calculateDiffRatio(originalText, correctedText)
    if (diffRatio === null) return {recorded:false,diffRatio:null,error:'feedback_comparison_limit'}
    
    // Retain only measured corrections inside the existing 10%-40% range.
    if (diffRatio < 0.1 || diffRatio > 0.4) {
      console.log(`[Feedback Service] Ignored feedback for brand ${brandId}. Diff ratio is ${diffRatio.toFixed(2)} (outside 10%-40% bounds).`)
      return { recorded: false, diffRatio }
    }

    await prisma.userCorrectionFeedback.create({
      data: {
        brandId,
        originalText,
        correctedText,
        diffRatio,
        isApproved: false, // Default to false, awaits Coordinator approval in AIOps console
        vectorStatus: 'PENDING',
      },
    })

    console.log(`[Feedback Service] Recorded user modification feedback for brand ${brandId}. Diff ratio: ${diffRatio.toFixed(2)}`)
    return { recorded: true, diffRatio }
  } catch (error: any) {
    console.error('[Feedback Service] Error recording feedback:', error)
    return { recorded: false, diffRatio: 0, error: error.message }
  }
}

/**
 * Retrieves approved corrections to use as Few-Shot prompts for generating future content.
 */
export async function getFewShotExamples(
  brandId: string,
  limit: number = 3
): Promise<{ originalText: string; correctedText: string }[]> {
  try {
    const list = await prisma.userCorrectionFeedback.findMany({
      where: {
        brandId,
        isApproved: true,
      },
      select: {
        originalText: true,
        correctedText: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    })
    return list
  } catch (error) {
    console.error('[Feedback Service] Failed to retrieve few-shot examples:', error)
    return []
  }
}

/**
 * Closed-loop feedback: Processes completed drafts to curate SFT/DPO dataset entries.
 */
export async function processDraftCuration(
  brandId: string,
  draftId: string,
  finalCaption: string
): Promise<void> {
  try {
    // 1. Find the latest CopywriterLog for this draftId
    const log = await prisma.copywriterLog.findFirst({
      where: { draftId, brandId },
      orderBy: { createdAt: 'desc' }
    })
    if (!log) {
      console.log(`[Curation] No CopywriterLog found for draft ${draftId}. Skipping.`)
      return
    }

    // 2. Parse the AI's original generated caption
    let originalCaption = ""
    try {
      const cleanJson = log.rawOutput.replace(/```json/g, "").replace(/```/g, "").trim()
      const parsed = JSON.parse(cleanJson)
      originalCaption = parsed.caption || log.rawOutput
    } catch {
      originalCaption = log.rawOutput
    }

    if (!originalCaption) return

    // 3. Compute difference ratio
    // Unknown effort must not become an automatically approved training sample.
    const diffRatio = calculateDiffRatio(originalCaption, finalCaption)
    if (diffRatio === null) return
    const isDpo = diffRatio >= 0.2
    const tag = isDpo ? 'needs_rewrite' : 'include' // DPO vs SFT

    // 4. Update the CopywriterLog to mark it as annotated training data
    await prisma.copywriterLog.update({
      where: { id: log.id },
      data: {
        correctedContent: finalCaption,
        isAnnotated: true,
        trainingTag: tag
      }
    })

    // 5. Create or update UserCorrectionFeedback for few-shot adaptation
    await prisma.userCorrectionFeedback.create({
      data: {
        brandId,
        originalText: originalCaption,
        correctedText: finalCaption,
        diffRatio,
        isApproved: true, // auto-approve so it is instantly active in the few-shot search
        vectorStatus: 'PENDING'
      }
    })

    console.log(`[Curation] Processed draft ${draftId}. Diff ratio: ${diffRatio.toFixed(2)}. Saved as SFT/DPO sample (tag: ${tag}).`)
  } catch (err) {
    console.error(`[Curation] Error processing curation for draft ${draftId}:`, err)
  }
}
