#!/usr/bin/env python3
"""Patch DashboardAssets.tsx:
1. Add onNavigateToCalendar prop
2. Update markForSchedule to navigate to calendar with selected assets  
3. Remove right sidebar aside (lines 1582-2064)
4. Enhance floating bottom bar with Add Tag + Move Folder
5. Remove Designer AI 智能修改助手 section (but since we remove whole aside, it's gone too)
"""

FILE = '/Users/alextian/Documents/Claude/Projects/AI Staff/amc-kanban/src/components/dashboard/DashboardAssets.tsx'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

original_len = len(content)

# ── 1. Add onNavigateToCalendar to props interface ──
content = content.replace(
    """interface DashboardAssetsProps {
  brandId?: string
}

export default function DashboardAssets({ brandId }: DashboardAssetsProps) {""",
    """interface DashboardAssetsProps {
  brandId?: string
  onNavigateToCalendar?: (assetIds: string[]) => void
}

export default function DashboardAssets({ brandId, onNavigateToCalendar }: DashboardAssetsProps) {"""
)

# ── 2. Add state for inline tag/folder floating actions ──
content = content.replace(
    """  // Batch Tags Input
  const [batchTagsText, setBatchTagsText] = useState('')""",
    """  // Batch Tags Input
  const [batchTagsText, setBatchTagsText] = useState('')

  // Floating bottom bar inline tag/folder state
  const [floatingTagInput, setFloatingTagInput] = useState('')
  const [floatingFolderSelect, setFloatingFolderSelect] = useState('')
  const [showFloatingTag, setShowFloatingTag] = useState(false)
  const [showFloatingFolder, setShowFloatingFolder] = useState(false)"""
)

# ── 3. Update markForSchedule to navigate to calendar directly ──
content = content.replace(
    """  const markForSchedule = (assetIds: string | string[]) => {
    const ids = Array.isArray(assetIds) ? assetIds : [assetIds]
    if (ids.length === 0) return
    setScheduleTargetIds(ids)
    setScheduleCaption('')
    setScheduleHashtags('')
    setScheduleScheduledAt('')
    setScheduleAgentNote('')
    setScheduleModalOpen(true)
    void loadBrandAccounts()
  }""",
    """  const markForSchedule = (assetIds: string | string[]) => {
    const ids = Array.isArray(assetIds) ? assetIds : [assetIds]
    if (ids.length === 0) return
    if (onNavigateToCalendar) {
      // Navigate to calendar with selected assets to open new content creation
      onNavigateToCalendar(ids)
      setSelected([])
      setIsBatchSelectMode(false)
      return
    }
    // Fallback: open schedule modal if no navigation callback provided
    setScheduleTargetIds(ids)
    setScheduleCaption('')
    setScheduleHashtags('')
    setScheduleScheduledAt('')
    setScheduleAgentNote('')
    setScheduleModalOpen(true)
    void loadBrandAccounts()
  }"""
)

# ── 4. Add batch folder update function ──
content = content.replace(
    """  const updateAssetTags = async (assetId: string, updatedTags: string[]) => {""",
    """  const handleFloatingTagAdd = async () => {
    if (!floatingTagInput.trim() || selected.length === 0 || !brandId) return
    const newTags = floatingTagInput.trim().split(/[#,，\\s]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean)
    for (const id of selected) {
      const asset = assets.find(a => a.id === id)
      if (!asset) continue
      const combined = Array.from(new Set([...asset.aiTags, ...newTags]))
      await fetch(`/api/brands/${brandId}/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiTags: combined }),
      })
    }
    setAssets(prev => prev.map(a => selected.includes(a.id)
      ? { ...a, aiTags: Array.from(new Set([...a.aiTags, ...newTags])) }
      : a
    ))
    setFloatingTagInput('')
    setShowFloatingTag(false)
  }

  const handleFloatingFolderMove = async () => {
    if (!floatingFolderSelect || selected.length === 0 || !brandId) return
    for (const id of selected) {
      await fetch(`/api/brands/${brandId}/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: floatingFolderSelect, aiCategory: floatingFolderSelect }),
      })
    }
    setAssets(prev => prev.map(a => selected.includes(a.id) ? { ...a, aiCategory: floatingFolderSelect } : a))
    setFloatingFolderSelect('')
    setShowFloatingFolder(false)
    await loadAssets()
  }

  const updateAssetTags = async (assetId: string, updatedTags: string[]) => {"""
)

# ── 5. Remove the right sidebar aside (1582–2064) ──
# Find the start marker and end marker
right_sidebar_start = '      {/* 3. RIGHT SIDEBAR: AI Detail & Batch Drawer */}\n      <aside className="w-80 border-l border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 h-full overflow-hidden hidden xl:flex">'
right_sidebar_end = '      </aside>\n\n      {/* Lightbox original media preview modal */'

if right_sidebar_start in content and right_sidebar_end in content:
    start_idx = content.index(right_sidebar_start)
    end_idx = content.index(right_sidebar_end, start_idx)
    end_idx += len('      </aside>\n\n')
    content = content[:start_idx] + '\n      {/* Lightbox original media preview modal */' + content[end_idx:]
    print("✓ Removed right sidebar aside")
else:
    print("✗ Could not find right sidebar aside markers")
    # Try partial match
    if '3. RIGHT SIDEBAR' in content:
        print("  Found '3. RIGHT SIDEBAR' - checking markers...")

