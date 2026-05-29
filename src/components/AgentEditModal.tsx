import { useState } from 'react'
import { X, Upload, Check } from 'lucide-react'

export default function AgentEditModal({ agent, onClose, onUpdate }: { agent: any, onClose: () => void, onUpdate: () => void }) {
  const [nickname, setNickname] = useState(agent.nickname || '')
  const [introduction, setIntroduction] = useState(agent.introduction || '')
  const [workflow, setWorkflow] = useState(agent.workflow || '')
  const [insights, setInsights] = useState(agent.insights || '')
  const [chatLink, setChatLink] = useState(agent.chatLink || '')
  const [agentProvider, setAgentProvider] = useState(agent.agentProvider || 'OPENCLAW')
  const [themeColor, setThemeColor] = useState(agent.themeColor || '#10b981')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(agent.avatar || null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData()
    formData.append('nickname', nickname)
    formData.append('introduction', introduction)
    formData.append('workflow', workflow)
    formData.append('insights', insights)
    formData.append('chatLink', chatLink)
    formData.append('agentProvider', agentProvider)
    formData.append('themeColor', themeColor)
    
    if (avatarFile) {
      formData.append('avatar', avatarFile)
    }

    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        console.error('Upload failed with status:', res.status, data)
        throw new Error(data.error || `Failed to update agent (${res.status})`)
      }

      const result = await res.json()
      console.log('Avatar upload response:', result)
      console.log('Closing modal after successful upload...')
      
      // Wait a moment for the server to finish writing files, then close modal
      setIsSubmitting(false)
      setTimeout(() => {
        onUpdate()
      }, 500)
    } catch (err: any) {
      console.error('Avatar upload error:', err)
      setError(err.message)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in duration-300">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            ✏️ 编辑 AI 名片
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
          <div className="mb-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-400 font-mono flex items-center justify-between">
            <span>ID: {agent.id}</span>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(agent.id)
              }}
              className="ml-2 px-2 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-xs"
            >
              Copy
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium border border-red-100 dark:border-red-900/50">
              {error}
            </div>
          )}

          <form id="agent-edit-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="flex-shrink-0 flex flex-col items-center gap-3">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">头像</label>
                <div 
                  className="w-24 h-24 rounded-3xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center overflow-hidden relative group cursor-pointer"
                  style={themeColor ? { borderColor: themeColor } : undefined}
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
                  ) : (
                    <Upload size={24} className="text-slate-400" />
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-bold">更换</span>
                  </div>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex-1 space-y-4 w-full">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">名称 (Nickname)</label>
                  <input 
                    type="text" 
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    placeholder="例如：分析师小龙虾"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">主题色 (Theme Color)</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="color" 
                      value={themeColor}
                      onChange={(e) => setThemeColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                    />
                    <input 
                      type="text" 
                      value={themeColor}
                      onChange={(e) => setThemeColor(e.target.value)}
                      className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                      placeholder="#10b981"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">摘要 / 职位 (Insights)</label>
              <input 
                type="text" 
                value={insights}
                onChange={(e) => setInsights(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="例如：负责抓取和分析市场数据"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Chatbot 直聊链接 (chatLink)</label>
              <input
                type="url"
                value={chatLink}
                onChange={(e) => setChatLink(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="https://your-openclaw-or-ackclaw-chat-url"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Chatbot Provider</label>
              <select
                value={agentProvider}
                onChange={(e) => setAgentProvider(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="OPENCLAW">Openclaw</option>
                <option value="ACKCLAW">Ackclaw</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">个人简介 (Introduction) - 支持 Markdown</label>
              <textarea 
                value={introduction}
                onChange={(e) => setIntroduction(e.target.value)}
                rows={4}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y min-h-[100px]"
                placeholder="我是 AMC 体系中的数据分析师..."
              />
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                <p className="font-semibold mb-1">📋 请在身份简介中包含以下信息：</p>
                <ul className="space-y-0.5 ml-4 list-disc">
                  <li><span className="font-medium">品牌名</span>：你所代表的品牌或机构名称</li>
                  <li><span className="font-medium">运营平台</span>：主要运营或服务的平台</li>
                  <li><span className="font-medium">运营理念</span>：核心价值观和运营哲学</li>
                </ul>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">执行流规范 (Workflow) - 支持 Markdown</label>
              <textarea 
                value={workflow}
                onChange={(e) => setWorkflow(e.target.value)}
                rows={6}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y min-h-[120px] font-mono"
                placeholder="1. 接收需求\n2. 抓取数据\n3. 产出报告"
              />
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            form="agent-edit-form"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2"
          >
            {isSubmitting ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check size={18} />
            )}
            保存修改
          </button>
        </div>
      </div>
    </div>
  )
}
