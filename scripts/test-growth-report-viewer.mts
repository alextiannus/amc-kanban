import assert from 'node:assert/strict'
import {
  canUseGrowthStandaloneReport,
  growthReportSsoHref,
  growthReportStandalonePath,
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

console.log('Growth report viewer link tests passed.')
