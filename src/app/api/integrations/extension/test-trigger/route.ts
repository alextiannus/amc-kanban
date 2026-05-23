import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'
import { sendExtensionCommand } from '@/lib/integrations/extensionBridge'
import { actorFromContext, writeAuditLog } from '@/lib/audit'

/**
 * POST /api/integrations/extension/test-trigger
 * Allows developers or store owners to manually trigger an automation command
 * down to the connected Chrome Extension for verification.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, platform, reviewId, replyText } = body

  if (!brandId || !platform || !reviewId || !replyText) {
    return NextResponse.json({ error: 'brandId, platform, reviewId, and replyText are required' }, { status: 400 })
  }

  // Verify permissions
  const hasAccess = await canHumanAccessBrandProject(brandId, session.user.id, session.user.role)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    console.log(`[Extension Test Trigger] Relay command to brand ${brandId}: platform=${platform}, reviewId=${reviewId}`)
    writeAuditLog({
      actor: actorFromContext(session.user),
      action: 'EXTENSION_CMD_SEND',
      resourceId: brandId,
      resourceType: 'ExtensionBridge',
      reason: `手动测试触发自动回复 (平台: ${platform}, 评论 ID: ${reviewId})。`,
    }).catch(console.error)
    const result = await sendExtensionCommand(brandId, 'domestic_reply_review', {
      platform,
      reviewId,
      replyText
    })
    return NextResponse.json({ success: true, result })
  } catch (e: any) {
    console.error('[Extension Test Trigger] Error:', e)
    return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 502 })
  }
}
