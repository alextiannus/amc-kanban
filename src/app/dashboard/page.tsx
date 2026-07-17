'use client'

import React, { Suspense } from 'react'
import MobileLayout from '@/components/dashboard/MobileLayout'
import DashboardHome from '@/components/dashboard/DashboardHome'
import { useI18n } from '@/lib/i18n'

function DashboardLoading() {
  const { t } = useI18n()
  return (
    <div className="p-8 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
        <p className="text-xs text-slate-400 font-medium">{t('加载中...', 'Loading...')}</p>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <MobileLayout>
      <Suspense fallback={<DashboardLoading />}>
        <DashboardHome />
      </Suspense>
    </MobileLayout>
  )
}
