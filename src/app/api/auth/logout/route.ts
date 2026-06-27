import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const response = NextResponse.json({ success: true })

  // 1. Delete cookie on current host
  response.headers.append('Set-Cookie', 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax')

  // 2. Resolve parent domain if current host is a subdomain
  const host = request.headers.get('host') || ''
  const hostname = host.split(':')[0]
  
  if (hostname.includes('.')) {
    const parts = hostname.split('.')
    if (parts.length >= 2) {
      const isLocalhost = parts[parts.length - 1] === 'localhost'
      const parentDomain = isLocalhost ? 'localhost' : parts.slice(-2).join('.')
      
      // Delete on parent domain
      response.headers.append(
        'Set-Cookie',
        `session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Domain=${parentDomain}; HttpOnly; SameSite=Lax`
      )
      
      // Delete on dotted parent domain
      response.headers.append(
        'Set-Cookie',
        `session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Domain=.${parentDomain}; HttpOnly; SameSite=Lax`
      )
    }
  }

  return response
}


