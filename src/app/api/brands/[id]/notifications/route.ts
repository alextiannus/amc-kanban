/**
 * Unified Owner Notification API
 * 
 * Route: POST /api/brands/[id]/notifications
 * 
 * Send notifications to the brand owner/manager through available channels:
 * - Lark/DingTalk Bot (if configured)
 * - Email (future)
 * - SMS (future)
 * - In-app notifications (future)
 * 
 * The backend automatically selects the most appropriate channel(s).
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWriteBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

interface NotifyRequest {
  title: string         // notification title
  message: string       // notification body
  actionUrl?: string    // optional link (e.g., to a specific task or review)
  actionLabel?: string  // label for the action button (default: "查看")
  priority?: 'normal' | 'urgent' // affects notification styling
}

// POST /api/brands/[id]/notifications
// Send a notification to the brand owner
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params
  if (!(await canWriteBrandProject(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const brand = await prisma.brand.findFirst({
    where: { id: brandId },
    select: {
      name: true,
      larkBotWebhook: true,
      larkAppId: true,
      larkAppSecret: true,
      larkOwnerId: true,
    }
  })

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  const body: NotifyRequest = await request.json()
  const { title, message, actionUrl, actionLabel = '查看', priority = 'normal' } = body

  if (!title || !message) {
    return NextResponse.json(
      { error: 'title and message are required' },
      { status: 400 }
    )
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // Notification Channel Selection Logic
    // ═══════════════════════════════════════════════════════════════════════════
    // Priority: Lark Bot > Lark App > Email

    const notifications: Array<{ channel: string; status: 'sent' }> = []

    // Send via Lark Bot Webhook (fastest, real-time)
    if (brand.larkBotWebhook) {
      try {
        const response = await fetch(brand.larkBotWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msg_type: 'interactive',
            card: {
              config: { wide_screen_mode: true },
              elements: [
                {
                  tag: 'div',
                  text: {
                    content: `**${title}**\n\n${message}`,
                    tag: 'lark_md',
                  },
                },
              ],
              // Add action button if URL provided
              ...(actionUrl ? {
                actions: [
                  {
                    tag: 'button',
                    text: { content: actionLabel, tag: 'lark_md' },
                    url: actionUrl,
                    type: priority === 'urgent' ? 'danger' : 'primary',
                  },
                ],
              } : {}),
            },
          }),
        })

        if (response.ok) {
          notifications.push({ channel: 'lark_bot', status: 'sent' })
          console.log(`[Notifications] Sent via Lark bot for brand ${brand.name}`)
        } else {
          const error = await response.text()
          console.warn(`[Notifications] Lark bot webhook failed: ${error}`)
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown webhook error'
        console.warn(`[Notifications] Lark bot webhook error: ${message}`)
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Future: Send via Lark App Message (if webhook unavailable)
    // if (brand.larkAppId && brand.larkAppSecret && brand.larkOwnerId) {
    //   try {
    //     await sendLarkMessage(...)
    //     notifications.push({ channel: 'lark_app', status: 'sent' })
    //   } catch (error) {
    //     console.warn(`[Notifications] Lark app message failed:`, error)
    //   }
    // }

    // ═══════════════════════════════════════════════════════════════════════════
    // Future: Email Fallback
    // try {
    //   await sendEmail(...)
    //   notifications.push({ channel: 'email', status: 'sent' })
    // } catch (error) {
    //   console.warn(`[Notifications] Email failed:`, error)
    // }

    if (notifications.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No notification channels available for this brand',
          hint: 'Configure Lark webhook, Lark app credentials, or enable email',
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      title,
      sentTo: notifications,
      timestamp: new Date().toISOString(),
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Notification failed'
    const details = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : undefined
    console.error(`[Notifications] Unexpected error for brand ${brandId}:`, error)
    return NextResponse.json(
      {
        error: message,
        details: details || undefined,
      },
      { status: 500 }
    )
  }
}
