import { NextRequest, NextResponse } from 'next/server'
import {
  SUBSCRIPTION_TERMS_FILENAME,
  SUBSCRIPTION_TERMS_TITLE,
  SUBSCRIPTION_TERMS_VERSION,
  buildSubscriptionTermsPdf,
  getSubscriptionTermsMarkdown,
} from '@/lib/subscription/terms'

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format')
  const markdown = getSubscriptionTermsMarkdown()

  if (format === 'pdf') {
    const pdf = buildSubscriptionTermsPdf(markdown)
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${SUBSCRIPTION_TERMS_FILENAME}"`,
        'cache-control': 'public, max-age=300',
      },
    })
  }

  if (format === 'md' || format === 'markdown') {
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    })
  }

  return NextResponse.json({
    title: SUBSCRIPTION_TERMS_TITLE,
    version: SUBSCRIPTION_TERMS_VERSION,
    markdown,
    pdfFilename: SUBSCRIPTION_TERMS_FILENAME,
  }, {
    headers: {
      'cache-control': 'public, max-age=300',
    },
  })
}
