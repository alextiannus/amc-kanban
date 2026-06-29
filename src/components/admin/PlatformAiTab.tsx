'use client'

import React, { useState } from 'react'
import { 
  Bot, Edit3, Save, RefreshCw, FolderOpen, AlertCircle, Database, ChevronRight, Download
} from 'lucide-react'
import { type UserRecord } from './UsersTab'
import TrainingDataSection from '../TrainingDataSection'

interface PlatformAiTabProps {
  users: UserRecord[]
  brands: { id: string; name: string }[]
  loading: boolean
  actionLoading: Record<string, string>
  onSaveAgentDraft: (agentId: string, draft: any) => Promise<boolean>
  onCreateUser: (email: string, type: string, role: string) => Promise<void>
  onFetchUsers: () => Promise<void>
}

const PLATFORM_AGENTS_SPEC = [
  {
    email: 'copywriter@platform.amc',
    nickname: 'AMC Copywriter',
    introduction: '系统爆款文案与排版生成助理，精通各大社交平台（Instagram、小红书、TikTok）流行语态与高转化率营销文案的拟定。',
    workflow: '你是一个专业的社交媒体营销文案策划员工。你的日常工作执行流程如下：\n1. 仔细分析给定的商品/菜品爆款主题与图片上下文；\n2. 提取用户痛点并匹配高感官共鸣的核心钩子（Creative Hook）；\n3. 生成极具感染力、富含 emoji 表情的多语种文案；\n4. 严格适配小红书、IG、TikTok 等平台的字数与标签（Hashtag）规格限制。',
    themeColor: '#4f46e5',
  },
  {
    email: 'designer@platform.amc',
    nickname: 'AMC Designer',
    introduction: '系统视觉设计与美化排版助理，专门负责静态图片的美化滤镜评估、创意构图优化建议、促销水印叠加排版。',
    workflow: '你是一个专业的社交媒体视觉设计助理。你的日常工作执行流程如下：\n1. 评估原始图片色调、光影以及主体构图；\n2. 进行色彩增强优化并给出二次剪裁与排版建议；\n3. 根据品牌标准叠加相应的营销促销标签或品牌水印；\n4. 导出符合主流社交媒体规格要求的图片构想。',
    themeColor: '#ec4899',
  },
  {
    email: 'researcher@platform.amc',
    nickname: 'AMC Researcher',
    introduction: '商圈与社交媒体热点检索助理，负责监控周边竞品营销动向与实时网络热词，生成高转化灵感选题策略。',
    workflow: '你是一个专业的餐饮行业商圈热点研究专家。你的日常工作执行流程如下：\n1. 基于当前地理商圈定位，抓取竞争对手的营销发帖动态；\n2. 识别本周社媒热门话题与餐饮探店领域流行热词；\n3. 结合本周商户菜品生成针对性的一键创意文案选题提案。',
    themeColor: '#f59e0b',
  }
]

