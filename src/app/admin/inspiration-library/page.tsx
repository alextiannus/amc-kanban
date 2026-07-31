import { createHmac } from 'crypto'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

type LabTokenPayload = {
  sub: string
  email?: string
  role: 'ADMIN' | 'AMC_PRINCIPAL' | 'RESEARCHER'
  exp: number
}

export default async function InspirationLibraryEntryPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/')
  const roles = session.user.userRoles || []
  const role = session.user.role === 'ADMIN' || roles.includes('ADMIN')
    ? 'ADMIN'
    : roles.includes('AMC_PRINCIPAL') ? 'AMC_PRINCIPAL'
      : roles.includes('RESEARCHER') ? 'RESEARCHER' : null
  if (!role) redirect('/admin')

  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')

  const contentUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '')
    || (isLocal ? 'http://localhost:4010' : undefined)
  const secret = process.env.AMC_CONTENT_LAB_TOKEN_SECRET?.trim()
    || process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim()
    || (isLocal ? 'local-internal-token' : undefined)

  if (contentUrl && secret) {
    const token = signLabToken({
      sub: session.user.id,
      email: session.user.email,
      role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }, secret)
    redirect(`${contentUrl}/admin/inspiration-library#labToken=${encodeURIComponent(token)}`)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <div className="mx-auto max-w-2xl rounded-md border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-semibold">爆品素材库由 amc-content 提供</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Kanban 已验证你的访问权限，但尚未配置内容服务地址或共享签名密钥。
        </p>
        <dl className="mt-5 space-y-2 text-sm">
          <div className="grid grid-cols-[220px_1fr] gap-3">
            <dt className="text-slate-500">AMC_CONTENT_SERVICE_URL</dt>
            <dd className="font-medium">{contentUrl ? 'configured' : 'missing'}</dd>
          </div>
          <div className="grid grid-cols-[220px_1fr] gap-3">
            <dt className="text-slate-500">Lab token secret</dt>
            <dd className="font-medium">{secret ? 'configured' : 'missing'}</dd>
          </div>
        </dl>
        <Link
          href="/admin"
          className="mt-6 inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          返回 Admin
        </Link>
      </div>
    </main>
  )
}

function signLabToken(payload: LabTokenPayload, secret: string): string {
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(payloadPart).digest('base64url')
  return `${payloadPart}.${signature}`
}
