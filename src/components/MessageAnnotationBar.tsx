'use client'

import { useState } from 'react'
import { ThumbsUp, ThumbsDown, Minus, Tag, Edit3, Check, X } from 'lucide-react'

interface AnnotationBarProps {
  messageId: string
  apiPath: string  // e.g. '/api/admin/companion-messages/[id]/annotate'
                   // or '/api/admin/copywriter-logs/[id]/annotate'
  initialRating?:      number | null
  initialTag?:         string | null
  initialNote?:        string | null
  initialCorrected?:   string | null
  isAnnotated?:        boolean
  onSaved?: (data: { rating?: number; trainingTag?: string; adminNote?: string; correctedContent?: string }) => void
}

const RATING_BUTTONS = [
  { value: 3, label: '好', icon: ThumbsUp,  color: 'text-emerald-600 dark:text-emerald-400', active: 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-300 dark:border-emerald-700' },
  { value: 2, label: '一般', icon: Minus,   color: 'text-amber-600 dark:text-amber-400',   active: 'bg-amber-100 dark:bg-amber-900/50 border-amber-300 dark:border-amber-700' },
  { value: 1, label: '差', icon: ThumbsDown, color: 'text-rose-600 dark:text-rose-400',  active: 'bg-rose-100 dark:bg-rose-900/50 border-rose-300 dark:border-rose-700' },
] as const

const TAG_OPTIONS = [
  { value: 'include',       label: '✅ 纳入训练', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  { value: 'needs_rewrite', label: '✏️ 待改写',   color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  { value: 'exclude',       label: '🚫 排除',     color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' },
] as const

/**
 * MessageAnnotationBar
 *
 * Compact inline annotation toolbar for CompanionMessage and CopywriterLog entries.
 * Saves each field independently to avoid data loss on partial edits.
 */
export default function MessageAnnotationBar({
  messageId,
  apiPath,
  initialRating,
  initialTag,
  initialNote,
  initialCorrected,
  isAnnotated,
  onSaved,
}: AnnotationBarProps) {
  const [rating,      setRatingState]      = useState<number | null>(initialRating ?? null)
  const [tag,         setTagState]         = useState<string | null>(initialTag     ?? null)
  const [note,        setNoteState]        = useState(initialNote      ?? '')
  const [corrected,   setCorrectedState]   = useState(initialCorrected ?? '')
  const [showNote,    setShowNote]         = useState(false)
  const [showCorrect, setShowCorrect]      = useState(false)
  const [saving,      setSaving]           = useState(false)
  const [saved,       setSaved]            = useState(false)

  const patch = async (data: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch(apiPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        onSaved?.(data as { rating?: number; trainingTag?: string; adminNote?: string; correctedContent?: string })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleRating = async (v: number) => {
    const next = rating === v ? null : v
    setRatingState(next)
    await patch(next !== null ? { rating: next } : { rating: null })
  }

  const handleTag = async (v: string) => {
    const next = tag === v ? null : v
    setTagState(next)
    await patch(next !== null ? { trainingTag: next } : { trainingTag: null })
  }

  const handleSaveNote = async () => {
    await patch({ adminNote: note })
    setShowNote(false)
  }

  const handleSaveCorrection = async () => {
    await patch({ correctedContent: corrected })
    setShowCorrect(false)
  }

  return (
    <div className={`mt-2 rounded-lg px-3 py-2 space-y-2 border transition ${
      isAnnotated
        ? 'bg-indigo-50/60 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800'
        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
    }`}>
      {/* Row 1: Rating + Tag + save indicator */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Rating */}
        <div className="flex gap-1">
          {RATING_BUTTONS.map(({ value, label, icon: Icon, color, active }) => (
            <button
              key={value}
              onClick={() => handleRating(value)}
              disabled={saving}
              title={label}
              className={`p-1 rounded-md border text-[11px] transition flex items-center gap-0.5 ${
                rating === value
                  ? active
                  : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-700'
              } ${color}`}
            >
              <Icon size={11} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

        {/* Training tag */}
        <div className="flex gap-1">
          {TAG_OPTIONS.map(({ value, label, color }) => (
            <button
              key={value}
              onClick={() => handleTag(value)}
              disabled={saving}
              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition ${
                tag === value ? color : 'border-transparent text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Utility buttons */}
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => { setShowNote(v => !v); setShowCorrect(false) }}
            className={`p-1 rounded-md text-[10px] flex items-center gap-0.5 transition ${
              showNote ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title="批注"
          >
            <Tag size={11} /> 批注
          </button>
          <button
            onClick={() => { setShowCorrect(v => !v); setShowNote(false) }}
            className={`p-1 rounded-md text-[10px] flex items-center gap-0.5 transition ${
              showCorrect ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title="填写正确回复"
          >
            <Edit3 size={11} /> 纠正
          </button>
          {saving && <span className="text-[10px] text-slate-400 animate-pulse">保存中…</span>}
          {saved  && <span className="text-[10px] text-emerald-500 flex items-center gap-0.5"><Check size={10} />已保存</span>}
        </div>
      </div>

      {/* Row 2: Note textarea (conditional) */}
      {showNote && (
        <div className="space-y-1">
          <textarea
            value={note}
            onChange={e => setNoteState(e.target.value)}
            placeholder="批注：描述这个回复存在的问题，或值得学习的亮点…"
            rows={2}
            className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNote(false)} className="text-[10px] text-slate-400 flex items-center gap-0.5 hover:text-slate-600"><X size={10} />取消</button>
            <button onClick={handleSaveNote} disabled={saving} className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-0.5"><Check size={10} />保存批注</button>
          </div>
        </div>
      )}

      {/* Row 3: Correction textarea (conditional) */}
      {showCorrect && (
        <div className="space-y-1">
          <textarea
            value={corrected}
            onChange={e => setCorrectedState(e.target.value)}
            placeholder="正确回复应该是（导出训练数据时此内容将替换原始回复）…"
            rows={3}
            className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCorrect(false)} className="text-[10px] text-slate-400 flex items-center gap-0.5 hover:text-slate-600"><X size={10} />取消</button>
            <button onClick={handleSaveCorrection} disabled={saving || !corrected.trim()} className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-0.5"><Check size={10} />保存纠正</button>
          </div>
          {corrected && (
            <p className="text-[10px] text-indigo-500">⚡ 导出时此内容将替换原始 AI 回复，用于 fine-tuning</p>
          )}
        </div>
      )}

      {/* Existing note preview */}
      {!showNote && note && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">💬 {note}</p>
      )}
      {!showCorrect && corrected && (
        <p className="text-[10px] text-indigo-500 italic">✏️ 已纠正: {truncate(corrected, 80)}</p>
      )}
    </div>
  )
}

const truncate = (s: string, n = 80) => s.length > n ? s.slice(0, n) + '…' : s
