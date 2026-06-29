/**
 * POST /api/admin/email/test
 * ─────────────────────────────────────────────────────────────────────────────
 * 发送测试邮件，验证当前 SMTP 配置是否有效。
 * 仅 Admin 可调用。
 */
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sendEmail, getSmtpConfig } from '@/lib/email'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const to: string | undefined = body?.to?.trim()

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: '请提供有效的收件人邮箱' }, { status: 400 })
  }

  const smtp = await getSmtpConfig()
  if (!smtp) {
    return NextResponse.json({ error: 'SMTP 未配置，请先在系统设置中填写邮件配置' }, { status: 400 })
  }

  const result = await sendEmail({
    to,
    subject: '【AMC】邮件配置测试',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 40px auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <h2 style="color: #6366f1; margin: 0 0 16px;">✅ 邮件配置测试成功！</h2>
        <p style="color: #374151; line-height: 1.6;">
          如果您收到这封邮件，说明 AMC 的 SMTP 邮件配置已正确设置。
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 13px;">
          发件服务器：${smtp.host}:${smtp.port}<br/>
          发件人：${smtp.fromName} &lt;${smtp.from}&gt;<br/>
          发送时间：${new Date().toLocaleString('zh-CN')}
        </p>
      </div>
    `,
    text: `AMC 邮件配置测试 — 如果您收到这封邮件，说明 SMTP 配置已正确。\n服务器：${smtp.host}:${smtp.port}`,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? '发送失败', details: result }, { status: 500 })
  }

  return NextResponse.json({ ok: true, messageId: result.messageId, to })
}
