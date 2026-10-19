'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bot, BookOpen, Plus, RefreshCw, Save, Trash2, ArrowLeft, Search, X } from 'lucide-react'

type Skill = { id: string; name: string; content: string; version: string; installed: boolean; source: string }
type Agent = { id: string; name: string; description: string; kind: string; acceptsSkills: boolean; canManage: boolean; skills: Skill[] }
type Data = { agents: Agent[]; catalog: Skill[] }
type Draft = { agentId: string; id: string; content: string; original: string; version: string; creating: boolean }
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'

export default function AgentSkillsPage() {
  const [data, setData] = useState<Data>({ agents: [], catalog: [] })
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const dirty = !!draft && (draft.creating || draft.content !== draft.original)
  const agent = data.agents.find(a => a.id === selected)
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const response = await fetch('/api/agent-skills', { signal, cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '加载失败')
      if (signal?.aborted) return
      setData(result)
      setSelected(current => result.agents.some((a: Agent) => a.id === current) ? current : result.agents[0]?.id || '')
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : '网络错误')
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [])
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal) }); return () => controller.abort() }, [load])
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
  const mayLeave = () => !dirty || window.confirm('有尚未保存的 Skill 内容，确定放弃修改？')
  function choose(a: Agent) { if (!busy && mayLeave()) { setSelected(a.id); setDraft(null); setError(''); setNotice('') } }
  function open(skill?: Skill) {
    if (!agent || !mayLeave()) return
    setError(''); setNotice('')
    setDraft({ agentId: agent.id, id: skill?.id || '', content: skill?.content || '# 新技能\n\n描述何时使用此技能，以及具体执行步骤。\n', original: skill?.content || '', version: skill?.version || 'absent', creating: !skill?.installed })
  }
  async function save(action: 'save' | 'uninstall', skill?: Skill) {
    if (!agent?.canManage || busy) return
    const target = skill || draft
    if (!target) return
    if (action === 'uninstall' && (!mayLeave() || !window.confirm(`卸载 ${target.id}？后续读取将不再加载该 Skill，依赖它的任务可能无法执行。`))) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/agent-skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId: agent.id, skillId: target.id, content: target.content, expectedVersion: target.version, action }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '保存失败')
      setDraft(null)
      setNotice(action === 'uninstall' ? 'Skill 已卸载。' : agent.kind === 'registered' ? '配置已保存，外部运行端需通过 API 读取。' : 'Skill 已保存，后续读取使用新版本。')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : '网络错误，请核对最新版本后重试；输入已保留') }
    finally { setBusy(false) }
  }
  const shown = data.agents.filter(a => `${a.name} ${a.description}`.toLowerCase().includes(query.toLowerCase()))
  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:p-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/dashboard" onClick={e => { if (!mayLeave()) e.preventDefault() }} className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16} />返回看板</Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">Agents 与 Skills</h1><p className="mt-2 text-sm text-slate-500">查看 AI Agent 的能力，管理它们使用的技能。</p></div>
        <button className={button} disabled={busy || loading} onClick={() => { if (mayLeave()) { setDraft(null); setError(''); void load() } }}><RefreshCw size={16} />刷新</button>
      </header>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}{draft && <p className="mt-2">编辑内容已保留。可先复制草稿，再刷新并核对最新版本。</p>}</div>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
      {loading && <p role="status" className="text-sm text-slate-500">正在加载 Agent 和 Skills…</p>}
      {!loading && !data.agents.length && !error && <p className="rounded-xl border p-8 text-center">当前没有可访问的 AI Agent。</p>}
      <div className="grid items-start gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <label className="mb-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 dark:bg-slate-800"><Search size={16} /><input aria-label="搜索 Agent" placeholder="搜索 Agent" value={query} onChange={e => setQuery(e.target.value)} className="min-w-0 w-full bg-transparent py-3 text-sm outline-none" /></label>
          <p className="px-2 pb-2 text-xs text-slate-500">{shown.length} 个可见 Agent</p>
          <div className="max-h-64 space-y-1 overflow-y-auto md:max-h-[70vh]">{shown.map(a => <button key={a.id} aria-pressed={a.id === selected} disabled={busy} onClick={() => choose(a)} className={`flex w-full items-start gap-3 rounded-xl p-3 text-left ${a.id === selected ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}><Bot size={18} className="mt-1 shrink-0" /><span className="min-w-0"><span className="block break-words text-sm font-medium">{a.name}</span><span className="mt-1 block text-xs opacity-70">{a.kind === 'builtin' ? '内置' : '已注册'} · {a.skills.filter(s => s.installed).length} Skills</span></span></button>)}</div>
        </aside>
        {agent && <section className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-xl font-semibold">{agent.name}</h2><p className="mt-1 break-words text-sm text-slate-500">{agent.description}</p></div>{agent.canManage && <button className={button} disabled={busy} onClick={() => open()}><Plus size={16} />安装新 Skill</button>}</div>
            {agent.kind === 'registered' && <p className="mt-4 break-words rounded-lg bg-amber-50 p-3 [overflow-wrap:anywhere] text-xs text-amber-900">此处管理 AMC 中的技能配置。外部 Agent 需使用自身 API Key 读取 /api/agent-skills?agentId={agent.id}；AMC 无法确认外部设备是否已加载。</p>}
            {agent.id === 'builtin:copywriter' && <p className="mt-4 text-xs text-slate-500">这些 Skills 用于 AMC 本地文案节点；委托给 Content 服务的生成由该服务配置管理。</p>}
            {!agent.canManage && agent.acceptsSkills && <p className="mt-3 text-xs text-slate-500">只读 · 请联系管理员管理 Skills。</p>}
          </div>
          {draft && <section className="rounded-2xl border border-indigo-200 bg-white p-5 dark:border-indigo-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{draft.creating ? '安装 Skill' : agent.canManage ? '编辑 Skill' : '查看 Skill'}</h3><button aria-label="关闭编辑器" disabled={busy} onClick={() => { if (mayLeave()) setDraft(null) }} className={button}><X size={16} /></button></div>
            {draft.creating && <label className="mb-4 block text-sm">从内置目录选择<select aria-label="内置技能目录" className="mt-2 w-full rounded-lg border bg-transparent p-2" value="" onChange={e => { const s = data.catalog.find(s => s.id === e.target.value); if (s) { const previous = agent.skills.find(x => x.id === s.id); setDraft({ ...draft, id: s.id, content: s.content, version: previous?.version || 'absent' }) } }}><option value="">选择技能，或填写自己的 Markdown</option>{data.catalog.filter(s => agent.kind === 'registered' || (agent.id === 'builtin:copywriter' ? !s.id.startsWith('amc-') : s.id.startsWith('amc-'))).filter(s => !agent.skills.some(x => x.id === s.id && x.installed)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
            <label className="block text-sm">Skill ID<input aria-label="Skill ID" disabled={!draft.creating || busy} value={draft.id} onChange={e => { const previous = agent.skills.find(s => s.id === e.target.value); setDraft({ ...draft, id: e.target.value, version: previous?.version || 'absent' }) }} placeholder="my-skill/SKILL.md" className="mt-2 w-full rounded-lg border bg-transparent p-2 font-mono text-sm disabled:opacity-60" /></label>
            <label className="mt-4 block text-sm">Markdown 内容<textarea aria-label="Markdown 内容" readOnly={!agent.canManage || busy} value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })} rows={18} className="mt-2 w-full resize-y rounded-lg border bg-transparent p-3 font-mono text-sm leading-6" /></label>
            <p className="mt-2 text-xs text-slate-500">最多 60 KB；仅安装文本指令，不会授予新工具权限。</p>
            {agent.canManage && <div className="mt-4 flex flex-wrap gap-3"><button className={`${button} bg-indigo-600 text-white hover:bg-indigo-700`} disabled={busy || !draft.id || !draft.content.trim() || (draft.creating && agent.skills.some(s => s.id === draft.id && s.installed))} onClick={() => void save('save')}><Save size={16} />{busy ? '保存中…' : draft.creating ? '安装 Skill' : '保存修改'}</button><label className={`${button} cursor-pointer`}>导入 .md<input aria-label="导入 Markdown 文件" type="file" accept=".md,text/markdown,text/plain" className="sr-only" disabled={busy} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 60000) { setError('文件不得超过 60 KB'); return } try { const content = await file.text(); setDraft(current => current === draft ? { ...current, content } : current) } catch { setError('文件读取失败') } }} /></label></div>}
          </section>}
          <div className="space-y-3">{agent.skills.filter(s => s.installed).map(skill => <article key={skill.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="flex items-center gap-2 font-medium"><BookOpen size={16} className="shrink-0" /><span className="break-all">{skill.name}</span></h3><p className="mt-1 text-xs text-slate-500">{skill.source === 'bundled' ? '内置技能' : '已安装技能'} · {skill.version.startsWith('revision:') ? `版本 ${skill.version.split(':')[1]}` : '默认版本'}</p></div><div className="flex gap-2"><button disabled={busy} className={button} onClick={() => open(skill)}>{agent.canManage ? '查看 / 编辑' : '查看'}</button>{agent.canManage && <button className={`${button} text-red-600`} disabled={busy} onClick={() => void save('uninstall', skill)}><Trash2 size={14} />卸载</button>}</div></div></article>)}
          {!agent.skills.some(s => s.installed) && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">{agent.acceptsSkills ? '尚未安装 Skills。' : '该节点目前不加载 Markdown Skills。'}</p>}</div>
        </section>}
      </div>
    </div>
  </main>
}
