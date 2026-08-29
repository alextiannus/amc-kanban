import { NextResponse } from 'next/server'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { getBrandPlan } from '@/lib/brand-plan/service'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'

type Params = { params: Promise<{ id: string }> }

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderReportPage(input: {
  brandName: string
  generatedAt?: string
  growthJobId?: string
  reportTier?: string
  reportPath?: string
  pdfDownloadUrl?: string
  pdfDownloadPath?: string
  rawReport: string
}) {
  const generatedAt = input.generatedAt ? new Date(input.generatedAt).toLocaleString('zh-SG') : '未记录'
  const pdfUrl = input.pdfDownloadUrl || input.pdfDownloadPath || ''
  const pdfLink = pdfUrl
    ? `<a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noreferrer">打开 PDF 原件</a>`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.brandName)} - AMC-Growth 品牌摸底报告</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111827;
      background: #f6f8fb;
    }
    body { margin: 0; }
    main { max-width: 1120px; margin: 0 auto; padding: 40px 24px 64px; }
    header {
      border: 1px solid #dbe5f4;
      background: #ffffff;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.06);
    }
    .eyebrow {
      margin: 0 0 8px;
      color: #2563eb;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h1 { margin: 0; font-size: clamp(26px, 4vw, 40px); line-height: 1.1; letter-spacing: 0; }
    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 22px;
      color: #475569;
      font-size: 13px;
      font-weight: 650;
    }
    .meta span { display: block; color: #0f172a; font-weight: 850; margin-bottom: 4px; }
    .actions { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
    .actions a {
      display: inline-flex;
      align-items: center;
      min-height: 36px;
      padding: 0 14px;
      border-radius: 8px;
      background: #2563eb;
      color: #ffffff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 850;
    }
    section {
      margin-top: 18px;
      border: 1px solid #dbe5f4;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
    }
    .section-title {
      border-bottom: 1px solid #e2e8f0;
      padding: 14px 18px;
      color: #334155;
      font-size: 13px;
      font-weight: 900;
    }
    pre {
      margin: 0;
      padding: 22px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      color: #1f2937;
      font: 13px/1.7 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      background: #ffffff;
    }
    @media (max-width: 640px) {
      main { padding: 20px 14px 40px; }
      header { padding: 18px; }
      pre { padding: 16px; font-size: 12px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">AMC-Growth Original Research</p>
      <h1>${escapeHtml(input.brandName)} 品牌摸底报告</h1>
      <div class="meta">
        <div><span>生成时间</span>${escapeHtml(generatedAt)}</div>
        <div><span>Growth Job</span>${escapeHtml(input.growthJobId || '未记录')}</div>
        <div><span>报告层级</span>${escapeHtml(input.reportTier || '未记录')}</div>
        <div><span>原始路径</span>${escapeHtml(input.reportPath || '未记录')}</div>
      </div>
      ${pdfLink ? `<div class="actions">${pdfLink}</div>` : ''}
    </header>
    <section>
      <div class="section-title">原始报告正文</div>
      <pre>${escapeHtml(input.rawReport)}</pre>
    </section>
  </main>
</body>
</html>`
}

export async function GET(request: Request, { params }: Params) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const canRead = await canSessionAccessBrandProject(id, auth.user.id, auth.user.type, auth.user.role)
  if (!canRead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data = await getBrandPlan(id)
  if (!data) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const report = data.marketingSolution.researchReport
  const rawReport = report?.reportMarkdown || report?.reportContent || ''
  if (!report || !rawReport) {
    return new NextResponse(
      renderReportPage({
        brandName: data.brand.name,
        rawReport: '暂无 AMC-Growth 原始摸底报告内容。请先在品牌策划页生成品牌摸底报告。',
      }),
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  return new NextResponse(
    renderReportPage({
      brandName: data.brand.name,
      generatedAt: report.generatedAt,
      growthJobId: report.growthJobId,
      reportTier: report.reportTier,
      reportPath: report.reportPath,
      pdfDownloadUrl: report.pdfDownloadUrl,
      pdfDownloadPath: report.pdfDownloadPath,
      rawReport,
    }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}
