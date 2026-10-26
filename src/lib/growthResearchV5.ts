import type { GrowthBrandIntelligenceJob } from './growthDataCenter'
import { createHash } from 'node:crypto'

export type ResearchRequest = {
  id: string; requestKey: string; jobId?: string; status: string; startedAt: string
  baseReport: string; blockers?: Array<{ code?: string; message?: string }>; error?: string
  reuseJobId?: string
}
export function researchReportIdentity(report: unknown) {
  const r = (report || {}) as Record<string, unknown>
  return createHash('sha256').update(JSON.stringify([r.snapshotId, r.reportVersionId, r.generatedAt, r.reportMarkdown, r.reportContent])).digest('hex')
}
export function researchRequestStatus(job: GrowthBrandIntelligenceJob) {
  if (['failed', 'cancelled'].includes(String(job.status))) return String(job.status)
  if (job.status === 'evidence_review') return 'needs_confirmation'
  if (['initial_ready', 'completed', 'needs_review'].includes(String(job.status))) return 'completed'
  return ['generating_initial', 'evidence_approved'].includes(String(job.status))
    || job.requested_stage === 'initial' ? 'generating' : 'collecting'
}

export function v5ResearchReport(brand: { id: string; name: string }, job: GrowthBrandIntelligenceJob) {
  const initial = (job.report_versions?.initial || {}) as Record<string, any>
  const result = (initial.result || job.result || {}) as Record<string, any>
  const template = job.report_template_version || result.report_template_version
  if (template !== 'v5') return null
  const markdown = job.latest_report_markdown || job.latest_report_content || initial.report_content || ''
  if (!markdown.trim()) throw new Error('growth_research_report_missing')
  const pdfDownloadPath = job.latest_report_pdf_download_path || initial.pdf_download_path || result.pdf_download_path || ''
  return {
    generatedAt: job.generated_at || result.generated_at || initial.created_at || new Date().toISOString(),
    sourceSystem: 'amc-growth' as const, growthJobId: job.job_id || '',
    growthBrandKey: result.brand_key || '', reportTier: 'initial',
    reportTemplateVersion: 'v5', reportVersionId: String(job.report_version_id || initial.report_version_id || ''),
    reportMarkdown: markdown, reportPath: job.latest_report_path || initial.report_path || result.report_path || '',
    viewerUrl: job.viewer_url || initial.viewer_url || '', markdownDownloadPath: job.markdown_download_url || initial.markdown_download_url || '',
    pdfReportPath: job.latest_report_pdf_path || result.pdf_report_path || '', pdfDownloadPath,
    pdfDownloadUrl: pdfDownloadPath ? `/api/brands/${encodeURIComponent(brand.id)}/research-report?format=pdf` : '',
    sourcePayload: { jobId: job.job_id, evidenceSnapshotId: job.initial_evidence_snapshot_id || job.latest_evidence_snapshot_id,
      reportVersionId: String(job.report_version_id || initial.report_version_id || ''),
      reportTemplateVersion: 'v5', reportTemplateRevision: result.report_template_revision },
    summary: `${brand.name}的商家调研报告 V5 已生成。`, dataSources: ['AMC-Growth 商家调研报告 V5'],
    brandImage: '', marketingStatus: '', marketAnalysis: '', competitors: [], issues: [], growthPoints: [], missingQuestions: [],
  }
}
