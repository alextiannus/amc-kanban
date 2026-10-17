'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import ActivitySettingsEditor from './ActivitySettingsEditor'
import GameActivityOperations from './GameActivityOperations'

export default function GameSettingsDashboard({ brandId, brandName }: { brandId: string; brandName: string }) {
  const { isEn } = useI18n()
  const [operationsVersion, setOperationsVersion] = useState(0)
  const [operationsOpen, setOperationsOpen] = useState(false)
  return <div className="space-y-5">
    <ActivitySettingsEditor key={brandId} brandId={brandId} brandName={brandName} isEn={isEn} onConfigSaved={() => setOperationsVersion(value => value + 1)}/>
    <details className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" onToggle={event => setOperationsOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-bold text-slate-700 dark:text-slate-200">{isEn ? 'Activity rounds, share drafts and prize redemption' : '活动运营 · 轮次、分享文案与奖品核销'}</summary>
      {operationsOpen && <GameActivityOperations key={`${brandId}-${operationsVersion}`} brandId={brandId}/>}
    </details>
  </div>
}
