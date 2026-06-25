import { prisma } from './prisma.ts'

/**
 * Computes Levenshtein distance between two strings.
 */
function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

/**
 * Calculates the difference ratio (from 0.0 to 1.0) between two strings.
 */
export function calculateDiffRatio(original: string, corrected: string): number {
  const oClean = (original || '').trim()
  const cClean = (corrected || '').trim()
  if (!oClean && !cClean) return 0
  if (!oClean || !cClean) return 1
  const distance = getLevenshteinDistance(oClean, cClean)
  const maxLength = Math.max(oClean.length, cClean.length)
  return distance / maxLength
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
): Promise<{ recorded: boolean; diffRatio: number; error?: string }> {
  try {
    const diffRatio = calculateDiffRatio(originalText, correctedText)
    
    // Ignore identical strings or absolute rewrites (> 40% difference indicates total rewrite, which may contain spam)
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
