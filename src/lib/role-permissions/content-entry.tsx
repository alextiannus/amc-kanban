import Link from 'next/link'
import { redirect } from 'next/navigation'
import { authenticateCurrentSession, canAccessBrandScope } from '../auth-v2/index'
import { allows } from './store'
import { labSecret, signAccessIdentity } from './token'
export async function contentEntry(module: string, path: string, brandId?: string, needsBrand = false) {
  const principal = await authenticateCurrentSession()
  if (!principal) redirect('/')
  if (!await allows(principal, `content.${module}.read`)) return <main className="p-10"><h1>没有此功能的查看权限</h1><Link href="/board">返回看板</Link></main>
  if (brandId && !await canAccessBrandScope(principal, brandId)) return <main className="p-10">没有该品牌授权。<Link href="/board">返回看板</Link></main>
  if (needsBrand && !principal.globalRoles.includes('ADMIN') && !brandId) return <main className="p-10">请先在看板选择已授权品牌。<Link href="/board">返回看板</Link></main>
  const base = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '')
  if (!base || !labSecret()) return <main className="p-10">Content 服务入口尚未配置。<Link href="/board">返回看板</Link></main>
  const query = brandId ? `?brandId=${encodeURIComponent(brandId)}` : ''
  redirect(`${base}${path}${query}#labToken=${encodeURIComponent(signAccessIdentity(principal, brandId))}`)
}
