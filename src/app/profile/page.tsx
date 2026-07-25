'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
  User as UserIcon, Mail, Shield, ShieldCheck, Key, Copy, Check, 
  Edit3, Save, ArrowLeft, Users, RefreshCw, Eye, EyeOff 
} from 'lucide-react'

type ProfileAgent = {
  id: string
  email: string
  chatLink?: string | null
  driveFolder?: string | null
}

type ProfileData = {
  id: string
  avatar?: string | null
  nickname?: string | null
  email: string
  role: string
  type: string
  inviteCode?: string | null
  dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
  userRoles?: string[]
  introduction?: string | null
  permittedAgents: Array<{ agent: ProfileAgent }>
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [principalOpening, setPrincipalOpening] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Edit states
  const [isEditing, setIsEditing] = useState(false)
  const [nickname, setNickname] = useState('')
  const [introduction, setIntroduction] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type })
    setTimeout(() => setToastMsg(null), 3000)
  }

  useEffect(() => {
    router.prefetch('/profile/principal')
  }, [router])

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/profile')
      if (res.ok) {
        const data = await res.json() as ProfileData
        setProfile(data)
        setNickname(data.nickname || '')
        setIntroduction(data.introduction || '')
      } else {
        router.push('/')
      }
    } catch (err) {
      console.error('Fetch profile failed:', err)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchProfile()
    })
  }, [fetchProfile])

  const handleCopyInvite = () => {
    const code = profile?.inviteCode || 'AMC-MEMBER'
    const link = `https://amc-mm.immedi.ai/register?ref=${code}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    showToast('专属邀请推广链接已复制！')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password && password !== confirmPassword) {
      showToast('两次输入的密码不一致', 'error')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: nickname.trim(),
          introduction: introduction.trim(),
          ...(password ? { password } : {})
        })
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Update failed')
      }

      showToast('个人资料更新成功！')
      setIsEditing(false)
      setPassword('')
      setConfirmPassword('')
      // refresh
      fetchProfile()
    } catch (err: any) {
      console.error('Update profile failed:', err)
      showToast(err.message || '更新个人资料失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const profileRoles = profile?.userRoles || (profile?.dashboardRole === 'ADMIN' ? ['ADMIN'] : profile?.dashboardRole === 'BRAND_DIRECTOR' ? ['AMC_PRINCIPAL'] : profile?.dashboardRole === 'BRAND_OWNER' ? ['BRAND_OWNER'] : [])
  const canAccessPrincipalDashboard = profileRoles.includes('ADMIN') || profileRoles.includes('AMC_PRINCIPAL')
  const canAccessConnectGuide = profileRoles.includes('ADMIN') || profileRoles.includes('BRAND_OWNER')

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 min-h-screen flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="font-bold text-sm">正在加载个人资料...</span>
      </div>
    )
  }

  if (!profile) return <div className="p-8 text-center text-slate-500">无法载入个人资料</div>

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto min-h-screen space-y-8 font-sans">
      
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold transition-all flex items-center gap-2.5 animate-bounce ${
          toastMsg.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400'
            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400'
        }`}>
          <CheckCircle2 size={15} className="flex-shrink-0" />
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2 tracking-tight">
            <UserIcon className="text-indigo-600 dark:text-indigo-400 w-5.5 h-5.5" />
            <span>个人中心 & 账户设置</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">管理个人基本资料、专属邀请码以及授权绑定的智能体助手</p>
        </div>
        
        <div className="flex items-center gap-2.5 flex-wrap">
          {canAccessConnectGuide && (
            <button
              onClick={() => router.push('/connect')}
              className="rounded-xl bg-cyan-50 hover:bg-cyan-100/85 text-cyan-700 dark:bg-cyan-950/30 dark:hover:bg-cyan-950/50 dark:text-cyan-400 px-3.5 py-2 text-xs font-bold transition-all active:scale-[0.97] cursor-pointer"
            >
              连接指南
            </button>
          )}
          {canAccessPrincipalDashboard && (
            <button
              onClick={() => { setPrincipalOpening(true); router.push('/profile/principal') }}
              disabled={principalOpening}
              className="rounded-xl bg-indigo-50 hover:bg-indigo-100/85 text-indigo-755 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50 dark:text-indigo-400 px-3.5 py-2 text-xs font-bold disabled:opacity-50 transition-all active:scale-[0.97] cursor-pointer"
            >
              {principalOpening ? '打开中...' : '主理人看板'}
            </button>
          )}
          <button 
            onClick={() => router.push('/board')} 
            className="flex items-center gap-1.5 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold transition-all active:scale-[0.97] cursor-pointer shadow-sm"
          >
            <ArrowLeft size={13} />
            <span>返回看板</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="space-y-6">
        
        {/* Card 1: Profile Form/View */}
        <div className="bg-white dark:bg-slate-900/60 p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/80 shadow-sm relative">
          
          <div className="absolute top-6 right-6">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-indigo-650 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer active:scale-[0.97] transition-all"
              >
                <Edit3 size={13} />
                <span>编辑资料</span>
              </button>
            )}
          </div>

          <h2 className="text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6">账号基础信息</h2>

          {!isEditing ? (
            <div className="space-y-6">
              
              {/* User avatar and email info */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-indigo-50 dark:bg-indigo-950/20 border border-slate-200/60 dark:border-slate-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-extrabold text-lg shrink-0 shadow-sm">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="User avatar" className="w-full h-full object-cover" />
                  ) : (
                    (profile.nickname || profile.email).charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800 dark:text-white leading-tight">{profile.nickname || '未设置昵称'}</h3>
                  <p className="text-xs text-slate-450 mt-1 dark:text-slate-400">账号类型: {profile.type}</p>
                </div>
              </div>

              {/* Details layout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t border-slate-100 dark:border-slate-800/80">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">电子邮箱</span>
                  <span className="text-xs text-slate-700 dark:text-slate-200 font-bold">{profile.email}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">业务角色权限</span>
                  <span className="text-xs text-slate-700 dark:text-slate-200 font-bold">
                    {profileRoles.length ? profileRoles.join(' / ') : 'STANDARD_USER'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">我的邀请码</span>
                  <span className="text-xs text-indigo-650 dark:text-indigo-400 font-extrabold select-all">
                    {profile.inviteCode || 'AMC-MOCK'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">专属分享链接</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-700 dark:text-slate-200 font-bold truncate max-w-[200px]" title={`https://amc-mm.immedi.ai/register?ref=${profile.inviteCode}`}>
                      {profile.inviteCode ? `https://amc-mm.immedi.ai/register?ref=${profile.inviteCode}` : 'N/A'}
                    </span>
                    {profile.inviteCode && (
                      <button
                        onClick={handleCopyInvite}
                        className="text-slate-400 hover:text-indigo-600 p-0.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer active:scale-95 transition-all shrink-0"
                        title="复制链接"
                      >
                        {copied ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {profile.introduction && (
                <div className="p-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">个人简介</p>
                  <p className="text-xs text-slate-600 dark:text-slate-350 font-medium leading-relaxed whitespace-pre-wrap">{profile.introduction}</p>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">您的昵称</label>
                <input
                  type="text"
                  required
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:border-indigo-500 focus:outline-none dark:text-white font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">身份简介</label>
                <textarea
                  rows={3}
                  placeholder="简短介绍您的职位或主要经营方向..."
                  value={introduction}
                  onChange={(e) => setIntroduction(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:border-indigo-500 focus:outline-none dark:text-white font-medium"
                />
              </div>

              <div className="pt-5 border-t border-slate-100 dark:border-slate-800/80 space-y-4">
                <h3 className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Key size={14} className="text-slate-400" />
                  <span>修改登录密码（可选）</span>
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400">新密码</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="留空则不修改"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 pr-9 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:border-indigo-500 focus:outline-none dark:text-white font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-655 focus:outline-none cursor-pointer"
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400">确认新密码</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="再次输入以确认"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:border-indigo-500 focus:outline-none dark:text-white font-semibold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-5 border-t border-slate-100 dark:border-slate-800/80 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    setNickname(profile.nickname || '')
                    setIntroduction(profile.introduction || '')
                    setPassword('')
                    setConfirmPassword('')
                  }}
                  className="py-2.5 px-4 text-xs border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-350 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer active:scale-[0.97] transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="py-2.5 px-4 text-xs bg-indigo-655 hover:bg-indigo-600 text-white rounded-xl font-extrabold cursor-pointer active:scale-[0.97] disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {saving && <RefreshCw size={13} className="animate-spin" />}
                  <Save size={13} />
                  <span>保存更新</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function CheckCircle2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
