import { NextResponse } from 'next/server'

function getDeleteCookieHeaders(request: Request) {
  const headers = new Headers()
  
  const appendDeleteCookies = (domain?: string) => {
    const domainStr = domain ? `; Domain=${domain}` : ''
    const base = `session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly${domainStr}`
    
    // 1. SameSite=Lax (Standard)
    headers.append('Set-Cookie', `${base}; SameSite=Lax`)
    headers.append('Set-Cookie', `${base}; SameSite=Lax; Secure`)
    
    // 2. SameSite=None (Cross-site / Embedded)
    headers.append('Set-Cookie', `${base}; SameSite=None; Secure`)
    
    // 3. SameSite=Strict
    headers.append('Set-Cookie', `${base}; SameSite=Strict`)
    headers.append('Set-Cookie', `${base}; SameSite=Strict; Secure`)

    // 4. Default SameSite (Browser fallback)
    headers.append('Set-Cookie', `${base}`)
    headers.append('Set-Cookie', `${base}; Secure`)
  }

  // A. Clear on host-only (no domain specified)
  appendDeleteCookies()

  const host = request.headers.get('host') || ''
  const hostname = host.split(':')[0]
  
  if (hostname) {
    // B. Clear on the exact hostname and dotted hostname
    appendDeleteCookies(hostname)
    appendDeleteCookies(`.${hostname}`)

    // C. Resolve parent domain if current host is a subdomain
    if (hostname.includes('.')) {
      const parts = hostname.split('.')
      if (parts.length >= 2) {
        const isLocalhost = parts[parts.length - 1] === 'localhost'
        const parentDomain = isLocalhost ? 'localhost' : parts.slice(-2).join('.')
        
        // Clear on parent domain and dotted parent domain
        appendDeleteCookies(parentDomain)
        appendDeleteCookies(`.${parentDomain}`)
      }
    }
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
  const redirectTo = searchParams.get('redirectTo') || '/'
  const headers = getDeleteCookieHeaders(request)
  
  return NextResponse.redirect(new URL(redirectTo, request.url), {
    headers,
  })
}




