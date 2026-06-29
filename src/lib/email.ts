/**
 * src/lib/email.ts
 * ────────────────────────────────────────────────────────────────────────────
 * SMTP 邮件发送库
 *
 * 配置来源：SystemConfig DB（Admin → System → Email 配置面板）
 * 依赖：nodemailer
 *
 * 遵守 system-config-rules：所有凭证存储于 DB，不写 Render 环境变量。
 */

import nodemailer from 'nodemailer'
import { prisma } from './prisma'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  from: string      // e.g. noreply@example.com
  fromName: string  // e.g. AMC Staff
}

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

// ─── Config Loader ────────────────────────────────────────────────────────────

/**
 * 从 SystemConfig 读取 SMTP 配置。
 * 返回 null 表示未配置（Host 或 From 为空）。
 */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { id: 'default' },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpPassword: true,
        smtpFrom: true,
        smtpFromName: true,
        smtpSecure: true,
      },
    })

    if (!config?.smtpHost || !config?.smtpFrom) return null

    return {
      host: config.smtpHost,
      port: config.smtpPort ?? 465,
      secure: config.smtpSecure ?? true,
      user: config.smtpUser ?? '',
      password: config.smtpPassword ?? '',
      from: config.smtpFrom,
      fromName: config.smtpFromName ?? 'AMC Staff',
    }
  } catch (e) {
    console.error('[email] Failed to load SMTP config:', e)
    return null
  }
}

// ─── Core Send ────────────────────────────────────────────────────────────────

/**
 * 发送邮件。
 * 如果 SMTP 未配置，返回 success: false 且不抛错。
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const smtp = await getSmtpConfig()

  if (!smtp) {
    console.warn('[email] SMTP not configured — skipping email send')
    return { success: false, error: 'SMTP not configured' }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user
        ? { user: smtp.user, pass: smtp.password }
        : undefined,
    })

    const info = await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.from}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    })

    console.log(`[email] Sent message ${info.messageId} to ${options.to}`)
    return { success: true, messageId: info.messageId }
  } catch (err: any) {
    console.error('[email] Send failed:', err)
    return { success: false, error: err?.message ?? String(err) }
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

/**
 * 密码重置通知邮件
 */
export async function sendPasswordResetEmail(params: {
  to: string
  nickname: string
  temporaryPassword: string
  invitationLink: string
  adminEmail?: string
}): Promise<EmailResult> {
  const { to, nickname, temporaryPassword, invitationLink, adminEmail } = params

  const html = `
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>密码重置通知</title>
  <style>
    body { margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px 40px; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; }
    .header p { margin: 4px 0 0; color: rgba(255,255,255,0.75); font-size: 13px; }
    .body { padding: 32px 40px; }
    .body p { color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
    .credentials { background: #f1f5f9; border-radius: 10px; padding: 20px 24px; margin: 24px 0; }
    .credentials .label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .credentials .value { font-size: 15px; font-weight: 600; color: #0f172a; font-family: 'SF Mono', 'Monaco', monospace; word-break: break-all; }
    .credentials .value + .label { margin-top: 16px; }
    .cta { display: block; margin: 24px 0; padding: 14px 28px; background: #6366f1; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; text-align: center; }
    .footer { padding: 20px 40px; border-top: 1px solid #e2e8f0; }
    .footer p { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .warning p { color: #92400e; font-size: 13px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔑 密码重置通知</h1>
      <p>AI Marketing Crew (AMC)</p>
    </div>
    <div class="body">
      <p>你好 <strong>${nickname}</strong>，</p>
      <p>您的账号密码已由管理员重置。以下是您的临时登录凭证：</p>

      <div class="credentials">
        <div class="label">登录邮箱</div>
        <div class="value">${to}</div>
        <div class="label">临时密码</div>
        <div class="value">${temporaryPassword}</div>
      </div>

      <a href="${invitationLink}" class="cta">点击此处一键登录 →</a>

      <div class="warning">
        <p>⚠️ 此邀请链接有效期为 7 天，请尽快登录并修改密码。</p>
      </div>

      <p>如果您没有申请密码重置，请联系您的管理员${adminEmail ? `（<a href="mailto:${adminEmail}">${adminEmail}</a>）` : ''}。</p>
    </div>
    <div class="footer">
      <p>此邮件由 AI Marketing Crew 系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>
`

  const text = `
密码重置通知 — AI Marketing Crew

你好 ${nickname}，

您的账号密码已由管理员重置。

登录邮箱：${to}
临时密码：${temporaryPassword}
登录链接：${invitationLink}

此邀请链接有效期为 7 天，请尽快登录并修改密码。

如有疑问，请联系管理员${adminEmail ? ` (${adminEmail})` : ''}。
`.trim()

  return sendEmail({
    to,
    subject: '【AMC】您的账号密码已被重置',
    html,
    text,
  })
}

/**
 * 欢迎邮件（新建用户时使用）
 */
export async function sendWelcomeEmail(params: {
  to: string
  nickname: string
  temporaryPassword: string
  invitationLink: string
}): Promise<EmailResult> {
  const { to, nickname, temporaryPassword, invitationLink } = params

  const html = `
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <title>欢迎加入 AMC</title>
  <style>
    body { margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); padding: 32px 40px; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; }
    .header p { margin: 4px 0 0; color: rgba(255,255,255,0.75); font-size: 13px; }
    .body { padding: 32px 40px; }
    .body p { color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
    .credentials { background: #f1f5f9; border-radius: 10px; padding: 20px 24px; margin: 24px 0; }
    .credentials .label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .credentials .value { font-size: 15px; font-weight: 600; color: #0f172a; font-family: 'SF Mono', 'Monaco', monospace; word-break: break-all; }
    .credentials .value + .label { margin-top: 16px; }
    .cta { display: block; margin: 24px 0; padding: 14px 28px; background: #6366f1; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; text-align: center; }
    .footer { padding: 20px 40px; border-top: 1px solid #e2e8f0; }
    .footer p { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .warning p { color: #92400e; font-size: 13px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 欢迎加入 AMC!</h1>
      <p>AI Marketing Crew</p>
    </div>
    <div class="body">
      <p>你好 <strong>${nickname}</strong>，</p>
      <p>管理员已为您创建了 AMC (AI Marketing Crew) 账号，以下是您的登录信息：</p>
      <div class="credentials">
        <div class="label">登录邮箱</div>
        <div class="value">${to}</div>
        <div class="label">临时密码</div>
        <div class="value">${temporaryPassword}</div>
      </div>
      <a href="${invitationLink}" class="cta">立即登录 →</a>
      <div class="warning">
        <p>⚠️ 此邀请链接有效期为 7 天，首次登录后请立即修改密码。</p>
      </div>
    </div>
    <div class="footer">
      <p>此邮件由 AI Marketing Crew 系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>
`

  return sendEmail({
    to,
    subject: '【AMC】欢迎加入 AI Marketing Crew — 您的账号已创建',
    html,
  })
}
