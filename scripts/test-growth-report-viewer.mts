import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  canUseGrowthStandaloneReport,
  growthReportSsoHref,
  growthReportStandalonePath,
  selectLatestGrowthV3ReportReference,
} from '../src/lib/growthReportViewer.ts'

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

const latest = selectLatestGrowthV3ReportReference([
  {
    status: 'completed',
    brand_name: '东北人餐厅',
    report_template_version: 'v3',
    created_at: '2026-08-29T15:12:00.000Z',
    result: { brand_key: 'jalan-besar-416870473e' },
    report_versions: { initial: { report_version_id: '39', viewer_url: '/dashboard/reports/versions/39', created_at: '2026-08-29T15:12:00.000Z' } },
  },
  {
    status: 'completed',
    brand_name: '东北人餐厅',
    report_template_version: 'v3',
    created_at: '2026-08-24T06:22:00.000Z',
    result: { brand_key: 'jalan-besar-416870473e' },
    report_versions: { initial: { report_version_id: '12', created_at: '2026-08-24T06:22:00.000Z' } },
  },
  {
    status: 'completed',
    brand_name: '东北人餐厅',
    report_template_version: 'v3',
    created_at: '2026-08-30T06:22:00.000Z',
    result: { brand_key: 'another-brand' },
    report_versions: { initial: { report_version_id: '99', created_at: '2026-08-30T06:22:00.000Z' } },
  },
], { growthBrandKey: 'jalan-besar-416870473e', brandName: '东北人餐厅' })
assert.deepEqual(latest, {
  reportVersionId: '39',
  viewerUrl: '/dashboard/reports/versions/39',
})

assert.deepEqual(
  selectLatestGrowthV3ReportReference([{
    status: 'needs_review',
    brand_name: '东北人餐厅',
    report_versions: { initial: { report_version_id: '41', result: { report_template_version: 'v3' } } },
  }], { brandName: ' 东北人餐厅 ' }),
  { reportVersionId: '41', viewerUrl: undefined }
)

assert.equal(
  selectLatestGrowthV3ReportReference([{
    status: 'completed',
    brand_name: '东北人餐厅',
    report_template_version: 'v2',
    report_versions: { initial: { report_version_id: '42' } },
  }], { brandName: '东北人餐厅' }),
  null
)

const brandPlanService = readFileSync(new URL('../src/lib/brand-plan/service.ts', import.meta.url), 'utf8')
const currentWorkspaceReport = brandPlanService.indexOf('normalizeResearchReport(marketingSolution.researchReport)')
const legacyDedicatedReport = brandPlanService.indexOf('normalizeResearchReport(brand.knowledge?.researchReport)', currentWorkspaceReport)
assert(currentWorkspaceReport > 0 && legacyDedicatedReport > currentWorkspaceReport, 'current marketingSolution report must win over legacy report storage')

const brandProfileView = readFileSync(new URL('../src/components/dashboard/BrandProfileView.tsx', import.meta.url), 'utf8')
assert(brandProfileView.includes('href={report ? growthResearchReportHref : undefined}'), 'report view button must use the server-side latest-version resolver')

console.log('Growth report viewer link tests passed.')
