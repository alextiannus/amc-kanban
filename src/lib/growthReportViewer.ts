export type GrowthReportViewerReference = {
  viewerUrl?: string
  reportVersionId?: string
}

export type GrowthReportVersionCandidate = {
  report_version_id?: string | number | null
  viewer_url?: string | null
  tier?: string | null
  created_at?: string | null
  result?: Record<string, unknown> | null
}

type GrowthReportPrincipal = {
  source?: string
  actorType?: string
  globalRoles?: string[]
}

const GROWTH_STAFF_ROLES = new Set(['ADMIN', 'AMC_PRINCIPAL'])
const REPORT_VERSION_PATH = /^\/dashboard\/reports\/versions\/\d+$/
const REPORT_VERSION_ID = /^\d+$/

function candidateText(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function candidateRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function selectLatestGrowthV3ReportVersionReference(
  versions: GrowthReportVersionCandidate[]
): GrowthReportViewerReference | null {
  const matches = versions.flatMap((version) => {
    const result = candidateRecord(version.result)
    if (candidateText(version.tier).toLocaleLowerCase() !== 'initial') return []
    if (candidateText(result.report_template_version).toLocaleLowerCase() !== 'v3') return []
    const reportVersionId = candidateText(version.report_version_id)
    if (!REPORT_VERSION_ID.test(reportVersionId)) return []
    return [{
      timestamp: candidateText(version.created_at),
      reference: {
        reportVersionId,
        viewerUrl: candidateText(version.viewer_url) || undefined,
      },
    }]
  })

  matches.sort((left, right) => right.timestamp.localeCompare(left.timestamp))
  return matches[0]?.reference || null
}

export function growthReportStandalonePath(report: GrowthReportViewerReference) {
  const savedViewerUrl = report.viewerUrl?.trim()
  const versionPath = report.reportVersionId
    ? `/dashboard/reports/versions/${encodeURIComponent(report.reportVersionId)}`
    : ''

  for (const candidate of [savedViewerUrl, versionPath]) {
    if (!candidate) continue
    try {
      const parsed = new URL(candidate, 'https://amc-growth.invalid')
      if (!REPORT_VERSION_PATH.test(parsed.pathname)) continue
      parsed.searchParams.set('view', 'standalone')
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    } catch {
      continue
    }
  }
  return ''
}

export function growthReportSsoHref(report: GrowthReportViewerReference, fallbackHref: string) {
  const returnTo = growthReportStandalonePath(report)
  if (!returnTo) return fallbackHref
  const params = new URLSearchParams({ returnTo, fallback: fallbackHref })
  return `/api/integrations/amc-growth/sso/start?${params.toString()}`
}

export function canUseGrowthStandaloneReport(principal: GrowthReportPrincipal) {
  return principal.source === 'session'
    && principal.actorType === 'HUMAN'
    && (principal.globalRoles || []).some((role) => GROWTH_STAFF_ROLES.has(role))
}
