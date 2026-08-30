export type GrowthReportViewerReference = {
  viewerUrl?: string
  reportVersionId?: string
}

type GrowthReportPrincipal = {
  source?: string
  actorType?: string
  globalRoles?: string[]
}

const GROWTH_STAFF_ROLES = new Set(['ADMIN', 'AMC_PRINCIPAL'])
const REPORT_VERSION_PATH = /^\/dashboard\/reports\/versions\/\d+$/

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
