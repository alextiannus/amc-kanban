'use client'
import React, { useEffect, useState } from 'react'

interface MobileLayoutProps {
  children: React.ReactNode
}

export default function MobileLayout({ children }: MobileLayoutProps) {
  const [activeBrandId, setActiveBrandId] = useState<string | undefined>(() => {
    try {
      return window.localStorage.getItem('dashboard.activeBrandId') || undefined
    } catch {
      return undefined
    }
  })

  useEffect(() => {
    if (!activeBrandId) return
    try {
      window.localStorage.setItem('dashboard.activeBrandId', activeBrandId)
    } catch {
      // Ignore storage errors.
    }
  }, [activeBrandId])

  type ChildProps = {
    activeBrandId?: string
    onActiveBrandIdChange?: (id: string | undefined) => void
  }

  const home = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<ChildProps>, {
        activeBrandId,
        onActiveBrandIdChange: setActiveBrandId,
      })
    : children

  return (
    <div suppressHydrationWarning className="flex flex-col h-full w-full relative bg-transparent overflow-hidden font-sans transition-colors duration-300">
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto z-10 relative custom-scrollbar">
        {home}
      </div>
    </div>
  )
}
