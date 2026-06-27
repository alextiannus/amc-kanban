#!/usr/bin/env python3
"""
Patch DashboardAssets.tsx for mobile-first refactor:
1. Default viewFilter: 'all' → 'unused'
2. Remove left sidebar <aside>
3. Remove AI bulk tagging button from header + related state/function
4. Add horizontal scrollable pill navigation (views + folders) at the top of <main>
"""

FILE = '/Users/alextian/Documents/Claude/Projects/AI Staff/amc-kanban/src/components/dashboard/DashboardAssets.tsx'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

orig_len = len(content)

# ── 1. Default viewFilter: 'all' → 'unused' ──────────────────────────────────
content = content.replace(
    "const [viewFilter, setViewFilter] = useState<'all' | 'recent' | 'unused' | 'high_perf' | 'ai_pending' | 'images' | 'videos' | 'scheduled'>('all')",
    "const [viewFilter, setViewFilter] = useState<'all' | 'recent' | 'unused' | 'high_perf' | 'ai_pending' | 'images' | 'videos' | 'scheduled'>('unused')"
)
print("✓ Default viewFilter → 'unused'")

# ── 2. Remove bulkTaggingActive / bulkTagProgress state ──────────────────────
content = content.replace(
    """  // Bulk Tagging simulator state
  const [bulkTaggingActive, setBulkTaggingActive] = useState(false)
  const [bulkTagProgress, setBulkTagProgress] = useState(0)

  // Batch Tags Input""",
    """  // Batch Tags Input"""
)
print("✓ Removed bulk tagging state")

# ── 3. Remove startBulkTagging function ──────────────────────────────────────
bulk_tag_fn_start = "  // Batch mark pending assets as ready by syncing to backend.\n  const startBulkTagging = async () => {"
bulk_tag_fn_end = "  const uploadFiles = async (files: FileList | File[]) => {"

if bulk_tag_fn_start in content and bulk_tag_fn_end in content:
    start_idx = content.index(bulk_tag_fn_start)
    end_idx = content.index(bulk_tag_fn_end, start_idx)
    content = content[:start_idx] + "\n\n" + content[end_idx:]
    print("✓ Removed startBulkTagging function")
else:
    print("✗ Could not find startBulkTagging boundaries")

# ── 4. Remove left sidebar aside ──────────────────────────────────────────────
left_aside_start = "      {/* 1. LEFT SIDEBAR: Views & Tag Browser */}\n      <aside"
left_aside_end = "      {/* 2. CENTER COLUMN: Media Grid */}"

if left_aside_start in content and left_aside_end in content:
    start_idx = content.index(left_aside_start)
    end_idx = content.index(left_aside_end, start_idx)
    content = content[:start_idx] + content[end_idx:]
    print("✓ Removed left sidebar aside")
else:
    print("✗ Could not find left sidebar boundaries")
    if "LEFT SIDEBAR" in content:
        print("  Found LEFT SIDEBAR comment but markers don't match")

# ── 5. Remove AI bulk tagging button from header ─────────────────────────────
bulk_btn = """            <button
              onClick={startBulkTagging}
              disabled={bulkTaggingActive || assets.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-600 dark:text-indigo-400 disabled:opacity-50"
            >
              {bulkTaggingActive ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>处理中 {bulkTagProgress}%</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>AI 批量打标</span>
                </>
              )}
            </button>
            """

if bulk_btn in content:
    content = content.replace(bulk_btn, "            ")
    print("✓ Removed AI bulk tagging button")
else:
    print("✗ Could not find AI bulk tagging button (trying partial)")
    if "startBulkTagging" in content:
        print("  startBulkTagging still referenced - need manual check")

# ── 6. Replace header with compact mobile-friendly header + pill nav ─────────
old_header = """      {/* 2. CENTER COLUMN: Media Grid */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header bar */}
        <div className="p-6 border-b border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-sm z-10">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white flex items-center gap-2">
              <span>营销素材知识库</span>
              <span className="text-xs px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full font-bold border border-indigo-100/50 dark:border-indigo-900/30">
                📁 {selectedFolder === 'all' ? '全部文件夹' : selectedFolder}
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              AI 自动理解素材内容，一键生成多平台营销帖子与动态视频
            </p>
          </div>
          
          <div className="flex items-center gap-2.5">
            
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files) }}
            />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-95 transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>{uploading ? (uploadProgress || '上传中...') : '上传素材'}</span>
            </button>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="px-6 py-4 bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <div className="flex-1 flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-xl px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索标签、AI 描述..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400"
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
          
          <select
            value={selectedFolder}
            onChange={(e) => {
              const val = e.target.value
              setSelectedFolder(val)
              setTargetFolder(val === 'all' ? '素材库' : val)
            }}
            className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 outline-none hover:bg-slate-50 transition-all cursor-pointer"
          >
            <option value="all">全部文件夹 (所有素材)</option>
            {folders.map(f => ("""

