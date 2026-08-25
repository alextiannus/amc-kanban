import { createHmac } from 'crypto'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { authenticateCurrentSession, canAccessBrand } from '@/lib/auth-v2'

type VideoProductionPageProps = {
  searchParams: Promise<{ brandId?: string | string[] }>
}

type LabTokenPayload = {
  sub: string
  email?: string
  role: 'ADMIN' | 'AMC_PRINCIPAL'
  brandId?: string
  exp: number
}

export default async function VideoProductionEntryPage({ searchParams }: VideoProductionPageProps) {
  const principal = await authenticateCurrentSession()
  if (!principal) redirect('/')
  const role = principal.globalRoles.includes('ADMIN')
    ? 'ADMIN'
    : principal.globalRoles.includes('AMC_PRINCIPAL') ? 'AMC_PRINCIPAL' : null
  if (!role) redirect('/admin')

  const params = await searchParams
  const rawBrandId = Array.isArray(params.brandId) ? params.brandId[0] : params.brandId
  const brandId = rawBrandId?.trim() || undefined
  if (brandId && !await canAccessBrand(principal, brandId, 'brand.read')) redirect('/admin')
  if (role === 'AMC_PRINCIPAL' && !brandId) redirect('/admin')

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
      sub: principal.userId,
      email: principal.email,
      role,
      brandId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    }, secret)
    const query = brandId ? `?brandId=${encodeURIComponent(brandId)}` : ''
    redirect(`${contentUrl}/admin/video-production${query}#labToken=${encodeURIComponent(token)}`)
  }

  return (
    <main className="min-h-screen bg-amber-50 px-6 py-10 text-slate-950">
      <div className="mx-auto max-w-2xl rounded-xl border border-amber-200 bg-white p-6">
        <h1 className="text-xl font-semibold">视频生产由 AMC-Content 提供</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Kanban 已验证身份与商家权限，但 AMC-Content 服务地址或共享签名密钥尚未配置。
        </p>
        <dl className="mt-5 space-y-2 text-sm">
          <div className="grid grid-cols-[220px_1fr] gap-3"><dt className="text-slate-500">AMC_CONTENT_SERVICE_URL</dt><dd className="font-medium">{contentUrl ? 'configured' : 'missing'}</dd></div>
          <div className="grid grid-cols-[220px_1fr] gap-3"><dt className="text-slate-500">Lab token secret</dt><dd className="font-medium">{secret ? 'configured' : 'missing'}</dd></div>
        </dl>
        <Link href="/admin" className="mt-6 inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700">返回 Admin</Link>
      </div>
    </main>
  )
}

function signLabToken(payload: LabTokenPayload, secret: string): string {
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(payloadPart).digest('base64url')
  return `${payloadPart}.${signature}`
}
