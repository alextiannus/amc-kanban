import React from 'react'
import { AlertCircle, Check, Star, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export function AgentAvatar({ src, initials, themeColor }: { src: string; initials: string; themeColor?: string | null }) {
  const [failed, setFailed] = React.useState(false)
  if (failed) return <span style={themeColor ? { color: themeColor } : undefined}>{initials}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Avatar"
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

export function ActionCard({ id, type, title, description, platform, payload, onApprove, onReject }: {
  id: string
  type: 'urgent' | 'review'
  title: string
  description: string
  platform?: string
  payload?: any
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const { t } = useI18n()
  const isReview = payload && (typeof payload.rating === 'number' || payload.platform === 'google_maps');
  const replyText = payload?.replyText || (payload?.replyText === '' ? null : null); // handle empty string as null
  const resolvedReplyText = payload?.replyText || null;
  const reviewUrl = payload?.reviewUrl || payload?.reviewUrl === '' ? payload.reviewUrl : null;

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden"
      style={{ borderLeftWidth: '3px', borderLeftColor: type === 'urgent' ? '#ef4444' : '#f59e0b' }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center ${type === 'urgent' ? 'bg-red-50 dark:bg-red-900/20 text-red-500' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-500'}`}>
            {type === 'urgent' ? <AlertCircle className="w-5 h-5" /> : <Star className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {platform && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{platform}</span>}
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${type === 'urgent' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                {type === 'urgent' ? t('紧急处理', 'Urgent') : t('待审核', 'Pending Review')}
              </span>
            </div>
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 leading-snug">{title}</h3>
          </div>
        </div>

        {isReview && typeof payload.rating === 'number' && (
          <div className="flex gap-0.5 text-amber-400 mb-2">
            {[1, 2, 3, 4, 5].map(s => (
              <Star key={s} className={`w-3 h-3 ${s <= payload.rating ? 'fill-current' : 'text-slate-200 dark:text-slate-700'}`} />
            ))}
          </div>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3 mb-4">{description}</p>

        {isReview && (
          <div className="mt-3 mb-4 space-y-2">
            {resolvedReplyText ? (
              <div className="p-3 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-550/20 dark:border-emerald-500/25 rounded-xl text-xs">
                <p className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>AI {t('已自动回复', 'auto-replied')}</span>
                </p>
                <p className="text-slate-600 dark:text-slate-350 italic font-medium leading-relaxed">&ldquo;{resolvedReplyText}&rdquo;</p>
              </div>
            ) : (
              <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 border border-dashed border-amber-500/20 rounded-xl text-xs">
                <p className="font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{t('需人工回复 (可在 Google Business 平台回复，或由 AI 自动同步)', 'Needs manual reply. Reply in Google Business or let AI sync it automatically.')}</span>
                </p>
              </div>
            )}
            {reviewUrl && (
              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-500 hover:text-blue-600 transition-colors"
              >
                {t('在 Google Business 查看评价', 'View review in Google Business')}
              </a>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onReject(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 text-xs font-bold border border-slate-100 dark:border-slate-700 hover:border-red-100 dark:hover:border-red-900/40 transition-all"
          >
            <X className="w-3.5 h-3.5" /> {t('忽略', 'Dismiss')}
          </button>
          <button
            onClick={() => onApprove(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm shadow-emerald-500/20"
          >
            <Check className="w-3.5 h-3.5" /> 
            {isReview 
              ? (resolvedReplyText ? t('已读归档', 'Mark Read') : t('确认回复', 'Confirm Reply')) 
              : (type === 'urgent' ? t('一键回复', 'Quick Reply') : t('确认发布', 'Approve Publish'))}
          </button>
        </div>
      </div>
    </div>
  )
}
