'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar as CalendarIcon, ShoppingBag, Image as ImageIcon,
  Settings, LogOut, X, ChevronDown, Check, Utensils, User
} from 'lucide-react'

interface Brand {
  id: string
  name: string
  description?: string | null
  location?: string | null
  autoPilot: boolean
  logoUrl?: string | null
}

interface MMSideMenuProps {
  open: boolean
  onClose: () => void
  brands: Brand[]
  activeBrand: Brand | null
  loading: boolean
  subscriptionPlan: string
  brandDropdownOpen: boolean
  setBrandDropdownOpen: (v: boolean) => void
  setActiveBrand: (b: Brand) => void
  onNavigate: (page: 'brand' | 'calendar' | 'market' | 'assets' | 'settings') => void
}

export default function MMSideMenu({
  open,
  onClose,
  brands,
  activeBrand,
  loading,
  subscriptionPlan,
  brandDropdownOpen,
  setBrandDropdownOpen,
  setActiveBrand,
  onNavigate,
}: MMSideMenuProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-[280px] bg-[#f7f9fb] dark:bg-slate-900 shadow-2xl z-50 flex flex-col p-8 border-l border-slate-200/50 dark:border-slate-800/50"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-10">
              <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-transparent">
                <img
                  src={activeBrand?.logoUrl || '/logo.svg'}
                  onError={(e) => { e.currentTarget.src = '/logo.svg' }}
                  alt="logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Brand Switcher */}
            <div className="mb-6 border-b border-slate-200/50 dark:border-slate-700/50 pb-6">
              <div className="relative">
                <button
                  onClick={() => setBrandDropdownOpen(!brandDropdownOpen)}
                  className="w-full flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer outline-none"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary overflow-hidden flex items-center justify-center text-white flex-shrink-0">
                      {activeBrand?.logoUrl ? (
                        <img
                          src={activeBrand.logoUrl}
                          onError={(e) => { e.currentTarget.src = '/logo.svg' }}
                          alt="logo"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Utensils className="w-4.5 h-4.5 text-white" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                        {activeBrand ? activeBrand.name : (loading ? 'Loading Brand...' : '暂无品牌')}
                      </span>
                      {activeBrand?.autoPilot && (
                        <span className="text-[9px] text-emerald-500 font-bold truncate">AI Auto-Pilot</span>
                      )}
                    </div>
                  </div>
                  {brands.length > 1 && (
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${brandDropdownOpen ? 'rotate-180' : ''}`} />
                  )}
                </button>
                <AnimatePresence>
                  {brandDropdownOpen && brands.length > 1 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200/60 dark:border-slate-700 overflow-hidden z-50 max-h-48 overflow-y-auto"
                    >
                      {brands.map(b => (
                        <button
                          key={b.id}
                          onClick={() => {
                            setActiveBrand(b)
                            setBrandDropdownOpen(false)
                          }}
                          className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                            activeBrand?.id === b.id ? 'bg-indigo-50/50 dark:bg-indigo-900/30 text-primary font-bold' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded bg-primary/10 overflow-hidden flex items-center justify-center text-primary flex-shrink-0">
                              {b.logoUrl ? (
                                <img src={b.logoUrl} onError={(e) => { e.currentTarget.src = '/logo.svg' }} alt="logo" className="w-full h-full object-contain" />
                              ) : (
                                <Utensils className="w-3.5 h-3.5" />
                              )}
                            </div>
                            <span className="truncate">{b.name}</span>
                          </div>
                          {activeBrand?.id === b.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Navigation */}
            <nav className="space-y-6 text-slate-700 dark:text-slate-200">
              {[
                { page: 'brand' as const, Icon: User, label: '品牌档案', color: 'text-amber-600 dark:text-amber-400', iconColor: 'text-amber-500' },
                { page: 'calendar' as const, Icon: CalendarIcon, label: '发布日历', color: '', iconColor: 'text-slate-500' },
                { page: 'market' as const, Icon: ShoppingBag, label: '预约服务', color: '', iconColor: 'text-slate-500' },
                { page: 'assets' as const, Icon: ImageIcon, label: '素材库', color: '', iconColor: 'text-slate-500' },
              ].map(({ page, Icon, label, color, iconColor }) => (
                <button
                  key={page}
                  onClick={() => { onNavigate(page); onClose() }}
                  className={`w-full flex items-center gap-4 ${color || 'text-slate-650 dark:text-slate-300 hover:text-primary dark:hover:text-indigo-400'} transition-colors py-2 text-left cursor-pointer`}
                >
                  <Icon className={`w-5.5 h-5.5 ${iconColor}`} />
                  <span className="font-bold text-sm tracking-wide">{label}</span>
                </button>
              ))}
              <div className="pt-6 mt-6 border-t border-slate-200/50 dark:border-slate-700/50 space-y-4">
                <button
                  onClick={() => { onNavigate('settings'); onClose() }}
                  className="w-full flex items-center gap-4 text-slate-650 dark:text-slate-300 hover:text-primary dark:hover:text-indigo-400 transition-colors py-2 text-left cursor-pointer"
                >
                  <Settings className="w-5.5 h-5.5 text-slate-500" />
                  <span className="font-bold text-sm tracking-wide">系统设置</span>
                </button>
                <button
                  onClick={() => { window.location.href = '/api/auth/logout' }}
                  className="w-full flex items-center gap-4 text-rose-600 hover:text-rose-700 transition-colors py-2 text-left cursor-pointer"
                >
                  <LogOut className="w-5.5 h-5.5 text-rose-500" />
                  <span className="font-bold text-sm tracking-wide">退出登录</span>
                </button>
              </div>
            </nav>

            {/* Subscription footer */}
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/30 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/40 transition-colors block text-left cursor-pointer group"
              title="打开订阅管理"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">AI Marketing Crew:</span>
                <span className="text-[10px] font-black text-primary dark:text-indigo-400 uppercase tracking-wider truncate">{subscriptionPlan}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                <span className="font-bold group-hover:text-primary dark:group-hover:text-indigo-400 transition-colors">点击打开订阅管理</span>
                <span className="group-hover:translate-x-0.5 transition-transform">&rarr;</span>
              </div>
            </a>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
