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
import {
  SUBSCRIPTION_TERMS_FILENAMES,
  getSubscriptionTermsPdf,
  getSubscriptionTermsMarkdown,
} from './subscription/terms'

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
  attachments?: any[]
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

function buildServiceTermsPdfAttachments() {
  return [
    {
      filename: SUBSCRIPTION_TERMS_FILENAMES.en,
      content: getSubscriptionTermsPdf('en'),
      contentType: 'application/pdf',
    },
    {
      filename: SUBSCRIPTION_TERMS_FILENAMES.zh,
      content: getSubscriptionTermsPdf('zh'),
      contentType: 'application/pdf',
    },
  ]
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
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    })

    const info = await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.from}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      attachments: options.attachments,
    })

    console.log(`[email] Sent message ${info.messageId} to ${options.to}`)
    return { success: true, messageId: info.messageId }
  } catch (err: any) {
    console.error('[email] Send failed:', err)
    return { success: false, error: err?.message ?? String(err) }
  }
}

// ─── Email Templates & Dynamic Database Fallbacks ────────────────────────────────

export function interpolateTemplate(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return key in variables ? String(variables[key]) : match
  })
}

export const DEFAULT_TEMPLATES = {
  PASSWORD_RESET: {
    name: '密码重置通知',
    description: '管理员手动重置用户密码时发送的通知邮件',
    placeholders: 'nickname,to,temporaryPassword,invitationLink,adminEmail',
    subject: '【AMC】安全提示：您的账号密码重置通知',
    html: `<!DOCTYPE html>
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
      <p>你好 <strong>{{nickname}}</strong>，</p>
      <p>您的账号密码已由管理员成功重置。以下是您新的临时登录凭证，请妥善保管：</p>

      <div class="credentials">
        <div class="label">登录邮箱</div>
        <div class="value">{{to}}</div>
        <div class="label">临时密码</div>
        <div class="value">{{temporaryPassword}}</div>
      </div>

      <a href="{{invitationLink}}" class="cta">立即登录您的账号 →</a>

      <div class="warning">
        <p>⚠️ 为了您的账号安全，此临时登录链接的有效期为 <strong>7天</strong>。登录后系统将引导您立即修改为新密码。</p>
      </div>

      <p>如果您并未发起此申请，或者对此操作有任何疑问，请立即联系管理员（<a href="mailto:{{adminEmail}}">{{adminEmail}}</a>）。</p>
    </div>
    <div class="footer">
      <p>此邮件由 AI Marketing Crew 系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>`,
    text: `
密码重置通知 — AI Marketing Crew

你好 {{nickname}}，

您的账号密码已由管理员重置。

登录邮箱：{{to}}
临时密码：{{temporaryPassword}}
登录链接：{{invitationLink}}

此链接有效期为 7 天，请尽快登录并修改密码。

如有任何问题，请联系管理员 ({{adminEmail}})。
`.trim()
  },
  WELCOME_EMAIL: {
    name: '新用户欢迎邮件',
    description: '新用户创建账户时的欢迎邮件（适用于主理人、BD或一般平台用户）',
    placeholders: 'nickname,to,temporaryPassword,invitationLink',
    subject: '【AMC】恭喜！您的 AI 智能营销平台账号已成功开通',
    html: `<!DOCTYPE html>
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
      <p>AI Marketing Crew — 开启社交营销爆发之旅</p>
    </div>
    <div class="body">
      <p>你好 <strong>{{nickname}}</strong>，</p>
      <p>我们非常荣幸地通知您，您的 AMC (AI Marketing Crew) 智能平台账号已成功开通！</p>
      <p>AMC 是您专属的 AI 智能营销团队，我们将协助您轻松打通社交媒体排期、自动文案创作及实时舆情洞察，助推业务倍速增长。</p>
      
      <div class="credentials">
        <div class="label">您的登录邮箱</div>
        <div class="value">{{to}}</div>
        <div class="label">临时登录密码</div>
        <div class="value">{{temporaryPassword}}</div>
      </div>
      
      <a href="{{invitationLink}}" class="cta">立即登录并开启您的旅程 →</a>
      
      <div class="warning">
        <p>⚠️ 安全提示：此邀请链接有效期为 <strong>7天</strong>，首次登录后系统会要求您立即修改为个人常用密码，以确保账号安全。</p>
      </div>
    </div>
    <div class="footer">
      <p>此邮件由 AI Marketing Crew 系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>`,
    text: `
欢迎加入 AI Marketing Crew!

你好 {{nickname}}，

您的账号已成功创建，欢迎您开启全新的社交媒体 AI 营销旅程。

登录邮箱：{{to}}
临时密码：{{temporaryPassword}}
登录链接：{{invitationLink}}

安全提示：该邀请链接有效期为 7 天。首次登录后，请立即修改密码以保证安全。
`.trim()
  },
  BRAND_ONBOARDING: {
    name: '品牌商户入驻欢迎邮件',
    description: '新餐厅/商户入驻 AMC 品牌时发送的入驻与使用说明邮件',
    placeholders: 'nickname,brandName,planName,to,temporaryPassword,mmInviteLink',
    subject: '【AMC】品牌入驻成功！立即开启 {{brandName}} 的 AI 营销之旅',
    html: `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>欢迎入驻 AMC</title>
  <style>
    body { margin: 0; padding: 0; background: #f0f4ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrap { max-width: 580px; margin: 40px auto; }
    .card { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(99,102,241,0.10); }
    .hero { background: linear-gradient(135deg, #6366f1 0%, #0ea5e9 100%); padding: 40px; text-align: center; }
    .hero-emoji { font-size: 48px; margin-bottom: 12px; }
    .hero h1 { margin: 0; color: #fff; font-size: 24px; font-weight: 800; }
    .hero p  { margin: 6px 0 0; color: rgba(255,255,255,0.8); font-size: 14px; }
    .body { padding: 36px 40px; }
    .body p { color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 14px; }
    .brand-badge { display: inline-flex; align-items: center; gap: 8px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px 16px; margin: 4px 0 20px; }
    .brand-badge span { font-size: 14px; font-weight: 700; color: #1d4ed8; }
    .creds { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin: 20px 0; }
    .creds .row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 12px; }
    .creds .row:last-child { margin-bottom: 0; }
    .creds .lbl { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; margin-top: 2px; }
    .creds .val { font-size: 14px; font-weight: 600; color: #0f172a; font-family: 'SF Mono','Monaco',monospace; word-break: break-all; text-align: right; }
    .cta-wrap { text-align: center; margin: 28px 0; }
    .cta { display: inline-block; padding: 16px 36px; background: linear-gradient(135deg, #6366f1 0%, #0ea5e9 100%); color: #fff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; letter-spacing: 0.01em; }
    .notice { background: #fefce8; border-left: 3px solid #fbbf24; padding: 12px 16px; border-radius: 0 10px 10px 0; margin: 20px 0; }
    .notice p { color: #78350f; font-size: 13px; margin: 0; }
    .steps { margin: 24px 0; }
    .step { display: flex; gap: 14px; margin-bottom: 16px; align-items: flex-start; }
    .step-num { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg,#6366f1,#0ea5e9); color: #fff; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
    .step-text { color: #374151; font-size: 14px; line-height: 1.6; }
    .step-text strong { color: #1e293b; }
    .footer { background: #f8fafc; padding: 20px 40px; border-top: 1px solid #e2e8f0; }
    .footer p { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="hero">
        <h1>您的品牌智能营销助手已就绪！</h1>
        <p>AI Marketing Crew — 让 AI 团队助您爆单</p>
      </div>
      <div class="body">
        <p>你好 <strong>{{nickname}}</strong>，</p>
        <p>祝贺您！您的品牌已被成功录入 AMC 平台，您的商家账户已正式开通：</p>
 
        <div class="brand-badge">
          <span>{{brandName}} {{#planName}}· {{planName}}{{/planName}}</span>
        </div>
 
        <div class="creds">
          <div class="row">
            <div class="lbl">登录邮箱</div>
            <div class="val">{{to}}</div>
          </div>
          <div class="row">
            <div class="lbl">临时密码</div>
            <div class="val">{{temporaryPassword}}</div>
          </div>
        </div>
 
        <div class="cta-wrap">
          <a href="{{mmInviteLink}}" class="cta">打开 AMC 商家端系统 →</a>
        </div>
 
        <div class="notice">
          <p>该临时链接有效期为 <strong>7天</strong>，首次登录后请务必立刻修改您的登录密码。</p>
        </div>

        <p style="margin-top:24px;font-weight:600;color:#1e293b;">三步开启 AI 自动化营销旅程：</p>
        <div class="steps">
          <div class="step">
            <div class="step-num">1</div>
            <div class="step-text">点击上面的按钮，<strong>使用临时密码完成首次登录并修改密码</strong>。</div>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <div class="step-text">完善品牌资料：前往<strong>“品牌故事”</strong>，录入您的特色美食、菜单简介与门店物理地址。</div>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <div class="step-text">绑定您的社交账号：接入您的 <strong>Instagram</strong> 和 <strong>Google GBP</strong> 商家后台，AI 智能体和您的专属品牌主理人即可为您起草日常文案并监控评论。</div>
          </div>
        </div>
      </div>
      <div class="footer">
        <p>AMC 客服团队将随时为您提供支持。此邮件由系统自动发送，请勿回复。</p>
      </div>
    </div>
  </div>
</body>
</html>`,
    text: `
欢迎入驻 AI Marketing Crew！

你好 {{nickname}}，

您的品牌「{{brandName}}」已成功录入系统。

登录邮箱：{{to}}
临时密码：{{temporaryPassword}}
登录链接：{{mmInviteLink}}

请通过以下步骤开始：
1. 点击链接使用临时密码完成登录并更新密码。
2. 完善品牌资料。
3. 授权社交平台（Instagram/Google Business），以便 AI 助手为您自动生成推广文章。

如有疑问请联系客服，本邮件由系统自动发出。
`.trim()
  },
  SUBSCRIPTION_SUCCESS: {
    name: '订阅成功确认邮件',
    description: '商户成功订阅新品牌或升级套餐时的邮件通知',
    placeholders: 'nickname,brandName,planName',
    subject: '【AMC】订阅成功！您的 {{brandName}} 智能营销套餐已成功激活',
    html: `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>订阅成功确认</title>
  <style>
    body { margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; }
    .header p { margin: 4px 0 0; color: rgba(255,255,255,0.75); font-size: 13px; }
    .body { padding: 32px 40px; }
    .body p { color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
    .details { background: #f1f5f9; border-radius: 10px; padding: 20px 24px; margin: 24px 0; }
    .details .label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .details .value { font-size: 15px; font-weight: 600; color: #0f172a; word-break: break-all; }
    .details .value + .label { margin-top: 16px; }
    .cta { display: block; margin: 24px 0; padding: 14px 28px; background: #10b981; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; text-align: center; }
    .footer { padding: 20px 40px; border-top: 1px solid #e2e8f0; }
    .footer p { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 订阅激活成功！</h1>
      <p>AI Marketing Crew (AMC)</p>
    </div>
    <div class="body">
      <p>你好 <strong>{{nickname}}</strong>，</p>
      <p>恭喜您！您的品牌订阅套餐已成功激活并开通。您现在可以立即登录 AMC 商家端并开始使用所有功能：</p>

      <div class="details">
        <div class="label">绑定品牌</div>
        <div class="value">{{brandName}}</div>
        <div class="label">已激活套餐</div>
        <div class="value">{{planName}}</div>
      </div>

      <a href="https://amc-mm.immedi.ai/dashboard" class="cta">进入商家端控制台 →</a>

      <p>我们的 AI 营销智能体与您的专属品牌主理人现在已准备就绪，将立即为您起草推广文案并开启智能代运营。</p>
    </div>
    <div class="footer">
      <p>此邮件由 AI Marketing Crew 系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>`,
    text: `
订阅激活成功 — AI Marketing Crew

你好 {{nickname}}，

您的品牌订阅已成功激活并开通：

绑定品牌：{{brandName}}
已激活套餐：{{planName}}

请登录商家端控制台开始使用：https://amc-mm.immedi.ai/dashboard

您的专属 AI 营销智能体已就绪！
`.trim()
  }
}

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

  let subject = DEFAULT_TEMPLATES.PASSWORD_RESET.subject
  let html = DEFAULT_TEMPLATES.PASSWORD_RESET.html
  let text = DEFAULT_TEMPLATES.PASSWORD_RESET.text

  try {
    const dbTemplate = await prisma.messageTemplate.findUnique({
      where: { id: 'PASSWORD_RESET' }
    })
    if (dbTemplate) {
      subject = dbTemplate.subject
      html = dbTemplate.html
      text = dbTemplate.text || ''
    }
  } catch (err) {
    console.error('[email] Failed to fetch PASSWORD_RESET template from DB:', err)
  }

  const vars = {
    to,
    nickname,
    temporaryPassword,
    invitationLink,
    adminEmail: adminEmail || 'support@amc.immedi.ai'
  }

  return sendEmail({
    to,
    subject: interpolateTemplate(subject, vars),
    html: interpolateTemplate(html, vars),
    text: interpolateTemplate(text, vars)
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

  let subject = DEFAULT_TEMPLATES.WELCOME_EMAIL.subject
  let html = DEFAULT_TEMPLATES.WELCOME_EMAIL.html
  let text = DEFAULT_TEMPLATES.WELCOME_EMAIL.text

  try {
    const dbTemplate = await prisma.messageTemplate.findUnique({
      where: { id: 'WELCOME_EMAIL' }
    })
    if (dbTemplate) {
      subject = dbTemplate.subject
      html = dbTemplate.html
      text = dbTemplate.text || ''
    }
  } catch (err) {
    console.error('[email] Failed to fetch WELCOME_EMAIL template from DB:', err)
  }

  const vars = {
    to,
    nickname,
    temporaryPassword,
    invitationLink
  }

  return sendEmail({
    to,
    subject: interpolateTemplate(subject, vars),
    html: interpolateTemplate(html, vars),
    text: interpolateTemplate(text, vars)
  })
}

/**
 * 品牌入驻欢迎邮件（新建品牌时发送给品牌主）
 */
export async function sendBrandOnboardingWelcomeEmail(params: {
  to: string
  nickname: string
  brandName: string
  temporaryPassword: string
  mmInviteLink: string
  planName?: string
}): Promise<EmailResult> {
  const { to, nickname, brandName, temporaryPassword, mmInviteLink, planName } = params

  let subject = DEFAULT_TEMPLATES.BRAND_ONBOARDING.subject
  let html = DEFAULT_TEMPLATES.BRAND_ONBOARDING.html
  let text = DEFAULT_TEMPLATES.BRAND_ONBOARDING.text

  try {
    const dbTemplate = await prisma.messageTemplate.findUnique({
      where: { id: 'BRAND_ONBOARDING' }
    })
    if (dbTemplate) {
      subject = dbTemplate.subject
      html = dbTemplate.html
      text = dbTemplate.text || ''
    }
  } catch (err) {
    console.error('[email] Failed to fetch BRAND_ONBOARDING template from DB:', err)
  }

  const vars = {
    to,
    nickname,
    brandName,
    temporaryPassword,
    mmInviteLink,
    planName: planName || '标准专业代运营套餐'
  }

  // Support simple conditional replacement for planName in html/text
  let formattedHtml = html
  if (planName) {
    formattedHtml = formattedHtml.replace(/\{\{#planName\}\}(.*?)\{\{\/planName\}\}/g, '$1')
  } else {
    formattedHtml = formattedHtml.replace(/\{\{#planName\}\}.*?\{\{\/planName\}\}/g, '')
  }

  let formattedText = text
  if (planName) {
    formattedText = formattedText.replace(/\{\{#planName\}\}(.*?)\{\{\/planName\}\}/g, '$1')
  } else {
    formattedText = formattedText.replace(/\{\{#planName\}\}.*?\{\{\/planName\}\}/g, '')
  }

  const agreementHtml = `
    <div style="margin-top:24px;padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;color:#334155;font-size:12px;line-height:1.6;">
      <strong>Service Agreement Acknowledgement</strong><br/>
      By subscribing to AMC, paying for a subscription, creating a brand workspace, or continuing to use the service, the customer acknowledges and agrees to the full AI Marketing Crew Service Terms from Deliverychinatown Pte. Ltd. (UEN 201835327N, Singapore), including GenAI risk acknowledgement, data rights and protection obligations, IP responsibilities, content approval obligations and limitation of liability. The full Service Terms are attached as a PDF.
    </div>`
  const agreementText = `\n\nService Agreement Acknowledgement:\nBy subscribing to AMC, paying for a subscription, creating a brand workspace, or continuing to use the service, the customer acknowledges and agrees to the full AI Marketing Crew Service Terms from Deliverychinatown Pte. Ltd. (UEN 201835327N, Singapore), including GenAI risk acknowledgement, data rights and protection obligations, IP responsibilities, content approval obligations and limitation of liability. The full Service Terms are attached as a PDF.`

  return sendEmail({
    to,
    subject: interpolateTemplate(subject, vars),
    html: interpolateTemplate(formattedHtml, vars) + agreementHtml,
    text: interpolateTemplate(formattedText, vars) + agreementText,
    attachments: buildServiceTermsPdfAttachments(),
  })
}

/**
 * 订阅成功确认邮件（不带临时密码与用户名）
 */
export async function sendSubscriptionSuccessEmail(params: {
  to: string
  nickname: string
  brandName: string
  planName: string
}): Promise<EmailResult> {
  const { to, nickname, brandName, planName } = params

  let subject = DEFAULT_TEMPLATES.SUBSCRIPTION_SUCCESS.subject
  let html = DEFAULT_TEMPLATES.SUBSCRIPTION_SUCCESS.html
  let text = DEFAULT_TEMPLATES.SUBSCRIPTION_SUCCESS.text

  try {
    const dbTemplate = await prisma.messageTemplate.findUnique({
      where: { id: 'SUBSCRIPTION_SUCCESS' }
    })
    if (dbTemplate) {
      subject = dbTemplate.subject
      html = dbTemplate.html
      text = dbTemplate.text || ''
    }
  } catch (err) {
    console.error('[email] Failed to fetch SUBSCRIPTION_SUCCESS template from DB:', err)
  }

  const vars = {
    nickname,
    brandName,
    planName
  }

  return sendEmail({
    to,
    subject: interpolateTemplate(subject, vars),
    html: interpolateTemplate(html, vars),
    text: interpolateTemplate(text, vars),
    attachments: buildServiceTermsPdfAttachments(),
  })
}


/**
 * 密码重置链接邮件（安全 token 链接，无明文临时密码）
 */
export async function sendResetPasswordLinkEmail(params: {
  to: string
  nickname: string
  resetLink: string
  expiresInMinutes: number
  adminTriggered?: boolean
}): Promise<EmailResult> {
  const { to, nickname, resetLink, expiresInMinutes, adminTriggered = false } = params

  const expiryText = expiresInMinutes < 60
    ? `${expiresInMinutes} 分钟`
    : `${Math.round(expiresInMinutes / 60)} 小时`

  const triggerNote = adminTriggered
    ? '您的账号密码已由管理员发起重置申请。'
    : '我们收到了您的密码重置申请。'

  const subject = '【AMC】密码重置链接'

  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>密码重置</title>
  <style>
    body { margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { max-width: 540px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px 40px; }
    .header h1 { margin: 0; color: #fff; font-size: 22px; font-weight: 700; }
    .header p { margin: 4px 0 0; color: rgba(255,255,255,0.8); font-size: 13px; }
    .body { padding: 32px 40px; }
    .body p { color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
    .cta-wrap { text-align: center; margin: 32px 0; }
    .cta { display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff !important; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; }
    .link-box { background: #f1f5f9; border-radius: 10px; padding: 14px 18px; margin: 16px 0; word-break: break-all; font-size: 12px; color: #475569; font-family: monospace; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .warning p { color: #92400e; font-size: 13px; margin: 0; }
    .footer { padding: 20px 40px; border-top: 1px solid #e2e8f0; }
    .footer p { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 密码重置</h1>
      <p>AI Marketing Crew (AMC)</p>
    </div>
    <div class="body">
      <p>你好 <strong>${nickname}</strong>，</p>
      <p>${triggerNote}请点击下方按钮设置新密码：</p>
      <div class="cta-wrap">
        <a href="${resetLink}" class="cta">立即重置密码 →</a>
      </div>
      <p style="font-size:13px;color:#64748b;text-align:center;">若按钮无法点击，请复制以下链接到浏览器：</p>
      <div class="link-box">${resetLink}</div>
      <div class="warning">
        <p>⚠️ 此重置链接有效期为 <strong>${expiryText}</strong>，且只能使用一次。过期后需重新申请。</p>
      </div>
      <p>如果您没有发起此操作，请忽略本邮件，您的密码不会有任何变化。</p>
    </div>
    <div class="footer">
      <p>此邮件由 AI Marketing Crew 系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>`

  const text = `密码重置 — AI Marketing Crew

你好 ${nickname}，

${triggerNote}请点击以下链接设置新密码：

${resetLink}

此链接有效期为 ${expiryText}，且只能使用一次。

如果您没有发起此操作，请忽略本邮件。`

  return sendEmail({ to, subject, html, text })
}

export async function sendBrandCongratsEmailWithContract(params: {
  to: string
  nickname: string
  brandName: string
  planName?: string
  mmInviteLink?: string
}): Promise<EmailResult> {
  const { to, nickname, brandName, planName, mmInviteLink } = params

  const displayPlan = planName || '标准专业代运营套餐 (Starter Plan)'
  const contractText = getSubscriptionTermsMarkdown()

  const subject = `【AMC】祝贺！您的品牌 ${brandName} 已成功创建 | Brand Created Successfully`
  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>欢迎开启 AI 营销之旅</title>
  <style>
    body { margin: 0; padding: 0; background: #f0f4ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrap { max-width: 580px; margin: 40px auto; }
    .card { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(99,102,241,0.10); }
    .hero { background: linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%); padding: 40px; text-align: center; }
    .hero h1 { margin: 0; color: #fff; font-size: 22px; font-weight: 800; }
    .hero p  { margin: 6px 0 0; color: rgba(255,255,255,0.8); font-size: 13px; }
    .body { padding: 36px 40px; }
    .body p { color: #374151; font-size: 14px; line-height: 1.6; margin: 0 0 14px; }
    .brand-badge { display: inline-flex; align-items: center; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px 16px; margin: 4px 0 20px; }
    .brand-badge span { font-size: 14px; font-weight: 700; color: #1d4ed8; }
    .cta-wrap { text-align: center; margin: 28px 0; }
    .cta { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%); color: #fff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; }
    .contract-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; font-size: 11px; font-family: monospace; max-height: 200px; overflow-y: auto; white-space: pre-wrap; margin: 20px 0; }
    .footer { background: #f8fafc; padding: 20px 40px; border-top: 1px solid #e2e8f0; text-align: center; }
    .footer p { font-size: 11px; color: #94a3b8; margin: 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="hero">
        <h1>🎉 Congratulations! Brand Created Successfully</h1>
        <p>AI Marketing Crew — Let AI Staff Boost Your Sales</p>
      </div>
      <div class="body">
        <p>Dear <strong>${nickname}</strong>,</p>
        <p>Your brand <strong>${brandName}</strong> has been successfully created on the AMC platform! We are thrilled to welcome you to the future of AI-powered automated social media marketing.</p>
        
        <div class="brand-badge">
          <span>${brandName} · ${displayPlan}</span>
        </div>

        <p>We have attached the AI Marketing Crew Service Terms from <strong>Deliverychinatown Pte. Ltd. (UEN 201835327N, Singapore)</strong> to this email as a PDF for your records.</p>
        <p>By subscribing to AMC, paying for a subscription, creating a brand workspace, or continuing to use the service, you acknowledge and agree to the full Service Agreement, including GenAI risk acknowledgement, data rights and protection obligations, IP responsibilities, content approval obligations and limitation of liability.</p>
        
        <div class="contract-box">${contractText.slice(0, 2400)}${contractText.length > 2400 ? '\n\n[Full Service Terms attached as PDF]' : ''}</div>

        ${mmInviteLink ? `
        <div class="cta-wrap">
          <a href="${mmInviteLink}" class="cta" style="color: #ffffff;">Access AMC Dashboard →</a>
        </div>` : ''}

        <p>If you have any questions or require assistance connecting your Instagram, TikTok, or Google Business Profile accounts, our customer support team is always here to help.</p>
        
        <p>Warm regards,<br/><strong>The AI Marketing Crew Team</strong></p>
      </div>
      <div class="footer">
        <p>This is an automated email from DeliveryChinatown Pte. Ltd. Please do not reply directly.</p>
      </div>
    </div>
  </div>
</body>
</html>`

  const text = `Congratulations! Brand Created Successfully
  
Dear ${nickname},

Your brand "${brandName}" (${displayPlan}) has been successfully created on the AMC platform.

We have attached the official AI Marketing Crew Service Terms from Deliverychinatown Pte. Ltd. (UEN 201835327N, Singapore) as a PDF.

By subscribing to AMC, paying for a subscription, creating a brand workspace, or continuing to use the service, you acknowledge and agree to the full Service Agreement, including GenAI risk acknowledgement, data rights and protection obligations, IP responsibilities, content approval obligations and limitation of liability.

Best regards,
The AI Marketing Crew Team`

  return sendEmail({
    to,
    subject,
    html,
    text,
    attachments: buildServiceTermsPdfAttachments(),
  })
}