export default function PlatformAiTab({
  users,
  brands,
  loading,
  actionLoading,
  onSaveAgentDraft,
  onCreateUser,
  onFetchUsers
}: PlatformAiTabProps) {
  const [editingAgent, setEditingAgent] = useState<UserRecord | null>(null)
  const [agentDraft, setAgentDraft] = useState({
    nickname: '',
    introduction: '',
    workflow: '',
    themeColor: '',
    chatLink: '',
    driveFolder: '',
  })
  const [initializing, setInitializing] = useState(false)
  const [showModelGuide, setShowModelGuide] = useState(false)

  // Find platform agents in the users list
  const getPlatformAgent = (email: string) => users.find(u => u.email === email && u.type === 'AI_AGENT')

  const handleInitializePlatformAgents = async () => {
    setInitializing(true)
    try {
      for (const spec of PLATFORM_AGENTS_SPEC) {
        const exist = getPlatformAgent(spec.email)
        if (!exist) {
          // Register the AI Agent user
          const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: spec.email, type: 'AI_AGENT', role: 'USER' }),
          })
          if (res.ok) {
            const data = await res.json()
            const newAgentId = data.user?.id
            if (newAgentId) {
              // Update prompt/instructions
              await onSaveAgentDraft(newAgentId, {
                nickname: spec.nickname,
                introduction: spec.introduction,
                workflow: spec.workflow,
                themeColor: spec.themeColor,
              })
            }
          }
        }
      }
      await onFetchUsers()
      alert('平台级 AI 员工已成功初始化并写入数据库。')
    } catch (e) {
      console.error(e)
      alert('初始化失败，请检查网络日志。')
    } finally {
      setInitializing(false)
    }
  }

  const handleOpenEdit = (agent: UserRecord) => {
    setEditingAgent(agent)
    setAgentDraft({
      nickname: agent.nickname || '',
      introduction: agent.introduction || '',
      workflow: agent.workflow || '',
      themeColor: agent.themeColor || '#6366f1',
      chatLink: agent.chatLink || '',
      driveFolder: agent.driveFolder || '',
    })
  }

  const handleSaveLocal = async () => {
    if (!editingAgent) return
    const success = await onSaveAgentDraft(editingAgent.id, agentDraft)
    if (success) {
      setEditingAgent(null)
    }
  }

  const allInitialized = PLATFORM_AGENTS_SPEC.every(spec => !!getPlatformAgent(spec.email))

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Info */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Bot size={18} className="text-blue-500" /> 平台 AI 与智能语料微调中心
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            在此管理平台底座的核心原子 AI 员工（文案策划、视觉设计、商圈检索）的系统 Prompt 指令，并导出各品牌的对话语料用于专有模型的微调训练。
          </p>
        </div>
        {!allInitialized && (
          <button
            onClick={handleInitializePlatformAgents}
            disabled={initializing || loading}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-650 hover:bg-blue-700 text-white font-extrabold text-xs transition-all shadow-sm rounded-xl cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={initializing ? 'animate-spin' : ''} />
            <span>{initializing ? '正在初始化...' : '一键注册平台AI'}</span>
          </button>
        )}
      </div>

      {/* AI Model Recommendations Guide */}
      <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-slate-950/20 dark:to-indigo-950/10 rounded-2xl border border-blue-100 dark:border-slate-800 p-5 space-y-3.5 shadow-sm">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => setShowModelGuide(!showModelGuide)}
            className="flex items-center gap-2 text-xs font-black text-blue-605 dark:text-blue-400 cursor-pointer hover:underline focus:outline-none"
          >
            <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-[11px] font-black">?</span>
            <span>查看平台 AI 推荐模型选型与配置指南</span>
          </button>
        </div>
        
        {showModelGuide && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1.5 text-xs text-slate-650 dark:text-slate-400 border-t border-blue-100/40 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
            <div className="space-y-1.5">
              <h5 className="font-black text-slate-850 dark:text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                AMC Copywriter (文案策划)
              </h5>
              <p className="leading-relaxed">
                <span className="font-bold text-slate-700 dark:text-slate-350">推荐模型：</span>
                <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-[10px] text-indigo-600 dark:text-indigo-400 border border-slate-100 dark:border-slate-800">Claude 3.5 Sonnet</code> 或 
                <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-[10px] text-indigo-600 dark:text-indigo-400 border border-slate-100 dark:border-slate-800 ml-1">DeepSeek-V3</code>
              </p>
              <p className="text-[11px] text-slate-450 dark:text-slate-500 leading-relaxed">
                理由：文案工作需要极高的语义敏感度、恰当的排版布局，以及理解本地化方言和文化梗（如新加坡/小红书用语风格）。
              </p>
            </div>

            <div className="space-y-1.5">
              <h5 className="font-black text-slate-850 dark:text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                AMC Designer (视觉设计)
              </h5>
              <p className="leading-relaxed">
                <span className="font-bold text-slate-700 dark:text-slate-350">推荐模型：</span>
                <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-[10px] text-pink-600 dark:text-pink-400 border border-slate-100 dark:border-slate-800">Gemini 2.0 Flash</code> 或 
                <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-[10px] text-pink-600 dark:text-pink-400 border border-slate-100 dark:border-slate-800 ml-1">GPT-4o</code>
              </p>
              <p className="text-[11px] text-slate-450 dark:text-slate-500 leading-relaxed">
                理由：设计引擎依赖强大的多模态视觉感官。Gemini 在图像物体检测（如识别餐盘、杯子位置）和构图分析上拥有顶级表现。
              </p>
            </div>

            <div className="space-y-1.5">
              <h5 className="font-black text-slate-850 dark:text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                AMC Researcher (商圈检索)
              </h5>
              <p className="leading-relaxed">
                <span className="font-bold text-slate-700 dark:text-slate-350">推荐模型：</span>
                <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-[10px] text-amber-600 dark:text-amber-400 border border-slate-100 dark:border-slate-800">Gemini 2.0 Flash</code> 或 
                <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-[10px] text-amber-600 dark:text-amber-400 border border-slate-100 dark:border-slate-800 ml-1">GPT-4o-mini</code>
              </p>
              <p className="text-[11px] text-slate-450 dark:text-slate-500 leading-relaxed">
                理由：检索任务偏重于高效提取外部搜索工具返回的信息，要求高响应吞吐速度与优秀的摘要整合能力。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Grid of Platform AI Agents */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-black text-slate-850 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
          <span>🤖 平台级原子级 AI 员工 (Platform General AI Agents)</span>
          <span className="text-[10px] font-bold text-slate-400 normal-case font-mono">Layer 1 Atomic Services</span>
        </h3>

        {!allInitialized ? (
          <div className="p-8 border border-dashed rounded-xl text-center space-y-3">
            <AlertCircle className="mx-auto text-amber-500" size={24} />
            <p className="text-xs text-slate-450">检测到平台级别 AI 账户尚未在数据库中注册。请点击上方按钮一键注册，以便进行 Prompt Engineering 设定。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-1">
            {PLATFORM_AGENTS_SPEC.map(spec => {
              const agent = getPlatformAgent(spec.email)
              if (!agent) return null
              const isSaving = !!actionLoading[agent.id + '_edit']

              return (
                <div 
                  key={agent.id}
                  className="rounded-2xl border border-slate-150 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 hover:border-indigo-400 dark:hover:border-slate-700 transition-all bg-slate-50/50 dark:bg-slate-955/10"
                >
                  <div className="space-y-3.5">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner flex-shrink-0"
                        style={{ backgroundColor: agent.themeColor || spec.themeColor }}
                      >
                        <Bot size={20} className="text-white" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-850 dark:text-white leading-tight">{agent.nickname || spec.nickname}</h4>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5 leading-none">{agent.email}</p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      {agent.introduction || spec.introduction}
                    </p>

                    <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 p-3.5 space-y-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Prompt 指令摘要</p>
                      <p className="text-xs text-slate-405 leading-relaxed font-mono truncate-4-lines">
                        {agent.workflow || spec.workflow}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenEdit(agent)}
                    className="w-full inline-flex items-center justify-center gap-1 px-4 py-2 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-extrabold text-slate-700 dark:text-slate-350 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <Edit3 size={12} className="text-indigo-500" />
                    <span>配置人设与 Prompt 指令</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Dataset Training and Fine-Tuning */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
        <div>
          <h3 className="text-sm font-black text-slate-855 dark:text-slate-100 flex items-center gap-2">
            <Database size={16} className="text-blue-500" /> AI 运营对话语料导出与学习 (Few-Shot Fine-tuning)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            选择品牌并提取该品牌下 AI 语音伴侣与商家的所有历史交流录音及转译文本，打包为标准 JSONL 数据集，用于大语言模型进行微调 (Fine-tuning) 训练。
          </p>
        </div>
        <TrainingDataSection brands={brands} />
      </div>

      {/* Prompt Editor Dialog */}
      {editingAgent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-5 scrollbar-thin">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 size={16} className="text-indigo-500" />
                <span>配置【{editingAgent.nickname}】人设与 Prompt 指令</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                优化和微调平台底层 AI 的 System Prompt 人设指令，改进生成内容的语气基调与思维步骤。
              </p>
            </div>

            <div className="space-y-4">
              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">AI 显示昵称</span>
                <input 
                  value={agentDraft.nickname} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, nickname: e.target.value }))} 
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505" 
                />
              </label>

              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">人设设定与说明</span>
                <textarea 
                  value={agentDraft.introduction} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, introduction: e.target.value }))} 
                  rows={4}
                  placeholder="角色人设及基本定位描述..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505 resize-y" 
                />
              </label>

              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">系统提示词工作流系统指令 (System Prompt Workflow)</span>
                <textarea 
                  value={agentDraft.workflow} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, workflow: e.target.value }))} 
                  rows={8}
                  placeholder="工作流步骤指示与核心提示词指令..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505 resize-y font-mono text-xs leading-relaxed" 
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingAgent(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-350 hover:bg-slate-105 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSaveLocal}
                disabled={!!actionLoading[editingAgent.id + '_edit']}
                className="px-5 py-2 rounded-xl text-xs font-black bg-blue-650 hover:bg-blue-700 text-white disabled:opacity-50 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {actionLoading[editingAgent.id + '_edit'] ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
