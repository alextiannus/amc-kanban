import { authenticateCurrentSession, canAccessBrandScope } from '@/lib/auth-v2'
import { allows } from '@/lib/role-permissions/store'
import { labSecret, signAccessIdentity } from '@/lib/role-permissions/token'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const respond = (body: unknown, status = 200) => Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store' },
  })
  try {
    const principal = await authenticateCurrentSession()
    if (!principal) return respond({ error: '登录已失效，请重新登录 MM', code: 'AUTH_REQUIRED' }, 401)
    const body = await request.json().catch(() => null)
    const brandId = typeof body?.brandId === 'string' ? body.brandId.trim() : ''
    if (!brandId || brandId.length > 200) return respond({ error: 'brandId is required', code: 'INVALID_BRAND' }, 400)
    if (!await canAccessBrandScope(principal, brandId)) {
      return respond({ error: '没有该品牌授权', code: 'BRAND_ACCESS_DENIED' }, 403)
    }
    if (!await allows(principal, 'content.video-making.read')) {
      return respond({ error: '没有视频制作查看权限，请联系管理员配置角色权限', code: 'VIDEO_ACCESS_DENIED' }, 403)
    }
    if (!labSecret()) return respond({ error: '视频身份服务尚未配置', code: 'IDENTITY_UNAVAILABLE' }, 503)
    return respond({ identity: signAccessIdentity(principal, brandId) })
  } catch {
    return respond({ error: '视频权限服务暂不可用，请稍后重试', code: 'PERMISSION_SERVICE_UNAVAILABLE' }, 503)
  }
}
