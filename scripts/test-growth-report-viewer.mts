import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  canUseGrowthStandaloneReport,
  growthReportSsoHref,
  growthReportStandalonePath,
  selectLatestGrowthV3ReportVersionReference,
} from '../src/lib/growthReportViewer.ts'
import { publicKanbanOrigin } from '../src/lib/publicKanbanOrigin.ts'

assert.equal(
  growthReportStandalonePath({ viewerUrl: 'https://amc-growth.immedi.ai/dashboard/reports/versions/39' }),
  '/dashboard/reports/versions/39?view=standalone'
)
assert.equal(
  growthReportStandalonePath({ viewerUrl: '/dashboard/reports/versions/39?language=zh' }),
  '/dashboard/reports/versions/39?language=zh&view=standalone'
)
assert.equal(
  growthReportStandalonePath({ viewerUrl: '/dashboard/knowledge', reportVersionId: '40' }),
  '/dashboard/reports/versions/40?view=standalone'
)
assert.equal(growthReportStandalonePath({ viewerUrl: '/dashboard/knowledge' }), '')
assert.equal(growthReportStandalonePath({ reportVersionId: '../39' }), '')

const fallback = '/dashboard/brands/brand-1/research-report'
const ssoHref = growthReportSsoHref({ reportVersionId: '39' }, fallback)
const ssoUrl = new URL(ssoHref, 'https://amc-kanban.invalid')
assert.equal(ssoUrl.pathname, '/api/integrations/amc-growth/sso/start')
assert.equal(ssoUrl.searchParams.get('returnTo'), '/dashboard/reports/versions/39?view=standalone')
assert.equal(ssoUrl.searchParams.get('fallback'), fallback)

assert.equal(canUseGrowthStandaloneReport({ source: 'session', actorType: 'HUMAN', globalRoles: ['ADMIN'] }), true)
assert.equal(canUseGrowthStandaloneReport({ source: 'session', actorType: 'HUMAN', globalRoles: ['AMC_PRINCIPAL'] }), true)
assert.equal(canUseGrowthStandaloneReport({ source: 'session', actorType: 'HUMAN', globalRoles: ['BRAND_OWNER'] }), false)
assert.equal(canUseGrowthStandaloneReport({ source: 'api_key', actorType: 'HUMAN', globalRoles: ['ADMIN'] }), false)
assert.equal(canUseGrowthStandaloneReport({ source: 'session', actorType: 'AI_AGENT', globalRoles: ['ADMIN'] }), false)

const internalRenderRequest = new Request('https://localhost:10000/dashboard/brands/brand-1/research-report')
assert.equal(
  publicKanbanOrigin(internalRenderRequest, { production: true, configuredUrl: null }),
  'https://amc-kanban.immedi.ai'
)
assert.equal(
  publicKanbanOrigin(internalRenderRequest, { production: true, configuredUrl: 'https://localhost:10000' }),
  'https://amc-kanban.immedi.ai'
)
assert.equal(
  publicKanbanOrigin(internalRenderRequest, { production: true, configuredUrl: 'https://kanban-staging.immedi.ai/path' }),
  'https://kanban-staging.immedi.ai'
)
assert.equal(
  publicKanbanOrigin(internalRenderRequest, { production: false, configuredUrl: null }),
  'https://localhost:10000'
)

const latest = selectLatestGrowthV3ReportVersionReference([
  {
    tier: 'initial',
    created_at: '2026-08-29T15:12:00.000Z',
    result: { report_template_version: 'v3' },
    report_version_id: '39',
    viewer_url: '/dashboard/reports/versions/39',
  },
  {
    tier: 'initial',
    created_at: '2026-08-30T15:12:00.000Z',
    result: { report_template_version: 'v3' },
    report_version_id: '40',
    viewer_url: '/dashboard/reports/versions/40',
  },
  {
    tier: 'advanced',
    created_at: '2026-08-31T15:12:00.000Z',
    result: { report_template_version: 'v3' },
    report_version_id: '99',
  },
])
assert.deepEqual(latest, {
  reportVersionId: '40',
  viewerUrl: '/dashboard/reports/versions/40',
})

assert.deepEqual(
  selectLatestGrowthV3ReportVersionReference([{
    tier: 'initial',
    report_version_id: '41',
    result: { report_template_version: 'v3' },
  }]),
  { reportVersionId: '41', viewerUrl: undefined }
)

assert.equal(
  selectLatestGrowthV3ReportVersionReference([{
    tier: 'initial',
    report_version_id: '42',
    result: { report_template_version: 'v2' },
  }]),
  null
)

const brandPlanService = readFileSync(new URL('../src/lib/brand-plan/service.ts', import.meta.url), 'utf8')
const currentWorkspaceReport = brandPlanService.indexOf('normalizeResearchReport(marketingSolution.researchReport)')
const legacyDedicatedReport = brandPlanService.indexOf('normalizeResearchReport(brand.knowledge?.researchReport)', currentWorkspaceReport)
assert(currentWorkspaceReport > 0 && legacyDedicatedReport > currentWorkspaceReport, 'current marketingSolution report must win over legacy report storage')

const brandProfileView = readFileSync(new URL('../src/components/dashboard/BrandProfileView.tsx', import.meta.url), 'utf8')
assert(brandProfileView.includes('href={report ? growthResearchReportHref : undefined}'), 'report view button must use the server-side latest-version resolver')

const growthDataCenter = readFileSync(new URL('../src/lib/growthDataCenter.ts', import.meta.url), 'utf8')
assert(
  growthDataCenter.includes('/v1/admin/reports/${encodeURIComponent(brandKey)}/versions'),
  'latest report lookup must use the Growth report-version API'
)

const researchReportRoute = readFileSync(new URL('../src/app/dashboard/brands/[id]/research-report/route.ts', import.meta.url), 'utf8')
assert(
  researchReportRoute.includes('new URL(growthReportHref, publicKanbanOrigin(request))'),
  'server-side report redirect must never use the Render internal request origin'
)

console.log('Growth report viewer link tests passed.')
