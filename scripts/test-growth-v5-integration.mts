import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { researchReportIdentity, researchRequestStatus, v5ResearchReport } from '../src/lib/growthResearchV5.ts'
import { selectLatestGrowthV3ReportVersionReference } from '../src/lib/growthReportViewer.ts'
import { renderResearchMarkdownPage } from '../src/lib/researchMarkdownPage.ts'

delete process.env.DATABASE_URL
let knowledge: any = { brandId: 'fixture', researchReport: { summary: 'Old report', generatedAt: '2026-10-01' }, marketingSolution: { annualPlan: { goal: 'Keep plan' } } }
let snapshots: any[] = []
let tail = Promise.resolve()
const db: any = {
  $extends: () => db, $executeRaw: async () => 1,
  brandKnowledge: {
    findUnique: async () => structuredClone(knowledge),
    upsert: async ({ create, update }: any) => (knowledge = knowledge ? { ...knowledge, ...structuredClone(update) } : structuredClone(create)),
    update: async ({ data }: any) => (knowledge = { ...knowledge, ...structuredClone(data) }),
  },
  brandGrowthResearchSnapshot: {
    findFirst: async ({ where }: any) => snapshots.find(s => s.dataHash === where.dataHash) || null,
    create: async ({ data }: any) => { const row = { ...data, id: `snapshot-${snapshots.length + 1}` }; snapshots.push(row); return row },
  },
}
db.$transaction = (fn: any) => { const result = tail.then(() => fn(db)); tail = result.catch(() => {}); return result }
;(globalThis as any).prisma = db
const { startResearchRequest, synchronizeResearchRequest } = await import('../src/lib/brand-plan/researchRequests.ts')
const brand: any = { id: 'fixture', name: 'Fixture 餐厅', location: 'Singapore', address: '1 Test Road', industry: 'Restaurant',
  updatedAt: new Date(), accounts: [], subscriptions: [], owners: [], socialInsightReviews: [], assets: [], brandPlanInterviews: [], gameConfig: null }
const currentBrand = () => ({ ...brand, knowledge: structuredClone(knowledge) })
const originalFetch = globalThis.fetch
const requests: any[] = []
const complete: any = { job_id: 'job-1', status: 'initial_ready', report_template_version: 'v5', report_version_id: '101',
  latest_evidence_snapshot_id: '267', initial_evidence_snapshot_id: '267', latest_report_markdown: '# 餐厅调研\n\n## 公司概况\n完整正文。\n\n## 社交媒体概览\n已找到官方账号。\n\n## 新闻动态\n\n近期未见公告。',
  generated_at: '2026-10-26', latest_report_pdf_download_path: '/public/downloads/brand-intelligence-intake/fixture/a.pdf', result: { report_template_version: 'v5', report_template_revision: 'merchant-research-v5.1' } }
