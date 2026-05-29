'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

interface KanbanChatWidgetProps {
  brandId?: string
  brandName?: string
  taskId?: string
  userId?: string
}

const LOCAL_WEBHOOK_KEY = 'amc.openclawWebhookUrl'

export default function KanbanChatWidget({ brandId, brandName, taskId, userId }: KanbanChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [webhookUrl, setWebhookUrl] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(LOCAL_WEBHOOK_KEY) ?? ''
  })
  const [showConfig, setShowConfig] = useState(false)

  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (webhookUrl.trim()) {
      window.localStorage.setItem(LOCAL_WEBHOOK_KEY, webhookUrl.trim())
    }
  }, [webhookUrl])

  useEffect(() => {
    if (!open || !conversationId) return

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/chat/${conversationId}`)
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data.messages)) {
          setMessages(data.messages)
        }
      } catch {
        // Silent retry by next polling tick.
      }
    }, 3000)

    return () => window.clearInterval(timer)
  }, [open, conversationId])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const contextText = useMemo(() => {
    const bits: string[] = []
    if (brandName) bits.push(`品牌: ${brandName}`)
    if (brandId) bits.push(`brandId: ${brandId}`)
    if (taskId) bits.push(`taskId: ${taskId}`)
    return bits.join(' | ')
  }, [brandId, brandName, taskId])

  const canSend = !!message.trim() && !!brandId && !!userId && !sending

  const onSend = async () => {
    const trimmed = message.trim()
    if (!trimmed || !brandId || !userId) return

    setSending(true)
    setError(null)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          brandId,
          taskId,
          conversationId: conversationId ?? undefined,
          webhookUrl: webhookUrl.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || '发送失败')
        return
      }

      setConversationId(data.conversationId)
      if (Array.isArray(data.messages)) {
        setMessages(data.messages)
      }
      setMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[120] w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-colors"
          title="打开 AMC 对话"
        >
          <MessageCircle size={22} />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-[120] w-[360px] max-w-[calc(100vw-20px)] h-[520px] max-h-[calc(100vh-20px)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">AMC 对话</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{contextText || '尚未选择品牌上下文'}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50/60 dark:bg-slate-950/50">
            {messages.length === 0 ? (
              <div className="text-xs text-slate-400 px-2 py-1">开始对话后会显示历史消息</div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[86%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'ml-auto bg-emerald-500 text-white rounded-br-md'
                      : 'mr-auto bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-md'
                  }`}
                >
                  {m.content}
                </div>
              ))
            )}
          </div>

          <div className="px-3 pt-2 pb-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
            <button
              onClick={() => setShowConfig(v => !v)}
              className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {showConfig ? '隐藏 Webhook 配置' : '配置 Webhook URL'}
            </button>

            {showConfig && (
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-openclaw-webhook-url/api/chat"
                className="w-full text-xs px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-100"
              />
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex items-end gap-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={brandId ? '输入消息...' : '请先选择品牌后再发送'}
                rows={2}
                className="flex-1 resize-none text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    onSend()
                  }
                }}
              />
              <button
                onClick={onSend}
                disabled={!canSend}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  canSend
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
                title="发送"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
