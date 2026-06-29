'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

        const roles = data.userRoles || (data.dashboardRole === 'ADMIN' ? ['ADMIN'] : data.dashboardRole === 'BRAND_DIRECTOR' ? ['AMC_PRINCIPAL'] : data.dashboardRole === 'BRAND_OWNER' ? ['BRAND_OWNER'] : [])
        const canManageAgents = roles.includes('ADMIN') || roles.includes('AMC_PRINCIPAL')
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
  const canManageAgents = profileRoles.includes('ADMIN') || profileRoles.includes('AMC_PRINCIPAL')
  const canAccessConnectGuide = profileRoles.includes('ADMIN') || profileRoles.includes('BRAND_OWNER')

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 min-h-screen flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="font-bold text-sm">正在加载个人资料...</span>
      </div>
    )
  }

  if (!profile) return <div className="p-8 text-center text-gray-500">无法载入个人资料</div>

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto min-h-screen bg-slate-50/50 dark:bg-slate-900/10 space-y-6">
      
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-black transition-all flex items-center gap-2 ${
          toastMsg.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400'
            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400'
        }`}>
          <CheckCircle2 size={14} />
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-850 dark:text-white flex items-center gap-2">
            <UserIcon className="text-indigo-500 w-6 h-6" />
            <span>个人中心 & 账户设置</span>
          </h1>
          <p className="text-xs text-slate-450 mt-1">查看和管理您的个人背景资料、专属邀请码以及智能体访问权限</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canAccessConnectGuide && (
            <button
              onClick={() => router.push('/connect')}
              className="rounded-xl bg-cyan-600 text-white px-4 py-2 text-xs font-bold hover:bg-cyan-500 transition-all cursor-pointer active:scale-95 shadow-sm"
            >
              连接指南
            </button>
          )}
          {canManageAgents && (
            <button
              onClick={() => { setPrincipalOpening(true); router.push('/profile/principal') }}
              disabled={principalOpening}
              className="rounded-xl bg-slate-850 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-xs font-bold disabled:opacity-70 transition-all cursor-pointer active:scale-95 shadow-sm"
            >
              {principalOpening ? '打开中...' : '主理人看板'}
            </button>
          )}
          <button 
            onClick={() => router.push('/board')} 
            className="flex items-center gap-1 text-slate-650 hover:text-slate-800 dark:text-slate-350 dark:hover:text-white px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold transition-all active:scale-95 cursor-pointer"
          >
            <ArrowLeft size={13} />
            <span>返回看板</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Side: General Profile Card */}
        <div className="md:col-span-2 space-y-6">
          
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-850 shadow-sm relative">
            <div className="absolute top-6 right-6">
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer active:scale-95 transition-colors"
                >
                  <Edit3 size={13} />
                  <span>编辑资料</span>
                </button>
              )}
            </div>

            <h2 className="text-sm font-black text-slate-850 dark:text-white mb-6 uppercase tracking-wider">账号基础信息</h2>

            {!isEditing ? (
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-indigo-50 dark:bg-indigo-950/30 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-indigo-650 dark:text-indigo-400 font-black text-xl shrink-0 shadow-sm">
                    {profile.avatar ? (
                      <img src={profile.avatar} alt="User avatar" className="w-full h-full object-cover" />
                    ) : (
                      (profile.nickname || profile.email).charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <p className="text-base font-black text-slate-850 dark:text-white leading-tight">{profile.nickname || '未设置昵称'}</p>
                    <p className="text-xs text-slate-450 mt-1">账号类型: {profile.type}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-850">
                  <div>
                    <label className="text-[10px] font-black text-slate-450 uppercase tracking-widest block mb-0.5">电子邮箱</label>
                    <span className="text-xs text-slate-700 dark:text-slate-200 font-bold">{profile.email}</span>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-450 uppercase tracking-widest block mb-0.5">业务身份角色</label>
                    <span className="text-xs text-slate-700 dark:text-slate-200 font-bold">
                      {profileRoles.length ? profileRoles.join(' / ') : 'STANDARD_USER'}
                    </span>
                  </div>
                </div>

                {profile.introduction && (
                  <div className="mt-4 p-4 bg-indigo-50/20 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100/30 dark:border-indigo-900/30">
                    <p className="text-[10px] font-black text-indigo-650 dark:text-indigo-400 mb-1">📋 身份简介：</p>
                    <p className="text-xs text-slate-700 dark:text-slate-350 whitespace-pre-wrap font-medium leading-relaxed">{profile.introduction}</p>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-450 uppercase tracking-widest">您的昵称</label>
                  <input
                    type="text"
                    required
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-850 bg-transparent focus:border-indigo-500 focus:outline-none dark:text-white font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-450 uppercase tracking-widest">身份简介</label>
                  <textarea
                    rows={3}
                    placeholder="简短介绍您的职位或主要经营方向..."
                    value={introduction}
                    onChange={(e) => setIntroduction(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-850 bg-transparent focus:border-indigo-500 focus:outline-none dark:text-white font-medium"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-850 space-y-3">
                  <h3 className="text-xs font-black text-slate-800 dark:text-slate-200">修改登录密码（可选）</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400">新密码</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="留空则不修改"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-3.5 py-2 pr-8 text-xs rounded-xl border border-slate-200 dark:border-slate-850 bg-transparent focus:border-indigo-500 focus:outline-none dark:text-white font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                        >
                          {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400">确认新密码</label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="再次输入以确认"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-850 bg-transparent focus:border-indigo-500 focus:outline-none dark:text-white font-semibold"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-850 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false)
                      setNickname(profile.nickname || '')
                      setIntroduction(profile.introduction || '')
                      setPassword('')
                      setConfirmPassword('')
                    }}
                    className="py-2 px-4 text-xs border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-350 rounded-xl font-bold hover:bg-slate-50 cursor-pointer active:scale-95 transition-all"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="py-2 px-4 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black cursor-pointer active:scale-95 disabled:opacity-50 transition-all flex items-center gap-1.5"
                  >
                    {saving && <RefreshCw size={13} className="animate-spin" />}
                    <Save size={13} />
                    <span>保存更新</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* AMC Agent Listing */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-850 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-sm font-black text-slate-850 dark:text-white uppercase tracking-wider">已授权的可视化智能体 (AMC Agents)</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">您有权限对其运行状态及创作看板进行管理的 AI 数字代理人</p>
              </div>
              {canManageAgents && (
                <button
                  onClick={() => router.push('/board/agents')}
                  className="inline-flex items-center rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-black text-white hover:bg-indigo-550 transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  添加新 Agent
                </button>
              )}
            </div>
            {visibleAgents.length === 0 ? (
              <p className="text-xs text-slate-400 italic">当前暂无可用 Agent 授权。</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {visibleAgents.map((agent) => {
                  return (
                    <Link 
                      key={agent.id} 
                      href={`/agents/${agent.id}`} 
                      className="block bg-slate-50/50 dark:bg-slate-850/30 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 hover:border-indigo-500 transition-colors"
                    >
                      <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 mb-0.5">{agent.nickname || agent.email}</h3>
                      <p className="text-[10px] text-slate-400 font-bold mb-2">{agent.email}</p>
                      <div className="flex gap-1.5 mt-2">
                        {agent.chatLink && (
                          <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-100/30">
                            语音聊天已启用
                          </span>
                        )}
                        {agent.driveFolder && (
                          <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400 px-2 py-0.5 rounded-lg border border-indigo-100/30">
                            谷歌云盘对接
                          </span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Invite Code & Fission Card */}
        <div className="space-y-6">
          <div className="bg-gradient-to-tr from-indigo-600 to-indigo-700 p-6 rounded-3xl text-white shadow-md shadow-indigo-500/10 relative overflow-hidden">
            <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10 pointer-events-none">
              <Users className="w-36 h-36" />
            </div>
            
            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-200 mb-2">您的裂变邀请码</h3>
            <p className="text-sm font-black mb-4">邀请他人注册并获取专属福利</p>

            <div className="bg-indigo-950/30 border border-indigo-400/20 p-4 rounded-2xl flex flex-col items-center gap-3">
              <div className="w-36 h-36 bg-white p-2 rounded-2xl flex items-center justify-center shadow-inner">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`https://amc-mm.immedi.ai/register?ref=${profile.inviteCode || 'AMC'}`)}`} 
                  alt="Referral QR Code" 
                  className="w-full h-full object-contain"
                />
              </div>
              
              <div className="flex flex-col items-center gap-1 w-full">
                <code className="text-xl font-black bg-indigo-950/40 text-white border border-indigo-500/20 px-4 py-1.5 rounded-xl block text-center w-full">
                  {profile.inviteCode || 'AMC-MOCK'}
                </code>
                <span className="text-[9px] text-indigo-200 mt-1 font-bold">扫码快速注册推荐</span>
              </div>
            </div>

            <button
              onClick={handleCopyInvite}
              className="w-full mt-4 bg-white text-indigo-700 hover:bg-slate-50 py-2.5 rounded-2xl text-xs font-black shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? '推广链接已复制' : '复制专属邀请链接'}</span>
            </button>
            
            <p className="text-[9px] text-indigo-200/80 leading-normal mt-3 text-center">
              长按或扫描二维码直接开通账号。被邀请人在首次完成套餐订阅后，您将获得对应裂变奖励。
            </p>
          </div>
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
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