try {
  const [a, b] = await Promise.all([startResearchRequest(currentBrand()), startResearchRequest(currentBrand())])
  assert.equal(a.id, b.id); assert.equal(knowledge.marketingSolution.annualPlan.goal, 'Keep plan')
  globalThis.fetch = async (_url, init) => { requests.push(JSON.parse(String(init?.body || '{}'))); throw Error('unknown outcome') }
  await synchronizeResearchRequest(currentBrand())
  assert.equal(knowledge.marketingSolution.researchRequest.id, a.id); assert.equal(snapshots.length, 0)
  globalThis.fetch = async (_url, init) => { requests.push(JSON.parse(String(init?.body || '{}'))); return Response.json({ job_id: 'job-1', status: 'queued' }) }
  await synchronizeResearchRequest(currentBrand())
  assert.equal(requests.length, 2); assert.equal(requests[0].report_template_version, 'v5'); assert.equal(requests[0].auto_generate_report, true)
  assert.equal(requests[0].report_tier, 'initial'); assert.equal(requests[0].generate_advanced, false)
  assert.equal(knowledge.marketingSolution.researchRequest.jobId, 'job-1'); assert.equal(knowledge.researchReport.summary, 'Old report')
  globalThis.fetch = async () => Response.json(complete)
  await Promise.all([synchronizeResearchRequest(currentBrand()), synchronizeResearchRequest(currentBrand())])
  assert.equal(snapshots.length, 1); assert.equal(knowledge.researchReport.reportMarkdown, complete.latest_report_markdown)
  assert.equal(knowledge.marketingSolution.researchReport.snapshotId, 'snapshot-1'); assert.equal(knowledge.marketingSolution.annualPlan.goal, 'Keep plan')
  assert(!knowledge.researchReport.structuredReport); assert(!knowledge.researchReport.jsonDownloadPath)
  const saved = structuredClone(knowledge.researchReport)
  await startResearchRequest(currentBrand()); knowledge.marketingSolution.researchReport = { ...saved, reportMarkdown: 'New manual revision' }
  globalThis.fetch = async () => Response.json(complete)
  await synchronizeResearchRequest(currentBrand())
  assert.equal(knowledge.marketingSolution.researchRequest.status, 'superseded')
  assert.equal(knowledge.marketingSolution.researchReport.reportMarkdown, 'New manual revision'); assert.equal(snapshots.length, 1)
  await startResearchRequest(currentBrand())
  globalThis.fetch = async () => Response.json({ job_id: 'job-1', status: 'failed' })
  await synchronizeResearchRequest(currentBrand()); assert.equal(knowledge.marketingSolution.researchRequest.status, 'failed')
  assert.equal(knowledge.marketingSolution.researchReport.reportMarkdown, 'New manual revision')
  assert.equal(researchRequestStatus({ status: 'evidence_review' }), 'needs_confirmation')
  assert.equal(researchRequestStatus({ status: 'queued', requested_stage: 'initial' }), 'generating')
  assert.equal(v5ResearchReport(brand, { report_template_version: 'v3' }), null)
  assert.equal(researchReportIdentity(saved).length, 64)
  const preferred = selectLatestGrowthV3ReportVersionReference([{ tier: 'initial', report_version_id: '1', created_at: '2026-10-25', result: { report_template_version: 'v5' } }, { tier: 'initial', report_version_id: '2', created_at: '2026-10-26', result: { report_template_version: 'v3' } }])
  assert.equal(preferred?.reportVersionId, '1')
  const markdown = `${complete.latest_report_markdown}\n\n## 公司概况\n重复标题。\n\n| 项目 | 内容 |\n| --- | --- |\n| 地址 | 1 Test Road |\n\n<script>alert(1)</script>\n\n[坏链接](javascript:alert(1))\n\n## 参考来源\n[官网](https://example.com)`
  const html = renderResearchMarkdownPage({ brandName: brand.name, markdown, downloadBase: '/api/brands/fixture/research-report', hasPdf: true })
  assert(html.includes('<table>')); assert(html.includes('id="公司概况-2"')); assert(!html.includes('<script>')); assert(!html.includes('href="javascript:'))
  assert(!html.includes('format=json')); assert.equal((html.match(/<h1/g) || []).length, 1)
  const mmRenderer = ['../../amc-mm/src/lib/researchMarkdownPage.ts', '../../../amc-mm/src/lib/researchMarkdownPage.ts']
    .map(relative => new URL(relative, import.meta.url)).find(file => existsSync(file))
  if (mmRenderer) assert.equal(readFileSync(mmRenderer, 'utf8'), readFileSync(new URL('../src/lib/researchMarkdownPage.ts', import.meta.url), 'utf8'))
  mkdirSync('output/report-v5-integration', { recursive: true }); writeFileSync('output/report-v5-integration/preview.html', html)
  console.log('PASS V5: async request recovery, duplicate clicks, snapshot save, prior-report protection, stale completion, V3 compatibility, Markdown safety, TOC and export parity. No DB or suppliers called.')
} finally { globalThis.fetch = originalFetch }
