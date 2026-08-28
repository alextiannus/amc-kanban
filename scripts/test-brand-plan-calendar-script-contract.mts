import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [serviceSource, profileSource] = await Promise.all([
  readFile(new URL('../src/lib/brand-plan/service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/dashboard/BrandProfileView.tsx', import.meta.url), 'utf8'),
])

assert(!serviceSource.includes('using independent rule item'))
assert(!serviceSource.includes('buildIndependentPublishingCalendarItemByIndex'))
assert(!serviceSource.includes('fallbackReviewedCalendarItems'))
assert(!serviceSource.includes('mergeReviewedCalendarPlanning'))
assert(!serviceSource.includes('reviewCalendarCreativeItemsWithLLM'))

assert(serviceSource.includes("throw new BrandPlanError('calendar_content_match_failed'"))
assert(serviceSource.includes("creativeMatchStatus?: 'matched' | 'no_candidate_after_retry'"))
assert(serviceSource.includes("const creativeMatchStatus = (candidate ? 'matched' : 'no_candidate_after_retry')"))
assert(serviceSource.includes('creativeMatchStatus,'))

assert(serviceSource.includes("scriptSource?: 'inspiration' | 'generated_from_idea' | 'merchant'"))
assert(serviceSource.includes("scriptSource: (hasCalendarSourceShots(candidate) ? 'inspiration' : 'generated_from_idea')"))
assert(serviceSource.includes("scriptSource: 'merchant'"))
assert(serviceSource.includes('videoScript?: CalendarVideoScriptData'))
assert(serviceSource.includes('function withCalendarScriptFields'))
assert(serviceSource.includes('videoScript: {'))
assert(profileSource.includes('videoScript?: CalendarVideoScriptPayload'))
assert(profileSource.includes('function calendarVideoScriptForItem'))
assert(profileSource.includes('if (!item.videoScript) return parseCalendarVideoScript(item.planning)'))
assert(serviceSource.includes("${hasSourceShots ? '分镜脚本' : '拍摄建议'}"))
assert(profileSource.includes("line.startsWith('分镜脚本：') || line.startsWith('拍摄建议：')"))
assert(profileSource.includes("script.shotLabel = line.startsWith('拍摄建议：') ? '建议' : '分镜'"))
assert(profileSource.includes("{videoScript.shotLabel === '分镜' ? '详细分镜' : '拍摄建议'}"))
assert(profileSource.includes('`${videoScript.shotLabel} ${shotIndex + 1}：${shot}`'))

assert(serviceSource.includes('function sanitizeCalendarRewritePlanning'))
assert(serviceSource.includes("if (line.startsWith('口播方向：')) return wantsVoiceover"))
assert(serviceSource.includes("if (line.startsWith('字幕方向：')) return wantsSubtitles"))
assert(serviceSource.includes("if (wantsVoiceover && !hasVoiceover) kept.push('口播方向：根据内容做口播')"))
assert(serviceSource.includes("if (wantsSubtitles && !hasSubtitles) kept.push('字幕方向：根据内容做字幕')"))
assert(serviceSource.includes("voiceover.length ? `口播方向：${voiceover.join(' / ')}` : ''"))
assert(serviceSource.includes("subtitles.length ? `字幕方向：${subtitles.join(' / ')}` : ''"))

console.log('Brand plan calendar script contract tests passed.')
