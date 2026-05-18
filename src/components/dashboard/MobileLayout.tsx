'use client'
import React, { useState } from 'react'
import { Home, Calendar, Image as ImageIcon } from 'lucide-react'

import DashboardCalendar from './DashboardCalendar'
import DashboardAssets from './DashboardAssets'

interface MobileLayoutProps {
  children: React.ReactNode
}

export default function MobileLayout({ children }: MobileLayoutProps) {
  const [activeTab, setActiveTab] = useState('home')

  return (
    <div suppressHydrationWarning className="flex flex-col h-full w-full relative bg-transparent overflow-hidden font-sans transition-colors duration-300">
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto z-10 relative custom-scrollbar">
        {activeTab === 'home' && children}
        {activeTab === 'calendar' && <DashboardCalendar />}
        {activeTab === 'assets' && <DashboardAssets />}
      </div>

      {/* Kanban-Style Bottom Navigation Dock */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-40">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-lg rounded-2xl flex justify-around items-center p-1.5 overflow-hidden">
          
          <button 
            className={`flex flex-col items-center justify-center w-full py-2.5 rounded-xl transition-all duration-300 ${activeTab === 'home' ? 'bg-slate-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'}`}
            onClick={() => setActiveTab('home')}
          >
            <Home className="w-[20px] h-[20px] mb-1" />
            <span className="text-[10px] font-bold">首页</span>
          </button>

          <button 
            className={`flex flex-col items-center justify-center w-full py-2.5 rounded-xl transition-all duration-300 ${activeTab === 'calendar' ? 'bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'}`}
            onClick={() => setActiveTab('calendar')}
          >
            <Calendar className="w-[20px] h-[20px] mb-1" />
            <span className="text-[10px] font-bold">日历</span>
          </button>

          <button 
            className={`flex flex-col items-center justify-center w-full py-2.5 rounded-xl transition-all duration-300 ${activeTab === 'assets' ? 'bg-slate-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'}`}
            onClick={() => setActiveTab('assets')}
          >
            <ImageIcon className="w-[20px] h-[20px] mb-1" />
            <span className="text-[10px] font-bold">素材库</span>
          </button>
        </div>
      </div>
    </div>
  )
}
