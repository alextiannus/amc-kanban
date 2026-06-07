'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type InvitationData = {
  email: string
  username: string
  password: string
  welcomeMessage: string
  createdAt: number
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const [data, setData] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const token = params.token as string

  useEffect(() => {
    let cancelled = false

    async function loadInvitation() {
      if (!token) {
        setError('无效的邀请链接')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`/api/invite/${encodeURIComponent(token)}`)
        const payload = await response.json()

        if (cancelled) return

        if (!response.ok) {
          setError(payload?.error || '无效的邀请链接')
        } else {
          setData(payload.invitationData)
        }
      } catch {
        if (!cancelled) setError('无效的邀请链接')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadInvitation()

    return () => {
      cancelled = true
    }
  }, [token])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleLogin = async () => {
    if (!token) {
      router.push('/')
      return
    }

    setClaiming(true)
    try {
      await fetch(`/api/invite/${encodeURIComponent(token)}`, { method: 'POST' })
    } finally {
      setClaiming(false)
      router.push('/')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="text-white">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6 max-w-md w-full">
          <h1 className="text-xl font-bold text-red-400 mb-2">错误</h1>
          <p className="text-red-200">{error}</p>
          <button
            onClick={handleLogin}
            className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            返回登录
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-8 max-w-2xl w-full">
        {/* 欢迎标题 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            欢迎加入 AI Marketing Crew！
          </h1>
          <p className="text-slate-300 text-lg">您已成功收到邀请链接</p>
        </div>

        {/* 欢迎消息 */}
        <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-6 mb-8">
          <p className="text-blue-100 whitespace-pre-wrap leading-relaxed">
            {data.welcomeMessage}
          </p>
        </div>

        {/* 登录凭证 */}
        <div className="space-y-6 mb-8">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              邮箱 / 用户名
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={data.email}
                readOnly
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white font-mono"
              />
              <button
                onClick={() => copyToClipboard(data.email)}
                className="px-3 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
                title="复制"
              >
                {copied && data.email === data.email ? '✓' : '📋'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              临时密码
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={data.password}
                readOnly
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white font-mono"
              />
              <button
                onClick={() => copyToClipboard(data.password)}
                className="px-3 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
                title="复制"
              >
                {copied && data.password === data.password ? '✓' : '📋'}
              </button>
            </div>
          </div>
        </div>

        {/* 注意事项 */}
        <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 mb-8">
          <p className="text-yellow-100 text-sm">
            <span className="font-semibold">⚠️ 重要提示：</span> 这是一个临时密码，仅显示一次。请妥善保管，登录后请立即修改密码。
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-4">
          <button
            onClick={handleLogin}
            disabled={claiming}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            {claiming ? '处理中...' : '前往登录'}
          </button>
          <button
            onClick={() => {
              const text = `
欢迎邀请链接 - AI Marketing Crew

${data.welcomeMessage}

邀请链接: ${window.location.href}

此链接有效期为7天。
              `
              copyToClipboard(text)
            }}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition font-semibold"
          >
            复制全部信息
          </button>
        </div>

        {/* 底部提示 */}
        <p className="text-center text-slate-400 text-sm mt-6">
          此邀请链接有效期为 7 天，请尽快使用
        </p>
      </div>
    </div>
  )
}
