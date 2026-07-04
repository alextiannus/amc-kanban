import { NextResponse } from 'next/server'

function getDeleteCookieHeaders(request: Request) {
  const headers = new Headers()
  const requestUrl = new URL(request.url)
  const secure = requestUrl.protocol === 'https:' ? '; Secure' : ''

  const appendDeleteCookie = (domain?: string) => {
    const domainStr = domain ? `; Domain=${domain}` : ''
    headers.append(
      'Set-Cookie',
      `session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax${domainStr}${secure}`,
    )
  }

  appendDeleteCookie()

  const hostname = requestUrl.hostname.toLowerCase()
  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  if (hostname !== 'localhost' && !isIpv4 && hostname.includes('.')) {
    appendDeleteCookie(hostname)
    const parentDomain = hostname.split('.').slice(-2).join('.')
    if (parentDomain !== hostname) appendDeleteCookie(`.${parentDomain}`)
  }

  return headers
}

export async function POST(request: Request) {
  const headers = getDeleteCookieHeaders(request)
  return new NextResponse(JSON.stringify({ success: true }), {
    status: 200,
    headers,
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const requestedRedirect = searchParams.get('redirectTo')
  const redirectTo =
    requestedRedirect?.startsWith('/') && !requestedRedirect.startsWith('//')
      ? requestedRedirect
      : '/'
  const headers = getDeleteCookieHeaders(request)
  
  return NextResponse.redirect(new URL(redirectTo, request.url), {
    headers,
  })
}


