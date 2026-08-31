export type GrowthReportViewerReference = {
  viewerUrl?: string
  reportVersionId?: string
}

type GrowthReportVersionCandidate = {
  report_version_id?: string | number | null
  viewer_url?: string | null
  created_at?: string | null
  result?: Record<string, unknown> | null
}

export type GrowthReportJobCandidate = {
  status?: string | null
  brand_name?: string | null
  report_template_version?: string | null
  generated_at?: string | null
  created_at?: string | null
  completed_at?: string | null
  viewer_url?: string | null
  result?: Record<string, unknown> | null
  report_versions?: Record<string, GrowthReportVersionCandidate | undefined>
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

function reportJobBrandKey(job: GrowthReportJobCandidate) {
  const initial = job.report_versions?.initial
  return candidateText(job.result?.brand_key)
    || candidateText(initial?.result?.brand_key)
}

function reportJobTimestamp(job: GrowthReportJobCandidate) {
  const initial = job.report_versions?.initial
  return candidateText(initial?.created_at)
    || candidateText(job.generated_at)
    || candidateText(job.completed_at)
    || candidateText(job.created_at)
}

export function selectLatestGrowthV3ReportReference(
  jobs: GrowthReportJobCandidate[],
  identity: { growthBrandKey?: string | null; brandName?: string | null }
): GrowthReportViewerReference | null {
  const targetBrandKey = candidateText(identity.growthBrandKey)
  const targetBrandName = candidateText(identity.brandName).toLocaleLowerCase()

  const matches = jobs.flatMap((job) => {
    if (!['completed', 'needs_review'].includes(candidateText(job.status).toLocaleLowerCase())) return []
    const initial = job.report_versions?.initial
    const initialResult = candidateRecord(initial?.result)
    const templateVersion = candidateText(job.report_template_version || initialResult.report_template_version).toLocaleLowerCase()
    if (templateVersion !== 'v3') return []

    const jobBrandKey = reportJobBrandKey(job)
    const sameBrand = targetBrandKey
      ? jobBrandKey === targetBrandKey
      : Boolean(targetBrandName && candidateText(job.brand_name).toLocaleLowerCase() === targetBrandName)
    if (!sameBrand) return []

    const reportVersionId = candidateText(initial?.report_version_id)
    if (!REPORT_VERSION_ID.test(reportVersionId)) return []
    return [{
      timestamp: reportJobTimestamp(job),
      reference: {
        reportVersionId,
        viewerUrl: candidateText(initial?.viewer_url) || candidateText(job.viewer_url) || undefined,
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
