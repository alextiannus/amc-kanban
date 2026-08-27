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

type Params = { params: Promise<{ id: string }> }

export default async function InspirationCreativeEntryPage({ params }: Params) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/')
  const roles = session.user.userRoles || []
  const role = session.user.role === 'ADMIN' || roles.includes('ADMIN')
    ? 'ADMIN'
    : roles.includes('AMC_PRINCIPAL') ? 'AMC_PRINCIPAL'
      : roles.includes('RESEARCHER') ? 'RESEARCHER' : null
  if (!role) redirect('/admin')

  const { id } = await params
  if (!/^cre_[A-Za-z0-9_-]+$/.test(id)) redirect('/admin/inspiration-library')

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
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    }, secret)
    redirect(`${contentUrl}/admin/inspiration-creatives/${encodeURIComponent(id)}#labToken=${encodeURIComponent(token)}`)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <div className="mx-auto max-w-2xl rounded-md border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-semibold">灵感详情由 amc-content 提供</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Kanban 已验证你的访问权限，但尚未配置内容服务地址或共享签名密钥。
        </p>
        <Link
          href="/admin/inspiration-library"
          className="mt-6 inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          返回灵感素材库
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
