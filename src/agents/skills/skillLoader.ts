import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface PlatformSkill {
  name: string
  platform: string
  version: string
  language: string
  instructions: string
  hookFormulas?: string
  formatRules?: string
  bannedWords?: string[]
  samplePosts?: string
}

const SKILLS_BASE_DIR = join(process.cwd(), 'src', 'agents', 'skills', 'platforms')

// Platform aliases → folder name mapping
const PLATFORM_ALIASES: Record<string, string> = {
  'xiaohongshu': 'xiaohongshu',
  'red': 'xiaohongshu',
  'xhs': 'xiaohongshu',
  'rednote': 'xiaohongshu',
  'instagram': 'instagram',
  'ig': 'instagram',
  'tiktok': 'tiktok',
  'tt': 'tiktok',
  'facebook': 'facebook',
  'fb': 'facebook',
  'google': 'google_business',
  'google_business': 'google_business',
  'google_maps': 'google_business',
  'gbp': 'google_business',
  'google_business_profile': 'google_business',
}

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length) meta[key.trim()] = rest.join(':').trim()
  }
  return { meta, body: match[2] }
}

function extractSection(body: string, headingPattern: string): string {
  const regex = new RegExp(`## (?:${headingPattern})[\\s\\S]*?(?=\\n## |$)`, 'i')
  const match = body.match(regex)
  return match ? match[0].trim() : ''
}

function extractBannedWords(body: string): string[] {
  const section = extractSection(body, 'AI 腔禁忌词|AI Tone Banned Words')
  if (!section) return []
  const words: string[] = []
  const lines = section.split('\n').slice(1)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    words.push(...trimmed.split('|').map(w => w.trim()).filter(Boolean))
  }
  return words
}

/**
 * Loads and parses a platform-specific SKILL.md file.
 * Returns null if the platform skill does not exist (graceful degradation).
 */
export async function loadPlatformSkill(platform: string): Promise<PlatformSkill | null> {
  const normalizedPlatform = (platform || '').toLowerCase().trim()
  const folderName = PLATFORM_ALIASES[normalizedPlatform]
  if (!folderName) {
    console.warn(`[SkillLoader] No skill mapping for platform: "${platform}"`)
    return null
  }
  const skillPath = join(SKILLS_BASE_DIR, folderName, 'SKILL.md')
  if (!existsSync(skillPath)) {
    console.warn(`[SkillLoader] Skill file not found: ${skillPath}`)
    return null
  }
  try {
    const raw = readFileSync(skillPath, 'utf-8')
    const { meta, body } = parseFrontmatter(raw)
    const hookFormulas = extractSection(body, 'Hook 公式库|Hook Formula Library')
    const formatRules = extractSection(body, '正文格式规范|Body Format Rules|Format Rules|Post Type Formulas')
    const bannedWords = extractBannedWords(body)
    const samplePosts = extractSection(body, '样本|Sample Posts|Sample Post|Sample Caption')
    console.log(`[SkillLoader] Loaded skill for "${platform}" → ${folderName}/SKILL.md v${meta.version || '?'}`)
    return {
      name: meta.name || folderName,
      platform: meta.platform || folderName,
      version: meta.version || '1.0.0',
      language: meta.language || 'en',
      instructions: body,
      hookFormulas,
      formatRules,
      bannedWords,
      samplePosts,
    }
  } catch (err) {
    console.error(`[SkillLoader] Failed to load skill for "${platform}":`, err)
    return null
  }
}

/**
 * Formats a loaded skill into a prompt injection string.
 */
export function formatSkillForPrompt(skill: PlatformSkill | null): string {
  if (!skill) return ''
  const sections: string[] = [
    `\n--- PLATFORM SKILL: ${skill.name} v${skill.version} ---`,
  ]
  if (skill.hookFormulas) sections.push(`\n[Platform Hook Formulas — Use these as your hook template source]\n${skill.hookFormulas}`)
  if (skill.formatRules) sections.push(`\n[Platform Format Rules — MUST follow]\n${skill.formatRules}`)
  if (skill.bannedWords && skill.bannedWords.length > 0) {
    sections.push(`\n[AI-Tone Banned Words — NEVER use these]\n${skill.bannedWords.join(' | ')}`)
  }
  if (skill.samplePosts) sections.push(`\n[Writing Style Reference Samples]\n${skill.samplePosts}`)
  sections.push(`\n--- END PLATFORM SKILL ---\n`)
  return sections.join('\n')
}
