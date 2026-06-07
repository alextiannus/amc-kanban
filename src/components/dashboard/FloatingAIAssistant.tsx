'use client'
import React, { useState, useRef, useEffect } from 'react'
import { X, Sparkles, ImageIcon, Mic, Send } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Message {
  id: number | string
  role: 'user' | 'ai' | 'system'
  content: string
  quickReplies?: string[]
  imageUrl?: string
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 0, role: 'system',
    content: '我是你的 AI 数字运营官 🦞 — 投喂我素材，告诉我你想做什么，剩下的交给我。'
  },
  {
    id: 1, role: 'ai',
    content: '老板好！今日有 2 条待您批准的帖子，还有一条 Google 差评需要您确认回复话术。需要先处理哪个？',
    quickReplies: ['先看差评', '先审核帖子', '全都先发吧']
  }
]

export default function FloatingAIAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const createMessageId = () => crypto.randomUUID()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isOpen])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  const sendMessage = (text: string) => {
    if (!text.trim()) return
    const userMsg: Message = { id: createMessageId(), role: 'user', content: text }
    setMessages(p => [...p, userMsg])
    setInputText('')
    setIsTyping(true)

    // Simulated AI responses
    setTimeout(() => {
      setIsTyping(false)
      let aiResponse: Message

      if (text.includes('差评') || text.includes('Google')) {
        aiResponse = {
          id: createMessageId(), role: 'ai',
          content: '收到！Google Maps 那条 2 星差评我已经准备好 3 套回复方案。推荐使用方案 A：\n\n"非常抱歉给您带来了不好的体验！我们正在优化等位体验，并为您提供一张专属 15% 折扣券，诚邀您再次光临。"',
          quickReplies: ['发送方案 A', '看看方案 B', '自己再改改']
        }
      } else if (text.includes('帖子') || text.includes('审核')) {
        aiResponse = {
          id: createMessageId(), role: 'ai',
          content: '两条帖子都已就绪 ✅\n\n① 母亲节预热 (IG) — 图文帖，计划今晚 8PM 发布\n② 波士顿龙虾新品 (小红书) — 笔记，建议明天中午\n\n您要一起批准，还是分开看？',
          quickReplies: ['全部批准！', '先看 IG 那条', '先看小红书']
        }
      } else if (text.includes('发') || text.includes('批准') || text.includes('ok') || text.toLowerCase().includes('ok')) {
        aiResponse = {
          id: createMessageId(), role: 'ai',
          content: '👍 明白！已加入发布队列，PostFast 会在指定时间自动发布。\n\n发布后我会在这里通知您数据表现，通常 2 小时后会有初步互动数据。',
          quickReplies: ['好的，辛苦了', '顺便帮我看看 TikTok']
        }
      } else {
        aiResponse = {
          id: createMessageId(), role: 'ai',
          content: '明白！我来处理。您还需要我做什么？',
          quickReplies: ['查看今日计划', '投喂新素材', '没了，辛苦']
        }
      }
      setMessages(p => [...p, aiResponse])
    }, 1200)
  }

  const handleQuickReply = (text: string) => sendMessage(text)

  return (
    <>
      {/* ── Backdrop on mobile ──────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 z-50 md:hidden"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Main Container ──────────────────────────────────────────── */}
      <motion.div
        layout
        className={`fixed z-50 shadow-2xl overflow-hidden
          ${isOpen
            ? 'bottom-0 left-0 right-0 h-[90vh] rounded-t-3xl md:bottom-6 md:right-6 md:left-auto md:w-[400px] md:h-[680px] md:rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800'
            : 'bottom-24 right-5 md:bottom-8 md:right-8 w-14 h-14 md:w-16 md:h-16 rounded-full'}`}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ originX: 1, originY: 1 }}
      >
        {!isOpen ? (
          // ── FAB Button ────────────────────────────────────────────
          <motion.button
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
            onClick={() => setIsOpen(true)}
            className="w-full h-full rounded-full flex items-center justify-center relative outline-none"
          >
            <div className="absolute inset-0 bg-slate-900 dark:bg-slate-100 rounded-full shadow-lg" />
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-1 bg-white/10 dark:bg-black/10 rounded-full"
            />
            <Sparkles className="w-6 h-6 md:w-7 md:h-7 z-10 text-white dark:text-slate-900" />
            {/* Notification dot */}
            <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-500 border-2 border-white dark:border-slate-950 rounded-full" />
          </motion.button>
        ) : (
          // ── Chat Panel ────────────────────────────────────────────
          <div className="flex flex-col h-full">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-slate-900 dark:bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-white dark:text-slate-900" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">AI 运营官</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-500">在线 · 随时待命</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.map(msg => (
                <div key={msg.id}>
                  {msg.role === 'system' && (
                    <div className="text-center mb-2">
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full tracking-widest">
                        {msg.content}
                      </span>
                    </div>
                  )}

                  {msg.role === 'user' && (
                    <div className="flex justify-end">
                      <div className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-3xl rounded-tr-lg px-4 py-3 max-w-[80%] text-sm font-medium leading-relaxed shadow-sm">
                        {msg.content}
                      </div>
                    </div>
                  )}

                  {msg.role === 'ai' && (
                    <div className="flex justify-start gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 mt-1">
                        <Sparkles className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      </div>
                      <div className="flex-1">
                        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 rounded-3xl rounded-tl-lg px-4 py-3 max-w-[90%] text-sm leading-relaxed shadow-sm whitespace-pre-line">
                          {msg.content}
                        </div>
                        {/* Quick Replies */}
                        {msg.quickReplies && (
                          <div className="flex flex-wrap gap-2 mt-2.5 pl-1">
                            {msg.quickReplies.map((qr, i) => (
                              <button key={i} onClick={() => handleQuickReply(qr)}
                                className="text-[12px] font-bold bg-white dark:bg-slate-900 hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full transition-all shadow-sm active:scale-95">
                                {qr}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex justify-start gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 rounded-3xl rounded-tl-lg px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="flex-shrink-0 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4 pb-6 md:pb-4">
              {voiceMode ? (
                // Voice mode
                <div className="flex flex-col items-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onPointerDown={() => {}} onPointerUp={() => setVoiceMode(false)}
                    className="w-full py-4 flex items-center justify-center gap-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-base shadow-md"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.2, repeat: Infinity }}
                      className="w-5 h-5 bg-red-500 rounded-full"
                    />
                    <Mic className="w-5 h-5" /> 按住说话（松开发送）
                  </motion.button>
                  <button onClick={() => setVoiceMode(false)} className="text-xs font-bold text-slate-400 hover:text-slate-600">切换文字输入</button>
                </div>
              ) : (
                // Text mode
                <div className="flex items-end gap-2">
                  <label className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                    <ImageIcon className="w-4 h-4" />
                    <input type="file" multiple accept="image/*,video/*" className="hidden" />
                  </label>
                  <div className="flex-1 flex items-end gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-slate-900/10 dark:focus-within:ring-white/10 transition-all">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputText) } }}
                      placeholder="发指令，投素材，或者直接问…"
                      className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 resize-none max-h-24"
                    />
                  </div>
                  {inputText.trim() ? (
                    <button
                      onClick={() => sendMessage(inputText)}
                      className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors shadow-sm"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setVoiceMode(true)}
                      className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </motion.div>
    </>
  )
}