new_header = """      {/* MAIN COLUMN: full width mobile-first */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* ── Top Header: title + search + upload ── */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 shadow-sm z-10">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 min-w-0">
              <span className="truncate">营销素材库</span>
              <span className="shrink-0 text-[10px] px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full font-bold border border-indigo-100/50 dark:border-indigo-900/30">
                {filtered.length} 项
              </span>
            </h1>

            <div className="flex items-center gap-2 shrink-0">
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files) }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 shadow-sm active:scale-95 transition-all disabled:opacity-60"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">{uploading ? (uploadProgress || '上传中...') : '上传'}</span>
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索标签、描述..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400"
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
        </div>

        {/* ── View Filter Pills ── */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex gap-1.5 px-3 py-2.5 overflow-x-auto scrollbar-hide">
            {[
              { key: 'unused',   label: '未使用',  icon: <Archive className="w-3.5 h-3.5" />, count: countUnused },
              { key: 'all',      label: '全部',    icon: <Grid className="w-3.5 h-3.5" />,    count: countAll },
              { key: 'recent',   label: '最近',    icon: <Clock className="w-3.5 h-3.5" />,   count: countRecent },
              { key: 'high_perf',label: '高表现',  icon: <TrendingUp className="w-3.5 h-3.5" />, count: countHighPerf },
              { key: 'scheduled',label: '草稿排期', icon: <Calendar className="w-3.5 h-3.5" />, count: countScheduled },
              { key: 'images',   label: '图片',    icon: <ImageIcon className="w-3.5 h-3.5" />, count: countImages },
              { key: 'videos',   label: '视频',    icon: <Video className="w-3.5 h-3.5" />,   count: countVideos },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setViewFilter(v.key as typeof viewFilter)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                  viewFilter === v.key
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {v.icon}
                <span>{v.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${viewFilter === v.key ? 'bg-white/20 text-white' : 'bg-white dark:bg-slate-700 text-slate-500'}`}>{v.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Folder Pills ── */}
        <div className="bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hide items-center">
            {/* All folders */}
            <button
              onClick={() => { setSelectedFolder('all'); setTargetFolder('素材库'); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDragEnter={() => setDragOverFolder('all')}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={(e) => handleDropOnFolder('素材库', e)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 border-2 ${
                dragOverFolder === 'all'
                  ? 'border-indigo-400 bg-indigo-100 text-indigo-700'
                  : selectedFolder === 'all'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
              }`}
            >
              <span>📁</span>
              <span>全部</span>
            </button>

            {folders.map(f => {
              const isSelected = selectedFolder === f
              const isDragOver = dragOverFolder === f
              const count = assets.filter(a => f === '素材库' ? (!a.aiCategory || a.aiCategory === '素材库' || a.aiCategory === 'raw') : a.aiCategory === f).length
              const isDeletable = !['素材库', '产品', '环境', '活动', '已使用'].includes(f)
              return (
                <div key={f} className="relative group shrink-0">
                  <button
                    onClick={() => { setSelectedFolder(f); setTargetFolder(f); }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDragEnter={() => setDragOverFolder(f)}
                    onDragLeave={() => setDragOverFolder(null)}
                    onDrop={(e) => handleDropOnFolder(f, e)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border-2 pr-${isDeletable ? '5' : '3'} ${
                      isDragOver
                        ? 'border-indigo-400 bg-indigo-100 text-indigo-700'
                        : isSelected
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    <span>📁</span>
                    <span>{f}</span>
                    <span className="text-[9px] text-slate-400 ml-0.5">{count}</span>
                  </button>
                  {isDeletable && (
                    <button
                      onClick={(e) => handleDeleteFolder(f, e)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded-full items-center justify-center text-slate-500 hover:bg-rose-500 hover:text-white transition-all hidden group-hover:flex"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              )
            })}

            {/* Add folder button */}
            <button
              onClick={handleCreateFolder}
              className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-indigo-400 hover:text-indigo-600"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建</span>
            </button>
          </div>
        </div>

        {/* Filter / Search Bar - REMOVED (now in top header) */}
        {false && <div className="hidden">
          <select
            value={selectedFolder}
            onChange={(e) => {
              const val = e.target.value
              setSelectedFolder(val)
              setTargetFolder(val === 'all' ? '素材库' : val)
            }}
            className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 outline-none hover:bg-slate-50 transition-all cursor-pointer"
          >
            <option value="all">全部文件夹 (所有素材)</option>
            {folders.map(f => ("""

if old_header in content:
    content = content.replace(old_header, new_header)
    print("✓ Replaced header with mobile-first pill nav")
else:
    print("✗ Could not find old header — trying to find sections separately")
    if "2. CENTER COLUMN: Media Grid" in content:
        print("  Found CENTER COLUMN comment")
    if "Filter / Search Bar" in content:
        print("  Found Filter/Search Bar comment")

new_len = len(content)
print(f"\nOriginal: {orig_len} chars → New: {new_len} chars (delta: {new_len - orig_len:+d})")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)
print("✓ File written")
