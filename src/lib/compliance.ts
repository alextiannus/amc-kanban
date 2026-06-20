import { readBrandProfileMarkdown } from './brandProfileMarkdown'

export interface ComplianceConfig {
  prohibitedWords?: string[]
  requiredKeywords?: string[]
  tone?: string
}

export interface ValidationResult {
  isValid: boolean
  matchedProhibitedWords: string[]
  missingKeywords: string[]
}

/**
 * Extracts and parses the compliance configuration from the brand profile markdown file.
 * It scans all JSON blocks inside the markdown file for an "ext.compliance" or "compliance" node.
 */
export async function parseBrandComplianceConfig(brandId: string): Promise<ComplianceConfig | null> {
  try {
    const profile = await readBrandProfileMarkdown(brandId, { ensureExists: false })
    if (!profile || !profile.markdown) {
      return null
    }

    const markdown = profile.markdown
    const regex = /```json\s*([\s\S]*?)\s*```/g
    let match
    while ((match = regex.exec(markdown)) !== null) {
      try {
        const parsed = JSON.parse(match[1])
        if (parsed && typeof parsed === 'object') {
          // Check ext.compliance first
          if (parsed.ext?.compliance && typeof parsed.ext.compliance === 'object') {
            return parsed.ext.compliance as ComplianceConfig
          }
          // Check root compliance
          if (parsed.compliance && typeof parsed.compliance === 'object') {
            return parsed.compliance as ComplianceConfig
          }
        }
      } catch {
        // Skip malformed or non-target JSON blocks
      }
    }
  } catch (error) {
    console.error(`[Compliance] Error parsing compliance config for brand ${brandId}:`, error)
  }
  return null
}

/**
 * Validates a caption text against the brand's compliance configuration.
 */
export function validateContentCompliance(caption: string, config: ComplianceConfig): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    matchedProhibitedWords: [],
    missingKeywords: []
  }

  if (!caption) return result

  const cleanCaption = caption.toLowerCase()

  // 1. Check prohibited words (case-insensitive)
  if (Array.isArray(config.prohibitedWords)) {
    for (const word of config.prohibitedWords) {
      if (typeof word === 'string' && word.trim()) {
        const lowerWord = word.trim().toLowerCase()
        if (cleanCaption.includes(lowerWord)) {
          result.matchedProhibitedWords.push(word.trim())
          result.isValid = false
        }
      }
    }
  }

  // 2. Check required keywords (can be used for hints/suggestions)
  if (Array.isArray(config.requiredKeywords)) {
    for (const word of config.requiredKeywords) {
      if (typeof word === 'string' && word.trim()) {
        const lowerWord = word.trim().toLowerCase()
        if (!cleanCaption.includes(lowerWord)) {
          result.missingKeywords.push(word.trim())
        }
      }
    }
  }

  return result
}
