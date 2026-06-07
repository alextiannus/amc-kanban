'use client'
import React from 'react'
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import { Check, X, AlertCircle } from 'lucide-react'

interface SwipeableActionCardProps {
  id: string
  title: string
  description: string
  type: 'urgent' | 'review'
  onApprove: (id: string) => void
  onReject: (id: string) => void
}

export default function SwipeableActionCard({ id, title, description, type, onApprove, onReject }: SwipeableActionCardProps) {
  const x = useMotionValue(0)
  const opacity = useTransform(x, [-120, 0, 120], [0, 1, 0])
  const rotate = useTransform(x, [-120, 120], [-4, 4])
  
  // Background colors based on drag direction using gradients
  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 100
    if (info.offset.x > threshold) {
      setTimeout(() => onApprove(id), 100)
    } else if (info.offset.x < -threshold) {
      setTimeout(() => onReject(id), 100)
    }
  }

  return (
    <div className="relative w-full rounded-[32px] mb-4">
      {/* Background Indicators (Swipe Actions) */}
      <div className="absolute inset-0 flex justify-between items-center px-8 rounded-[32px] overflow-hidden shadow-inner bg-slate-100 dark:bg-slate-800">
        <motion.div className="absolute inset-0 left-1/2 bg-gradient-to-r from-transparent to-emerald-500" style={{ opacity: useTransform(x, [0, 100], [0, 1]) }} />
        <motion.div className="absolute inset-0 right-1/2 bg-gradient-to-l from-transparent to-rose-500" style={{ opacity: useTransform(x, [0, -100], [0, 1]) }} />
        <motion.div className="z-10 flex flex-col items-center gap-1" style={{ opacity: useTransform(x, [0, -50], [0, 1]) }}>
          <div className="bg-white/20 backdrop-blur-sm p-3 rounded-full text-white shadow-lg shadow-rose-900/20"><X className="w-7 h-7" strokeWidth={3} /></div>
          <span className="text-[11px] font-black tracking-widest text-white drop-shadow-md">打回重写</span>
        </motion.div>
        <motion.div className="z-10 flex flex-col items-center gap-1" style={{ opacity: useTransform(x, [0, 50], [0, 1]) }}>
          <div className="bg-white/20 backdrop-blur-sm p-3 rounded-full text-white shadow-lg shadow-emerald-900/20"><Check className="w-7 h-7" strokeWidth={3} /></div>
          <span className="text-[11px] font-black tracking-widest text-white drop-shadow-md">确认发布</span>
        </motion.div>
      </div>

      {/* Draggable Card */}
      <motion.div
        style={{ x, opacity, rotate, borderLeftWidth: '4px', borderLeftColor: type === 'urgent' ? '#ef4444' : '#3b82f6' }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={handleDragEnd}
        whileTap={{ scale: 0.98, cursor: 'grabbing' }}
        className="group bg-white dark:bg-slate-800 p-5 rounded-3xl cursor-grab border shadow-sm border-slate-100 dark:border-slate-700/60 transition-all duration-300 flex flex-col gap-4 relative overflow-hidden"
      >
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 flex-shrink-0 rounded-2xl flex items-center justify-center shadow-sm overflow-hidden border border-white dark:border-slate-800 ${type === 'urgent' ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 leading-snug truncate">{title}</h3>
              {type === 'urgent' && (
                <span className="flex-shrink-0 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Urgent</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex-1">
          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex items-center gap-3 mt-2 pt-4 border-t border-slate-100 dark:border-slate-800/60">
          <button
            onClick={() => onReject(id)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-600 dark:bg-slate-900/50 dark:hover:bg-red-900/20 dark:text-slate-400 dark:hover:text-red-400 font-bold text-sm transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
          >
            <X className="w-4 h-4" /> 忽略
          </button>
          <button
            onClick={() => onApprove(id)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 font-bold text-sm transition-colors border border-blue-100 dark:border-blue-800/50"
          >
            <Check className="w-4 h-4" /> {type === 'urgent' ? '发送回复' : '确认发布'}
          </button>
        </div>
        
        {/* Swipe Hint (Pill) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-1 bg-slate-900/80 dark:bg-black/80 backdrop-blur-sm text-white text-[9px] font-bold px-3 py-1 rounded-b-xl flex items-center gap-2 shadow-sm">
          <span className="text-slate-400">👈 驳回</span> <span className="text-slate-600">|</span> <span className="text-slate-400">发布 👉</span>
        </div>
      </motion.div>
    </div>
  )
}
