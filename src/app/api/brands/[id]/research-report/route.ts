import { NextResponse } from 'next/server'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { getBrandPlan } from '@/lib/brand-plan/service'
import { GrowthDataCenterError, readGrowthReportArtifact } from '@/lib/growthDataCenter'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'

type Params = { params: Promise<{ id: string }> }

function filename(brandName: string, extension: string) {
  const safe = brandName.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'merchant'
  return `${safe}-objective-research-v3.${extension}`
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
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

  const format = new URL(request.url).searchParams.get('format') || 'markdown'
  if (format === 'markdown') {
    const markdown = report.reportMarkdown || report.reportContent || ''
    if (!markdown) return NextResponse.json({ error: 'Markdown not found' }, { status: 404 })
    return new Response(markdown, {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${filename(data.brand.name, 'md')}"`,
        'cache-control': 'private, no-store',
      },
    })
  }

  if (format === 'json') {
    if (!report.structuredReport) return NextResponse.json({ error: 'Structured report not found' }, { status: 404 })
    return new Response(`${JSON.stringify(report.structuredReport, null, 2)}\n`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${filename(data.brand.name, 'json')}"`,
        'cache-control': 'private, no-store',
      },
    })
  }

  if (format !== 'pdf') return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
  const pdfPath = report.pdfDownloadPath || report.pdfReportPath || ''
  if (!pdfPath) return NextResponse.json({ error: 'PDF not found' }, { status: 404 })
  try {
    const artifact = await readGrowthReportArtifact(pdfPath)
    return new Response(artifact.body, {
      headers: {
        'content-type': artifact.contentType.includes('pdf') ? artifact.contentType : 'application/pdf',
        'content-disposition': `attachment; filename="${filename(data.brand.name, 'pdf')}"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (error) {
    const status = error instanceof GrowthDataCenterError ? error.status : 502
    return NextResponse.json({ error: error instanceof Error ? error.message : 'PDF download failed' }, { status })
  }
}
