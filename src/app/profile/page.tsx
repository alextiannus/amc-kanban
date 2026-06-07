'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type ProfileAgent = {
  id: string
  email: string
  chatLink?: string | null
  driveFolder?: string | null
}

type ProfileData = {
  avatar?: string | null
  nickname?: string | null
  email: string
  role: string
  type: string
  dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
  introduction?: string | null
  permittedAgents: Array<{ agent: ProfileAgent }>
}

type VisibleAgent = {
  id: string
  email: string
  nickname?: string | null
  chatLink?: string | null
  driveFolder?: string | null
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [visibleAgents, setVisibleAgents] = useState<VisibleAgent[]>([])
  const router = useRouter()

  const fetchProfile = useCallback(async () => {
    const res = await fetch('/api/profile')
    if (res.ok) {
      const data = await res.json() as ProfileData
      setProfile(data)

      const canManageAgents = data.dashboardRole === 'ADMIN' || data.dashboardRole === 'BRAND_DIRECTOR'
      if (canManageAgents) {
        const agentsRes = await fetch('/api/agents')
        if (agentsRes.ok) {
          const agentsData = await agentsRes.json() as VisibleAgent[]
          setVisibleAgents(agentsData)
          return
        }
      }

      setVisibleAgents(
        data.permittedAgents.map((pa) => ({
          id: pa.agent.id,
          email: pa.agent.email,
          chatLink: pa.agent.chatLink,
          driveFolder: pa.agent.driveFolder,
        }))
      )
    } else {
      router.push('/')
    }
  }, [router])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchProfile()
    })
  }, [fetchProfile])

  const canManageAgents = profile?.dashboardRole === 'ADMIN' || profile?.dashboardRole === 'BRAND_DIRECTOR'

  if (!profile) return <div className="p-8 text-center text-gray-500">Loading profile...</div>

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Profile</h1>
        <div className="flex items-center gap-3">
          {(profile.dashboardRole === 'ADMIN' || profile.dashboardRole === 'BRAND_DIRECTOR') && (
            <button
              onClick={() => router.push('/profile/principal')}
              className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-2 text-sm font-semibold"
            >
              主理人看板
            </button>
          )}
          <button onClick={() => router.push('/board')} className="text-blue-600 hover:underline dark:text-blue-400">
            &larr; Back to Board
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
        <h2 className="text-xl font-semibold mb-2 dark:text-white">Basic Information</h2>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 font-bold">
            {profile.avatar ? (
              <img src={profile.avatar} alt="User avatar" className="w-full h-full object-cover" />
            ) : (
              (profile.nickname || profile.email).charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <p className="text-gray-900 dark:text-white font-semibold">{profile.nickname || '未设置昵称'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">可在右上角 个人设置 中上传和修改头像</p>
          </div>
        </div>
        <div className="space-y-2 text-gray-700 dark:text-gray-300">
          <p><span className="font-medium">Nickname:</span> {profile.nickname || '-'}</p>
          <p><span className="font-medium">Email:</span> {profile.email}</p>
          <p><span className="font-medium">Role:</span> {profile.role}</p>
          <p><span className="font-medium">Account Type:</span> {profile.type}</p>
          {profile.introduction && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">📋 身份简介：</p>
              <p className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap">{profile.introduction}</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold dark:text-white">当前用户 AMC Agent</h2>
          {canManageAgents && (
            <button
              onClick={() => router.push('/board/agents')}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              添加新 Agent
            </button>
          )}
        </div>
        {visibleAgents.length === 0 ? (
          <p className="text-gray-500">当前暂无可用 Agent。</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleAgents.map((agent) => {
              return (
                <Link key={agent.id} href={`/agents/${agent.id}`} className="block bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-500 transition-colors">
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">{agent.nickname || agent.email}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{agent.email}</p>
                  <div className="flex gap-2 mt-3">
                    {agent.chatLink && (
                      <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 px-2 py-1 rounded">Has Chat</span>
                    )}
                    {agent.driveFolder && (
                      <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 px-2 py-1 rounded">Has Drive</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
