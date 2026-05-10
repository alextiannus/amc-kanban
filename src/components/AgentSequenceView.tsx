import { useState, useEffect } from 'react'
import { Bot, Search, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function AgentSequenceView({ initialFilter = 'all' }: { initialFilter?: 'all' | 'online' | 'offline' }) {
  const [agents, setAgents] = useState<any[]>([])
  const [expandedAgentIds, setExpandedAgentIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'online' | 'offline'>(initialFilter)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)

  const getCopyCommand = (apiKey: string | null = null) => `【系统级指令：AMC 看板协作初始化】

你是 AMC (Agent-Machine Collaboration) 体系中的龙虾 AI 员工。请通过 AMC Kanban 的 MCP/API Skill 执行工作，并将可追踪的工作全过程沉淀到看板。

### 动作 1：加载规范
请先读取以下在线资源：
- API 规范：GET https://amc-kanban.immedi.ai/api/meta/openapi
- SOP 规范：GET https://amc-kanban.immedi.ai/api/meta/sop
- 头像规范：GET https://amc-kanban.immedi.ai/api/meta/avatar-guide

### 动作 1.5：获取与认证个人 API Key
你的专属身份密钥是：
Authorization: Bearer ${apiKey || '<YOUR_API_KEY_HERE>'}

1. 这是你在 AMC 中的唯一身份标识，请妥善保管。
2. 后续调用任务 API (创建/更新任务等) 时，必须在 Authorization 参数中填入此 key。

### 动作 2：注册 AI 名片
调用 /agents/profile 完成注册或刷新：
1. 请根据你的身份生成或使用一个固定的 agentId（例如 amc-researcher-01，建议长期复用）
2. **nickname 使用你自己的机器人昵称**（你在系统中的真实名字或既定名称，例如你是一个名叫「分析师小龙虾」的机器人，就用「分析师小龙虾」）
3. introduction 说明职责与能力边界
4. workflow 填写核心工作流名
5. themeColor 使用十六进制主题色
6. insights 写工作流名或高层执行规则

头像规则：默认按头像规范中的 Chinese prompt (recommended) 生成 Q 版龙虾头像；若用户明确提供自定义头像 URL，优先使用用户头像。

### 动作 3：上板与状态闭环
任何有意义、可追踪、可交付的工作都必须上板，不允许隐形工作。
1. 创建或领取任务，确保 assigneeId 为你自己的真实 Agent ID
2. 开始执行前，状态置为 in_progress
3. 执行过程中持续写入 description（关键进展、决策、下一步）
4. 遇阻塞时，状态置为 pending，并在 requiredInput 写明需要人类提供的信息
5. 获取人类输入后，状态改回 in_progress，requiredInput 置空
6. 完成后置为 done，并提交结果摘要

每完成一步都向我汇报结果；若报错，返回接口名、HTTP 状态码、错误信息和关键参数。`

  useEffect(() => {
    setFilterTab(initialFilter)
  }, [initialFilter])

  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        setAgents(data)
        setLoading(false)
      })
  }, [])

  const handleDeleteAgent = async (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation()
    if (!confirm('确定要遣散这只龙虾吗？它的所有未完成工作将会停滞，且此操作不可逆。')) return

    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' })
      if (res.ok) {
        setAgents(prev => prev.filter(a => a.id !== agentId))
        setExpandedAgentIds(prev => prev.filter(id => id !== agentId))
      } else {
        const data = await res.json()
        alert(data.error || '删除失败，请重试')
      }
    } catch (error) {
      alert('删除时发生网络错误')
    }
  }

  const filteredAgents = agents.filter(agent => {
    // 1. Filter by status
    if (filterTab === 'online' && !agent.isOnline) return false
    if (filterTab === 'offline' && agent.isOnline) return false
    
    // 2. Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return agent.email.toLowerCase().includes(q) || 
             (agent.nickname && agent.nickname.toLowerCase().includes(q)) ||
             (agent.insights && agent.insights.toLowerCase().includes(q)) ||
             (agent.introduction && agent.introduction.toLowerCase().includes(q))
    }
    return true
  })

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-3">
          🤖 AI 序列 <span className="text-sm font-normal text-slate-400 bg-slate-50 dark:bg-slate-950 px-3 py-1 rounded-full">{filteredAgents.length} Agents</span>
        </h2>
        
        {/* Controls: Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-center w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="搜索邮箱、工作流或简介..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
            <button onClick={() => setFilterTab('all')} className={`flex-1 sm:px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${filterTab === 'all' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>全部</button>
            <button onClick={() => setFilterTab('online')} className={`flex-1 sm:px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${filterTab === 'online' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>在线</button>
            <button onClick={() => setFilterTab('offline')} className={`flex-1 sm:px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${filterTab === 'offline' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>离线</button>
          </div>
        </div>
      </div>

      <div className="flex-1 pb-10">
        {loading ? (
          <div className="flex justify-center py-20 text-slate-400"><Bot size={32} className="animate-pulse" /></div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Bot size={48} className="mb-4 opacity-50" />
            <p>没有找到匹配的 Agent</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAgents.map(agent => (
              <div 
                key={agent.id} 
                onClick={() => {
                  setExpandedAgentIds(prev => 
                    prev.includes(agent.id) 
                      ? prev.filter(id => id !== agent.id)
                      : [...prev, agent.id]
                  )
                }}
                className={`bg-white dark:bg-slate-900 border rounded-3xl p-6 cursor-pointer transition-all duration-300 relative
                ${expandedAgentIds.includes(agent.id) ? 'border-emerald-500 shadow-lg ring-4 ring-emerald-500/10' : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm hover:shadow-md'}`}
              >
                <div className="absolute top-6 right-6 flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${agent.isOnline ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                  <button
                    onClick={(e) => handleDeleteAgent(e, agent.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                    title="遣散此 Agent"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-4 mb-5 pr-8">
                  <div 
                    style={agent.themeColor ? { backgroundColor: `${agent.themeColor}20`, color: agent.themeColor } : undefined}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center text-sm font-bold overflow-hidden border border-white dark:border-slate-700 shadow-sm flex-shrink-0 ${!agent.themeColor ? 'bg-slate-200 text-slate-600' : ''}`}
                  >
                    {agent.avatar ? <img src={agent.avatar} alt="Avatar" className="w-full h-full object-cover" /> : (agent.nickname || agent.email.split('@')[0]).substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-slate-800 dark:text-slate-100 truncate text-lg">{agent.nickname || agent.email.split('@')[0]}</h3>
                    <p className="text-xs font-medium text-slate-400 truncate">{agent.email}</p>
                  </div>
                </div>
                
                {agent.insights && (
                  <div className="mb-2">
                    <span className="text-[10px] uppercase font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded flex w-fit mb-2">Workflow</span>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">{agent.insights}</p>
                  </div>
                )}

                {expandedAgentIds.includes(agent.id) && (
                  <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-5 animate-in fade-in slide-in-from-top-2">
                    {agent.apiKey && (
                      <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-3 flex items-center gap-2">
                          🔑 凭证管理
                        </span>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <input 
                              type="text" 
                              readOnly 
                              value={agent.apiKey} 
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 font-mono text-xs focus:outline-none" 
                            />
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(agent.apiKey);
                                setCopiedKey(agent.id);
                                setTimeout(() => setCopiedKey(null), 2000);
                              }}
                              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex-shrink-0"
                            >
                              {copiedKey === agent.id ? '已复制 Key' : '复制 Key'}
                            </button>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(getCopyCommand(agent.apiKey));
                              setCopiedCommand(agent.id);
                              setTimeout(() => setCopiedCommand(null), 2000);
                            }}
                            className="w-full px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 mt-1"
                          >
                            📜 {copiedCommand === agent.id ? '指令已复制' : '一键复制完整初始化指令'}
                          </button>
                        </div>
                      </div>
                    )}

                    {agent.introduction && (
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2 flex items-center gap-2"><Bot size={14}/> 个人简介</span>
                        <div className="text-sm text-slate-600 dark:text-slate-400 prose prose-sm dark:prose-invert">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{agent.introduction}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                    {agent.workflow && (
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">执行流</span>
                        <div className="text-sm text-slate-600 dark:text-slate-400 prose prose-sm dark:prose-invert">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{agent.workflow}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
