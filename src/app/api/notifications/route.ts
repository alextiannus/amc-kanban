import { NextResponse } from 'next/server'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { syncSetupNotifications } from '@/lib/notification/notificationService'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const context = await resolveSessionOrApiKey(request)
    if (!context?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const notifications = await syncSetupNotifications(context.user.id)
    return NextResponse.json({ ok: true, notifications })
  } catch (error: any) {
    console.error('[API Notifications] Failed to fetch notifications:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}
