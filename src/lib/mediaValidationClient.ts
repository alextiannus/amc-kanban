export type ClientMediaValidationIssue = {
  assetId?: string
  filename?: string
  platform?: string
  severity?: 'error' | 'warning'
  field?: string
  actual?: string | number | null
  limit?: string | number | null
  message?: string
}

type MediaValidationPayload = {
  code?: string
  error?: string
  issues?: ClientMediaValidationIssue[]
  warnings?: ClientMediaValidationIssue[]
}

function asPayload(value: unknown): MediaValidationPayload {
  return value && typeof value === 'object' ? value as MediaValidationPayload : {}
}

function platformLabel(value?: string) {
  switch (value?.toLowerCase()) {
    case 'instagram':
      return 'Instagram'
    case 'tiktok':
      return 'TikTok'
    case 'facebook':
      return 'Facebook'
    case 'google_business':
      return 'Google Business'
    default:
      return value || '发布平台'
  }
}

function displayValue(field: string | undefined, value: unknown) {
  if (value === null || value === undefined || value === '') return '未检测到'
  if (typeof value !== 'number') return String(value)

  if (field === 'sizeBytes') return `${(value / 1_000_000).toFixed(1)} MB`
  if (field === 'videoBitrate') return `${(value / 1_000_000).toFixed(1)} Mbps`
  if (field === 'audioSampleRate') return `${Math.round(value / 1_000)} kHz`
  if (field === 'durationSeconds') {
    const minutes = Math.floor(value / 60)
    const seconds = Math.round(value % 60)
    return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`
  }
  if (field === 'frameRate') return `${value} fps`
  return String(value)
}

function issueKey(issue: ClientMediaValidationIssue) {
  return [
    issue.assetId,
    issue.filename,
    issue.platform,
    issue.field,
    issue.actual,
    issue.limit,
    issue.message,
  ].join('|')
}

function uniqueIssues(issues: ClientMediaValidationIssue[]) {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = issueKey(issue)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function mediaWarningsFromPayload(payload: unknown): ClientMediaValidationIssue[] {
  const parsed = asPayload(payload)
  return uniqueIssues([
    ...(Array.isArray(parsed.warnings) ? parsed.warnings : []),
    ...(Array.isArray(parsed.issues)
      ? parsed.issues.filter((issue) => issue.severity === 'warning')
      : []),
  ])
}

function formatIssues(issues: ClientMediaValidationIssue[]) {
  return uniqueIssues(issues).map((issue) => {
    const scope = [platformLabel(issue.platform), issue.filename].filter(Boolean).join(' · ')
    const details: string[] = []
    if (issue.actual !== undefined) details.push(`检测值：${displayValue(issue.field, issue.actual)}`)
    if (issue.limit !== undefined && issue.limit !== null) details.push(`平台建议：${displayValue(issue.field, issue.limit)}`)
    const suffix = details.length > 0 ? `（${details.join('；')}）` : ''
    return `- ${scope}：${issue.message || '媒体参数可能不符合平台建议'}${suffix}`
  }).join('\n')
}

export function formatMediaWarnings(payloads: unknown | unknown[]) {
  const list = Array.isArray(payloads) ? payloads : [payloads]
  const warnings = uniqueIssues(list.flatMap(mediaWarningsFromPayload))
  if (warnings.length === 0) return ''
  return `素材参数提示（不会阻止提交，已继续提交）：\n${formatIssues(warnings)}`
}

export function mediaValidationErrorMessage(payload: unknown, fallback: string) {
  const parsed = asPayload(payload)
  const blockingIssues = Array.isArray(parsed.issues)
    ? parsed.issues.filter((issue) => issue.severity !== 'warning')
    : []
  if (blockingIssues.length === 0) return parsed.error || fallback

  return `${parsed.error || fallback}\n${formatIssues(blockingIssues)}`
}