# ── 6. Update the floating bottom bar to add tag + folder actions ──
old_floating_bar = '''      {/* Floating Bottom Bar for selection operations */}
      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[40] flex items-center gap-3 px-5 py-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-2xl transition-all duration-355 transform scale-100 whitespace-nowrap select-none">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
            已选择 <span className="text-indigo-600 dark:text-indigo-400 text-sm font-black">{selected.length}</span> 项
          </span>
          
          <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 shrink-0" />
          
          <button
            onClick={() => markForSchedule(selected)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 active:scale-95 transition-all"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>准备草稿排期(idea)</span>
          </button>
          
          <button
            onClick={handleBatchDeleteAssets}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-95 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>批量删除</span>
          </button>
          
          <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 shrink-0" />
          
          <button
            onClick={() => {
              setSelected([])
              setIsBatchSelectMode(false)
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-850 dark:hover:bg-slate-700 text-white active:scale-95 transition-all shadow-sm flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>取消选择</span>
          </button>
        </div>
      )}'''

new_floating_bar = '''      {/* Floating Bottom Bar for selection operations */}
      {selected.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[40] flex flex-col items-center gap-2 select-none" style={{maxWidth: 'calc(100vw - 32px)'}}>
          
          {/* Expanded tag input row */}
          {showFloatingTag && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 shadow-xl backdrop-blur-md">
              <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <input
                autoFocus
                type="text"
                value={floatingTagInput}
                onChange={e => setFloatingTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleFloatingTagAdd(); if (e.key === 'Escape') setShowFloatingTag(false) }}
                placeholder="输入标签，回车确认（支持逗号分隔多个）"
                className="text-xs outline-none bg-transparent text-slate-700 dark:text-slate-200 w-56 placeholder:text-slate-400"
              />
              <button onClick={() => void handleFloatingTagAdd()} className="px-2.5 py-1 bg-indigo-500 text-white text-[11px] font-bold rounded-lg active:scale-95 cursor-pointer">确认</button>
              <button onClick={() => setShowFloatingTag(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Expanded folder select row */}
          {showFloatingFolder && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 shadow-xl backdrop-blur-md">
              <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <select
                value={floatingFolderSelect}
                onChange={e => setFloatingFolderSelect(e.target.value)}
                className="text-xs outline-none bg-transparent text-slate-700 dark:text-slate-200 w-36"
                autoFocus
              >
                <option value="">-- 选择文件夹 --</option>
                {folders.map(f => <option key={f} value={f}>{f === '素材库' ? '根目录 (素材库)' : f}</option>)}
              </select>
              <button onClick={() => void handleFloatingFolderMove()} disabled={!floatingFolderSelect} className="px-2.5 py-1 bg-amber-500 disabled:bg-slate-200 text-white text-[11px] font-bold rounded-lg active:scale-95 cursor-pointer disabled:cursor-not-allowed">移动</button>
              <button onClick={() => setShowFloatingFolder(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Main action bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-2xl whitespace-nowrap">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
              已选 <span className="text-indigo-600 dark:text-indigo-400 font-black">{selected.length}</span>
            </span>
            
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 shrink-0" />

            {/* 跳转发布日历 */}
            <button
              onClick={() => markForSchedule(selected)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 active:scale-95 transition-all"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">发布日历</span>
            </button>

            {/* 添加标签 */}
            <button
              onClick={() => { setShowFloatingTag(v => !v); setShowFloatingFolder(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all active:scale-95 ${showFloatingTag ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">添加标签</span>
            </button>

            {/* 转移文件夹 */}
            <button
              onClick={() => { setShowFloatingFolder(v => !v); setShowFloatingTag(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all active:scale-95 ${showFloatingFolder ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">转移文件夹</span>
            </button>

            <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 shrink-0" />

            {/* 批量删除 */}
            <button
              onClick={handleBatchDeleteAssets}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-95 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">删除</span>
            </button>

            <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 shrink-0" />

            {/* 取消 */}
            <button
              onClick={() => { setSelected([]); setIsBatchSelectMode(false); setShowFloatingTag(false); setShowFloatingFolder(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-700 text-white active:scale-95 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span>取消</span>
            </button>
          </div>
        </div>
      )}'''

if old_floating_bar in content:
    content = content.replace(old_floating_bar, new_floating_bar)
    print("✓ Updated floating bottom bar")
else:
    print("✗ Could not find floating bottom bar - trying partial match...")
    if 'Floating Bottom Bar for selection operations' in content:
        print("  Found comment marker, need exact string match")

# ── 7. Add Tag and FolderOpen to imports ──
content = content.replace(
    "import { Tag,",
    "import { Tag,"
)  # no-op guard, check existing imports

# Check what icons are already imported
import re
lucide_match = re.search(r'from \'lucide-react\'', content)
if lucide_match:
    # Find the import block
    import_start = content.rfind("import {", 0, lucide_match.start())
    import_end = lucide_match.end()
    import_block = content[import_start:import_end]
    
    needs_tag = 'Tag,' not in import_block and ' Tag ' not in import_block
    needs_folder_open = 'FolderOpen' not in import_block
    
    if needs_tag or needs_folder_open:
        # Add to last line of import
        additions = []
        if needs_tag:
            additions.append('Tag')
        if needs_folder_open:
            additions.append('FolderOpen')
        
        # Find the last icon in import and add after
        old_end = "} from 'lucide-react'"
        new_icons = ', '.join(additions)
        # Find last icon before closing
        last_comma_pos = import_block.rfind(',')
        if last_comma_pos > 0:
            # There are already items - add to the list
            content = content.replace(
                old_end,
                f", {new_icons}\n}} from 'lucide-react'"
            )
            print(f"✓ Added icons: {new_icons}")

new_len = len(content)
print(f"\nOriginal: {original_len} chars → New: {new_len} chars (delta: {new_len - original_len:+d})")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)
print("✓ File written")
