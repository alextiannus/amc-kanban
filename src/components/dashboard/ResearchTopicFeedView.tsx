'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileSearch, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react'

type TopicFeedItem = {
  id: string
  title: string
  markdown: string
  summary: string | null
  tags: string[]
  sourceUrl: string | null
  status: string
  createdByType: string
  updatedAt: string
}

function formatTags(tags: string[]) {
  return tags.map((tag) => tag.startsWith('#') ? tag.slice(1) : tag).join(', ')
}

function parseTags(value: string) {
  return value.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)
}

function defaultMarkdown(brandName?: string) {
  return `# Topic Title\n\n## Context\n- Brand: ${brandName || 'Current brand'}\n- Source:\n\n## Findings\n- \n\n## Content Angles\n- \n\n## Risks / Notes\n- `
}

export default function ResearchTopicFeedView({ brandId, brandName }: { brandId?: string; brandName?: string }) {
  const [topics, setTopics] = useState<TopicFeedItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [markdown, setMarkdown] = useState('')

  const selectedTopic = useMemo(() => topics.find((topic) => topic.id === selectedId) || null, [topics, selectedId])

  const loadTopics = async () => {
    if (!brandId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/brands/${brandId}/topics${params.toString() ? `?${params}` : ''}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Research topics 加载失败')
      setTopics(json.topics || [])
      if (!selectedId && json.topics?.[0]) setSelectedId(json.topics[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Research topics 加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTopics()
  }, [brandId])

  useEffect(() => {
    if (!selectedTopic) return
    setTitle(selectedTopic.title)
    setSummary(selectedTopic.summary || '')
    setTags(formatTags(selectedTopic.tags))
    setSourceUrl(selectedTopic.sourceUrl || '')
    setMarkdown(selectedTopic.markdown)
  }, [selectedTopic?.id])

  const newTopic = () => {
    setSelectedId(null)
    setTitle('')
    setSummary('')
    setTags('')
    setSourceUrl('')
    setMarkdown(defaultMarkdown(brandName))
    setError(null)
  }

  const saveTopic = async () => {
    if (!brandId) return
    setSaving(true)
    setError(null)
    try {
      const endpoint = selectedTopic ? `/api/brands/${brandId}/topics/${selectedTopic.id}` : `/api/brands/${brandId}/topics`
      const res = await fetch(endpoint, {
        method: selectedTopic ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          summary,
          tags: parseTags(tags),
          sourceUrl,
          markdown,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '保存 TopicFeed 失败')
      await loadTopics()
      setSelectedId(json.topic?.id || selectedTopic?.id || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存 TopicFeed 失败')
    } finally {
      setSaving(false)
    }
  }

  const archiveTopic = async () => {
    if (!brandId || !selectedTopic) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/topics/${selectedTopic.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '归档 TopicFeed 失败')
      setSelectedId(null)
      await loadTopics()
    } catch (e) {
      setError(e instanceof Error ? e.message : '归档 TopicFeed 失败')
    } finally {
      setSaving(false)
    }
  }

  if (!brandId) return <div className="p-8 text-sm text-slate-400">请先选择品牌</div>

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24 space-y-5">
      <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Research</p>
          <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-slate-50">TopicFeed</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{brandName || '当前品牌'} 的选题研究、趋势记录和 Agent 可读写 markdown 文档</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void loadTopics() }}
              placeholder="搜索 topic / markdown / tag"
              className="w-64 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none"
            />
          </div>
          <button onClick={loadTopics} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            <RefreshCw className="h-4 w-4" /> 刷新
          </button>
          <button onClick={newTopic} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">
            <Plus className="h-4 w-4" /> 新建 Topic
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm space-y-2 max-h-[calc(100vh-240px)] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">加载 TopicFeed 中...</div>
          ) : topics.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">暂无 research topic</div>
          ) : topics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => setSelectedId(topic.id)}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === topic.id ? 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30' : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300">{topic.createdByType}</span>
                <span className="text-[10px] text-slate-400">{new Date(topic.updatedAt).toLocaleString('zh-CN')}</span>
              </div>
              <p className="line-clamp-2 text-sm font-bold text-slate-800 dark:text-slate-100">{topic.title}</p>
              <p className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{topic.summary || topic.markdown}</p>
              <p className="mt-2 truncate text-xs text-slate-400">{topic.tags.map((tag) => `#${tag}`).join(' ') || '无标签'}</p>
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
            <FileSearch className="h-4 w-4 text-sky-500" /> {selectedTopic ? '编辑 TopicFeed' : '新建 TopicFeed'}
          </div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Topic 标题"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-sky-400"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="标签，用逗号分隔"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-sky-400"
            />
            <input
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="来源链接"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-sky-400"
            />
          </div>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="简短摘要"
            className="min-h-20 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-sky-400"
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <textarea
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              placeholder="# Markdown research document"
              className="min-h-[420px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 font-mono text-sm leading-7 text-slate-800 dark:text-slate-100 outline-none focus:border-sky-400"
            />
            <pre className="min-h-[420px] whitespace-pre-wrap rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 font-mono text-sm leading-7 text-slate-700 dark:text-slate-200 overflow-auto">{markdown || 'Markdown preview'}</pre>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {selectedTopic && (
              <button disabled={saving} onClick={archiveTopic} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> 归档
              </button>
            )}
            <button disabled={saving || !title.trim() || !markdown.trim()} onClick={saveTopic} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">
              <Save className="h-4 w-4" /> 保存 TopicFeed
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
