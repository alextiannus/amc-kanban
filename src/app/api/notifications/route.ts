import {notePushPresence,quietNow} from '@/lib/notification/push'
import { prisma } from '@/lib/prisma'
import { canUserAccessBrand } from '@/lib/user-management/brandAccess'
import { nativeHttp } from '@/lib/ai-native/http'
import { notifyVideoReview } from '@/lib/notification/videoReview'
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

    const quiet=new URL(request.url).searchParams.get('quiet')==='1'
    const found:any[]=quiet?await prisma.notification.findMany({where:{userId:context.user.id,status:{not:'DISMISSED'}},orderBy:{createdAt:'desc'},take:200}):await syncSetupNotifications(context.user.id)
    const allowed=new Map<string,boolean>()
    for(const brandId of new Set<string>(found.map(n=>n.brandId).filter((id):id is string=>!!id)))allowed.set(brandId,await canUserAccessBrand(brandId,context.user.id,'READ'))
    const notifications=found.filter(n=>!n.brandId||allowed.get(n.brandId))
    await notePushPresence(context.user.id)
    const preferences=(await prisma.$queryRawUnsafe('SELECT muted,quiet,timezone FROM amc_push_preferences WHERE user_id=$1',context.user.id) as any[])[0]
    return NextResponse.json({ ok: true, notifications,preferences:preferences?{muted:preferences.muted,quietActive:quietNow(preferences)}:{muted:false,quietActive:false} },{headers:{'Cache-Control':'no-store'}})
  } catch (error: any) {
    console.error('[API Notifications] Failed to fetch notifications:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return nativeHttp(request, notifyVideoReview)
}
