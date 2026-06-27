import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const response = NextResponse.json({ success: true })

  const appendDeleteCookies = (domain?: string) => {
    const domainStr = domain ? `; Domain=${domain}` : ''
    const base = `session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly${domainStr}`
    
    // 1. SameSite=Lax (Standard)
    response.headers.append('Set-Cookie', `${base}; SameSite=Lax`)
    response.headers.append('Set-Cookie', `${base}; SameSite=Lax; Secure`)
    
    // 2. SameSite=None (Cross-site / Embedded)
    response.headers.append('Set-Cookie', `${base}; SameSite=None; Secure`)
    
    // 3. SameSite=Strict
    response.headers.append('Set-Cookie', `${base}; SameSite=Strict`)
    response.headers.append('Set-Cookie', `${base}; SameSite=Strict; Secure`)

    // 4. Default SameSite (Browser fallback)
    response.headers.append('Set-Cookie', `${base}`)
    response.headers.append('Set-Cookie', `${base}; Secure`)
  }

  // A. Clear on host-only (no domain specified)
  appendDeleteCookies()

  const host = request.headers.get('host') || ''
  const hostname = host.split(':')[0]
  
  if (hostname) {
    // B. Clear on the exact hostname and dotted hostname (e.g. amc-mm.localhost, .amc-mm.localhost)
    appendDeleteCookies(hostname)
    appendDeleteCookies(`.${hostname}`)

    // C. Resolve parent domain if current host is a subdomain
    if (hostname.includes('.')) {
      const parts = hostname.split('.')
      if (parts.length >= 2) {
        const isLocalhost = parts[parts.length - 1] === 'localhost'
        const parentDomain = isLocalhost ? 'localhost' : parts.slice(-2).join('.')
        
        // Clear on parent domain
        appendDeleteCookies(parentDomain)
        
        // Clear on dotted parent domain
        appendDeleteCookies(`.${parentDomain}`)
      }
    }
  }

  return response
}



