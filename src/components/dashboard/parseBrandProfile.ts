/**
 * parseBrandProfile.ts
 * Parse the brand profile markdown (MANUAL section) into structured fields
 * for the BrandStorySlides presentation component.
 */

export interface BrandProfileData {
  // 10.1 品牌定义与核心主张
  mission?: string       // 使命 Mission
  vision?: string        // 愿景 Vision
  valueProp?: string     // 价值主张 Value Proposition
  personality?: string   // 品牌人格 Personification

  // 10.2 设计与视觉规范
  brandColors?: string   // 品牌色
  aesthetic?: string     // 图片/视频审美方向

  // 10.3 内容策略
  contentPillars?: string  // 内容支柱
  toneOfVoice?: string    // 语气 Tone of Voice
  targetAudience?: string  // 目标客群细分与沟通方式
  topics?: string         // 选题清单

  // Raw markdown (fallback)
  rawManual?: string
}

const MANUAL_START = '<!-- AMC:BRAND_PROFILE:MANUAL:START -->'
const MANUAL_END   = '<!-- AMC:BRAND_PROFILE:MANUAL:END -->'

/**
 * Extract the value of a markdown list item like "- 使命 Mission: <value>"
 * Returns trimmed string or undefined if empty/template placeholder.
 */
function extractField(text: string, ...labels: string[]): string | undefined {
  for (const label of labels) {
    // Match "- label: value" or "- **label**: value"
    const patterns = [
      new RegExp(`^[-*]\\s+\\*{0,2}${escapeRe(label)}\\*{0,2}\\s*:?\\s*(.+)$`, 'im'),
      new RegExp(`^[-*]\\s+${escapeRe(label)}\\s*:?\\s*(.+)$`, 'im'),
    ]
    for (const re of patterns) {
      const m = text.match(re)
      if (m) {
        const val = m[1].trim()
        // Ignore empty or template-like values (just a colon, or very short)
        if (val && val !== ':' && val.length > 2 && !val.match(/^[:：]\s*$/)) {
          return val
        }
      }
    }
  }
  return undefined
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extract a ### section block by heading text
 */
function extractSection(markdown: string, ...headings: string[]): string {
  for (const heading of headings) {
    const re = new RegExp(`###\\s+[^\\n]*${escapeRe(heading)}[^\\n]*\\n([\\s\\S]*?)(?=###|##|$)`, 'i')
    const m = markdown.match(re)
    if (m) return m[1].trim()
  }
  return ''
}

/**
 * Parse the brand profile markdown into structured BrandProfileData.
 */
export function parseBrandProfile(markdown: string): BrandProfileData {
  if (!markdown) return {}

  // Extract the MANUAL section
  const manualStart = markdown.indexOf(MANUAL_START)
  const manualEnd   = markdown.indexOf(MANUAL_END)
  const manualText  = manualStart >= 0 && manualEnd > manualStart
    ? markdown.slice(manualStart + MANUAL_START.length, manualEnd)
    : markdown   // fallback: parse the whole thing

  const section10_1 = extractSection(manualText, '品牌定义', '10.1')
  const section10_2 = extractSection(manualText, '设计与视觉', '10.2')
  const section10_3 = extractSection(manualText, '内容策略', '10.3')

  return {
    mission:        extractField(section10_1, '使命 Mission', '使命', 'Mission'),
    vision:         extractField(section10_1, '愿景 Vision', '愿景', 'Vision'),
    valueProp:      extractField(section10_1, '价值主张 Value Proposition', '价值主张', 'Value Proposition'),
    personality:    extractField(section10_1, '品牌人格 Personification', '品牌人格', 'Personification'),

    brandColors:    extractField(section10_2, '品牌色与辅助色', '品牌色', 'Brand Color'),
    aesthetic:      extractField(section10_2, '图片/视频审美方向', '审美方向', 'Aesthetic'),

    contentPillars: extractField(section10_3, '内容支柱（Content Pillars）', '内容支柱', 'Content Pillars'),
    toneOfVoice:    extractField(section10_3, '语气 Tone of Voice', '语气', 'Tone of Voice'),
    targetAudience: extractField(section10_3, '目标客群细分与沟通方式', '目标客群', 'Target Audience'),
    topics:         extractField(section10_3, '选题清单与热点策略', '选题清单'),

    rawManual: manualText,
  }
}
