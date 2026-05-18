'use client'

import React from 'react'
import MobileLayout from '@/components/dashboard/MobileLayout'
import DashboardHome from '@/components/dashboard/DashboardHome'

export default function DashboardPage() {
  return (
    <MobileLayout>
      <DashboardHome />
    </MobileLayout>
  )
}
