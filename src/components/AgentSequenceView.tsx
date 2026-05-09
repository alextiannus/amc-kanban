import { useState, useEffect } from 'react'
import { Bot, Search } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function AgentSequenceView({ initialFilter = 'all' }: { initialFilter?: 'all' | 'online' | 'offline' }) {
  const [agents, setAgents] = useState<any[]>([])
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'online' | 'offline'>(initialFilter)

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

  const filteredAgents = agents.filter(agent => {
    // 1. Filter by status
    if (filterTab === 'online' && !agent.isOnline) return false
    if (filterTab === 'offline' && agent.isOnline) return false
    
    // 2. Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return agent.email.toLowerCase().includes(q) || 
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
                onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                className={`bg-white dark:bg-slate-900 border rounded-3xl p-6 cursor-pointer transition-all duration-300 relative
                ${selectedAgent?.id === agent.id ? 'border-emerald-500 shadow-lg ring-4 ring-emerald-500/10' : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm hover:shadow-md'}`}
              >
                <div className="absolute top-6 right-6 flex items-center gap-1">
                  <span className={`w-3 h-3 rounded-full ${agent.isOnline ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                </div>

                <div className="flex items-center gap-4 mb-5 pr-8">
                  <div 
                    style={agent.themeColor ? { backgroundColor: `${agent.themeColor}20`, color: agent.themeColor } : undefined}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center text-sm font-bold overflow-hidden border border-white dark:border-slate-700 shadow-sm flex-shrink-0 ${!agent.themeColor ? 'bg-slate-200 text-slate-600' : ''}`}
                  >
                    {agent.avatar ? <img src={agent.avatar} alt="Avatar" className="w-full h-full object-cover" /> : agent.email.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-slate-800 dark:text-slate-100 truncate text-lg">{agent.email.split('@')[0]}</h3>
                    <p className="text-xs font-medium text-slate-400 truncate">{agent.email}</p>
                  </div>
                </div>
                
                {agent.insights && (
                  <div className="mb-2">
                    <span className="text-[10px] uppercase font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded flex w-fit mb-2">Workflow</span>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">{agent.insights}</p>
                  </div>
                )}

                {selectedAgent?.id === agent.id && (
                  <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-5 animate-in fade-in slide-in-from-top-2">
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
