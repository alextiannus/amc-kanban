'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Eye,
  FlaskConical,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

type PlatformType = 'xiaohongshu' | 'instagram' | 'facebook' | 'google_business' | 'tiktok'
type IndustryVertical =
  | 'food_beverage'
  | 'beauty_wellness'
  | 'fitness_pilates'
  | 'home_renovation'
  | 'pet_services'
  | 'education_training'
  | 'healthcare_clinic'
  | 'retail_specialty'
  | 'events_entertainment'
  | 'professional_services'
  | 'general_local_service'

type BrandOption = {
  id: string
  name: string
  description?: string | null
  location?: string | null
  address?: string | null
  website?: string | null
  phone?: string | null
  knowledge?: {
    brandTone?: string | null
    negPrompts?: string[]
  } | null
}

type PlatformOption = {
  platform: PlatformType
  displayName: string
  defaultLanguage: 'zh' | 'en'
  maxCaptionLength: number
  hashtagRules: { allowHashtags: boolean; min?: number; max?: number }
  mediaRules: { required?: boolean; maxItems?: number; allowVideo?: boolean; allowImages?: boolean }
  requiredFields: string[]
}

type CopywriterOption = {
  platform: PlatformType
  name: string
  version: string
  description: string
  bestFor: string[]
  promptStyle: string
  maxConcurrentJobs: number
}

type ModelProfileOption = {
  id: string
  displayName: string
  providerId: string
  provider: string
  providerDisplayName: string
  apiKeyEnv: string
  modelName: string
  temperature: number
  jsonMode: boolean
  maxTokensByTask: Partial<Record<PromptTask, number>>
  fallbackProfileIds: string[]
  rationale: string
}

type VerticalOption = {
  vertical: IndustryVertical
  displayName: string
  customerIntents: string[]
  proofSignals: string[]
  complianceNotes: string[]
}

type LabResult = {
  platform: PlatformType
  vertical: IndustryVertical
  caption: string
  hashtags: string[]
  hook: { text: string; category: string; score: number; reason?: string }
  quality: {
    passed: boolean
    score: number
    issues: Array<{ code: string; severity: 'error' | 'warning'; message: string }>
    rewriteInstruction?: string
  }
  provenance: {
    platformSkillVersion: string
    verticalSkillVersion: string
    knowledgeEntryIds: string[]
    modelId?: string
    modelProfileId?: string
    promptVersion: string
  }
}

type LabResponse = {
  result: LabResult
  latencyMs: number
}

type PlatformSkillRecord = {
  platform: PlatformType
  path: string
  markdown: string
}

type PromptTuningEntry = {
  platform?: string
  vertical?: string
  task?: string
  notes: string
  updatedAt?: string
  updatedBy?: string
}

type SkillConfigResponse = {
  platformSkills: PlatformSkillRecord[]
  promptTuning: { entries: PromptTuningEntry[] }
}

type PromptTask = 'hook_generation' | 'body_composition' | 'quality_rewrite'

type CopywriterLogRecord = {
  id: string
  brandId: string
  userId: string
  promptVersion?: string | null
  systemPrompt: string
  userInput: string
  rawOutput: string
  modelId?: string | null
  latencyMs?: number | null
  tokenEstimate?: number | null
  platform?: string | null
  draftId?: string | null
  createdAt: string
  rating?: number | null
  adminNote?: string | null
  correctedContent?: string | null
  isAnnotated: boolean
  trainingTag?: string | null
  brand?: { name: string }
}

const starterByPlatform: Record<PlatformType, Partial<FormState>> = {
  instagram: {
    industryVertical: 'fitness_pilates',
    theme: 'Promote weekday lunch-time reformer pilates trial classes',
    customerIntent: 'trial_class',
    localProofText: 'Tanjong Pagar\n45-minute class\nbeginner-friendly',
    mediaText: 'https://example.com/reformer-studio.jpg',
  },
  google_business: {
    industryVertical: 'beauty_wellness',
    theme: 'Announce a weekday hydration facial package',
    customerIntent: 'booking',
    localProofText: 'East Coast\nweekday appointments\n60-minute facial',
    mediaText: '',
  },
  xiaohongshu: {
    industryVertical: 'home_renovation',
    theme: '分享小户型玄关收纳改造案例',
    customerIntent: 'upgrade_space',
    localProofText: '小户型\n玄关收纳\n木作细节\n新加坡公寓',
    mediaText: 'https://example.com/entryway-storage.jpg',
  },
  facebook: {
    industryVertical: 'events_entertainment',
    theme: 'Promote a weekend family activity',
    customerIntent: 'group_booking',
    localProofText: 'weekend\nfamily-friendly\nlocal venue',
    mediaText: '',
  },
  tiktok: {
    industryVertical: 'retail_specialty',
    theme: 'Short video caption for a limited weekend product drop',
    customerIntent: 'discover_product',
    localProofText: 'new arrival\nweekend drop\nlocal pickup',
    mediaText: 'https://example.com/product-drop.mp4',
  },
}

type FormState = {
  brandId: string
  platform: PlatformType
  industryVertical: IndustryVertical
  theme: string
  angle: string
  customerIntent: string
  locationFocus: string
  localProofText: string
  mustMentionText: string
  mustAvoidText: string
  mediaText: string
}

const initialForm: FormState = {
  brandId: '',
  platform: 'instagram',
  industryVertical: 'fitness_pilates',
  theme: 'Promote weekday lunch-time reformer pilates trial classes',
  angle: '',
  customerIntent: 'trial_class',
  locationFocus: '',
  localProofText: 'Tanjong Pagar\n45-minute class\nbeginner-friendly',
  mustMentionText: '',
  mustAvoidText: '',
  mediaText: 'https://example.com/reformer-studio.jpg',
}

export default function ContentLabPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<BrandOption[]>([])
  const [platforms, setPlatforms] = useState<PlatformOption[]>([])
  const [copywriters, setCopywriters] = useState<CopywriterOption[]>([])
  const [modelProfiles, setModelProfiles] = useState<ModelProfileOption[]>([])
  const [platformModelProfiles, setPlatformModelProfiles] = useState<Record<PlatformType, Partial<Record<PromptTask, string>>>>({} as Record<PlatformType, Partial<Record<PromptTask, string>>>)
  const [verticals, setVerticals] = useState<VerticalOption[]>([])
  const [form, setForm] = useState<FormState>(initialForm)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [response, setResponse] = useState<LabResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [skillConfig, setSkillConfig] = useState<SkillConfigResponse | null>(null)
  const [selectedSkillPlatform, setSelectedSkillPlatform] = useState<PlatformType>('instagram')
  const [skillMarkdown, setSkillMarkdown] = useState('')
  const [promptTask, setPromptTask] = useState<PromptTask>('body_composition')
  const [promptNotes, setPromptNotes] = useState('')
  const [savingSkill, setSavingSkill] = useState(false)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [reviewLogs, setReviewLogs] = useState<CopywriterLogRecord[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState('')
  const [selectedLogId, setSelectedLogId] = useState('')
  const [logRating, setLogRating] = useState('3')
  const [logTrainingTag, setLogTrainingTag] = useState('include')
  const [logAdminNote, setLogAdminNote] = useState('')
  const [logCorrectedContent, setLogCorrectedContent] = useState('')
  const [savingLogReview, setSavingLogReview] = useState(false)

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand.id === form.brandId) ?? null,
    [brands, form.brandId],
  )
  const selectedPlatform = platforms.find((platform) => platform.platform === form.platform)
  const selectedCopywriter = copywriters.find((copywriter) => copywriter.platform === form.platform)
  const selectedVertical = verticals.find((vertical) => vertical.vertical === form.industryVertical)
  const selectedModelProfileId = platformModelProfiles[form.platform]?.body_composition
  const selectedModelProfile = modelProfiles.find((profile) => profile.id === selectedModelProfileId)
  const selectedLog = reviewLogs.find((log) => log.id === selectedLogId) ?? reviewLogs[0] ?? null

  useEffect(() => {
    void loadLabData()
  }, [])

  useEffect(() => {
    void loadReviewLogs()
  }, [])

  useEffect(() => {
    const record = skillConfig?.platformSkills.find((skill) => skill.platform === selectedSkillPlatform)
    setSkillMarkdown(record?.markdown || '')
  }, [selectedSkillPlatform, skillConfig])

  useEffect(() => {
    const entry = findPromptEntry(skillConfig?.promptTuning.entries || [], form.platform, form.industryVertical, promptTask)
    setPromptNotes(entry?.notes || '')
  }, [form.platform, form.industryVertical, promptTask, skillConfig])

  useEffect(() => {
    if (!selectedLog) return
    setSelectedLogId(selectedLog.id)
    setLogRating(String(selectedLog.rating ?? 3))
    setLogTrainingTag(selectedLog.trainingTag || 'include')
    setLogAdminNote(selectedLog.adminNote || '')
    setLogCorrectedContent(selectedLog.correctedContent || '')
  }, [selectedLog?.id])

  async function loadLabData() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/content-lab')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load content lab')
      setBrands(data.brands || [])
      setPlatforms(data.platforms || [])
      setCopywriters(data.copywriters || [])
      setModelProfiles(data.modelProfiles || [])
      setPlatformModelProfiles(data.platformModelProfiles || {})
      setVerticals(data.verticals || [])
      const firstBrandId = data.brands?.[0]?.id || ''
      setForm((current) => ({
        ...current,
        brandId: current.brandId || firstBrandId,
      }))
      await loadSkillConfig()
    } catch (err: any) {
      setError(err.message || 'Failed to load content lab')
    } finally {
      setLoading(false)
    }
  }

  async function loadSkillConfig() {
    const res = await fetch('/api/admin/content-lab/skills')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load skill config')
    setSkillConfig(data)
  }

  async function loadReviewLogs() {
    setLogsLoading(true)
    setLogsError('')
    try {
      const params = new URLSearchParams({
        limit: '25',
        page: '1',
      })
      const res = await fetch(`/api/admin/copywriter-logs?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load review logs')
      const logs = data.logs || []
      setReviewLogs(logs)
      setSelectedLogId((current) => current || logs[0]?.id || '')
    } catch (err: any) {
      setLogsError(err.message || 'Failed to load review logs')
    } finally {
      setLogsLoading(false)
    }
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function applyPlatform(platform: PlatformType) {
    setForm((current) => ({
      ...current,
      platform,
      ...starterByPlatform[platform],
    }))
    setResponse(null)
  }

  async function generate() {
    setGenerating(true)
    setError('')
    setResponse(null)
    try {
      const res = await fetch('/api/admin/content-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: form.brandId,
          platform: form.platform,
          industryVertical: form.industryVertical,
          theme: form.theme,
          angle: form.angle,
          customerIntent: form.customerIntent,
          locationFocus: form.locationFocus,
          localProof: lines(form.localProofText),
          mustMention: lines(form.mustMentionText),
          mustAvoid: lines(form.mustAvoidText),
          media: lines(form.mediaText).map((url) => ({ url, mimeType: guessMimeType(url) })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate content')
      setResponse(data)
      await loadReviewLogs()
    } catch (err: any) {
      setError(err.message || 'Failed to generate content')
    } finally {
      setGenerating(false)
    }
  }

  async function copyOutput() {
    if (!response) return
    const output = `${response.result.caption}\n\n${response.result.hashtags.map((tag) => `#${tag}`).join(' ')}`
    await navigator.clipboard.writeText(output.trim())
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  async function savePlatformSkill() {
    setSavingSkill(true)
    setError('')
    try {
      const res = await fetch('/api/admin/content-lab/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'platformSkill',
          platform: selectedSkillPlatform,
          markdown: skillMarkdown,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save skill')
      await loadSkillConfig()
    } catch (err: any) {
      setError(err.message || 'Failed to save skill')
    } finally {
      setSavingSkill(false)
    }
  }

  async function savePromptTuning() {
    setSavingPrompt(true)
    setError('')
    try {
      const res = await fetch('/api/admin/content-lab/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'promptTuning',
          platform: form.platform,
          vertical: form.industryVertical,
          task: promptTask,
          notes: promptNotes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save prompt tuning')
      setSkillConfig((current) => current ? { ...current, promptTuning: data.promptTuning } : current)
    } catch (err: any) {
      setError(err.message || 'Failed to save prompt tuning')
    } finally {
      setSavingPrompt(false)
    }
  }

  async function saveLogReview() {
    if (!selectedLog) return
    setSavingLogReview(true)
    setLogsError('')
    try {
      const res = await fetch(`/api/admin/copywriter-logs/${selectedLog.id}/annotate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: Number(logRating),
          trainingTag: logTrainingTag,
          adminNote: logAdminNote,
          correctedContent: logCorrectedContent,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save review')
      setReviewLogs((current) => current.map((log) => (
        log.id === selectedLog.id
          ? {
              ...log,
              rating: data.log.rating,
              trainingTag: data.log.trainingTag,
              adminNote: data.log.adminNote,
              correctedContent: data.log.correctedContent,
              isAnnotated: data.log.isAnnotated,
            }
          : log
      )))
    } catch (err: any) {
      setLogsError(err.message || 'Failed to save review')
    } finally {
      setSavingLogReview(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin')}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              title="Back to admin"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold">Copywriter Tuning Lab</h1>
              <p className="text-sm text-slate-500">amc-content platform generation and quality review</p>
            </div>
          </div>
          <button
            onClick={() => void loadLabData()}
            className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-5 py-5 lg:grid-cols-[360px_1fr_330px]">
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold">Brief</h2>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading lab data
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Brand</span>
                <select
                  value={form.brandId}
                  onChange={(event) => updateForm('brandId', event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
                >
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-2 block text-xs font-medium text-slate-600">Platform Copywriter</span>
                <div className="grid grid-cols-1 gap-2">
                  {platforms.map((platform) => (
                    <button
                      key={platform.platform}
                      onClick={() => applyPlatform(platform.platform)}
                      className={`min-h-14 rounded-md border px-3 py-2 text-left ${
                        form.platform === platform.platform
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block text-sm font-semibold">{platform.displayName}</span>
                      <span className="block truncate text-xs opacity-75">
                        {copywriters.find((copywriter) => copywriter.platform === platform.platform)?.name || 'Default provider'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Vertical</span>
                <select
                  value={form.industryVertical}
                  onChange={(event) => updateForm('industryVertical', event.target.value as IndustryVertical)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
                >
                  {verticals.map((vertical) => (
                    <option key={vertical.vertical} value={vertical.vertical}>{vertical.displayName}</option>
                  ))}
                </select>
              </label>

              <TextArea label="Theme" value={form.theme} rows={3} onChange={(value) => updateForm('theme', value)} />
              <TextArea label="Angle" value={form.angle} rows={2} onChange={(value) => updateForm('angle', value)} />

              <div className="grid grid-cols-2 gap-3">
                <Input label="Intent" value={form.customerIntent} onChange={(value) => updateForm('customerIntent', value)} />
                <Input label="Location" value={form.locationFocus} onChange={(value) => updateForm('locationFocus', value)} />
              </div>

              <TextArea label="Local proof" value={form.localProofText} rows={4} onChange={(value) => updateForm('localProofText', value)} />
              <TextArea label="Must mention" value={form.mustMentionText} rows={3} onChange={(value) => updateForm('mustMentionText', value)} />
              <TextArea label="Must avoid" value={form.mustAvoidText} rows={3} onChange={(value) => updateForm('mustAvoidText', value)} />
              <TextArea label="Media URLs" value={form.mediaText} rows={3} onChange={(value) => updateForm('mediaText', value)} />

              <button
                onClick={() => void generate()}
                disabled={generating || !form.brandId || !form.theme}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate
              </button>
            </div>
          )}
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Output</h2>
              <p className="text-xs text-slate-500">{selectedBrand?.name || 'No brand selected'}</p>
            </div>
            <button
              onClick={() => void copyOutput()}
              disabled={!response}
              className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <Clipboard className="h-4 w-4" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {error ? (
            <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : null}

          {!response && !error ? (
            <div className="flex min-h-[520px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
              Generate a draft to inspect caption, hashtags, quality, and provenance.
            </div>
          ) : null}

          {response ? (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Selected hook</div>
                <p className="text-base font-semibold text-slate-900">{response.result.hook.text}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {response.result.hook.category} · score {response.result.hook.score.toFixed(2)}
                </p>
              </div>

              <div className="rounded-md border border-slate-200 p-4">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Caption</div>
                <div className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{response.result.caption}</div>
              </div>

              <div className="rounded-md border border-slate-200 p-4">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Hashtags</div>
                {response.result.hashtags.length ? (
                  <div className="flex flex-wrap gap-2">
                    {response.result.hashtags.map((tag) => (
                      <span key={tag} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">#{tag}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No hashtags</p>
                )}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">Quality</h2>
            {response ? (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 rounded-md p-3 ${
                  response.result.quality.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {response.result.quality.passed ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <span className="text-sm font-semibold">
                    {response.result.quality.passed ? 'Passed' : 'Needs review'} · {Math.round(response.result.quality.score * 100)}
                  </span>
                </div>
                <IssueList issues={response.result.quality.issues} />
              </div>
            ) : (
              <p className="text-sm text-slate-400">No result yet</p>
            )}
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">Copywriter Provider</h2>
            {selectedCopywriter ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{selectedCopywriter.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedCopywriter.version}</p>
                </div>
                <p className="text-sm leading-5 text-slate-600">{selectedCopywriter.description}</p>
                <dl className="space-y-2 text-sm">
                  <Row label="Style" value={selectedCopywriter.promptStyle} />
                  <Row label="Concurrency" value={`${selectedCopywriter.maxConcurrentJobs}`} />
                  <Row label="Best for" value={selectedCopywriter.bestFor.join(', ')} />
                </dl>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No provider selected</p>
            )}
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">Model Profile</h2>
            {selectedModelProfile ? (
              <dl className="space-y-2 text-sm">
                <Row label="Profile" value={selectedModelProfile.displayName} />
                <Row label="Provider" value={selectedModelProfile.providerDisplayName} />
                <Row label="Model" value={selectedModelProfile.modelName} />
                <Row label="API key" value={selectedModelProfile.apiKeyEnv} />
                <Row label="Temp" value={`${selectedModelProfile.temperature}`} />
                <Row label="Fallback" value={selectedModelProfile.fallbackProfileIds.join(', ') || 'legacy router'} />
              </dl>
            ) : (
              <p className="text-sm text-slate-400">No model profile selected</p>
            )}
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">Platform Rules</h2>
            {selectedPlatform ? (
              <dl className="space-y-2 text-sm">
                <Row label="Language" value={selectedPlatform.defaultLanguage} />
                <Row label="Max caption" value={`${selectedPlatform.maxCaptionLength}`} />
                <Row label="Hashtags" value={selectedPlatform.hashtagRules.allowHashtags ? `${selectedPlatform.hashtagRules.min ?? 0}-${selectedPlatform.hashtagRules.max ?? '∞'}` : 'disabled'} />
                <Row label="Media" value={selectedPlatform.mediaRules.required ? 'required' : 'optional'} />
                <Row label="Required" value={selectedPlatform.requiredFields.join(', ') || 'none'} />
              </dl>
            ) : null}
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">Provenance</h2>
            {response ? (
              <dl className="space-y-2 text-sm">
                <Row label="Latency" value={`${response.latencyMs}ms`} />
                <Row label="Model" value={response.result.provenance.modelId || 'unknown'} />
                <Row label="Profile" value={response.result.provenance.modelProfileId || selectedModelProfileId || 'unknown'} />
                <Row label="Prompt" value={response.result.provenance.promptVersion} />
                <Row label="Platform skill" value={response.result.provenance.platformSkillVersion} />
                <Row label="Vertical skill" value={response.result.provenance.verticalSkillVersion} />
                <Row label="Knowledge" value={`${response.result.provenance.knowledgeEntryIds.length} entries`} />
              </dl>
            ) : (
              <p className="text-sm text-slate-400">No provenance yet</p>
            )}
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">Vertical Notes</h2>
            {selectedVertical ? (
              <div className="space-y-3 text-sm text-slate-600">
                <p>{selectedVertical.customerIntents.join(', ')}</p>
                <p>{selectedVertical.complianceNotes.join(' ')}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">Prompt Tuning</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Task</span>
                <select
                  value={promptTask}
                  onChange={(event) => setPromptTask(event.target.value as PromptTask)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-indigo-500"
                >
                  <option value="hook_generation">Hook generation</option>
                  <option value="body_composition">Body composition</option>
                  <option value="quality_rewrite">Quality rewrite</option>
                </select>
              </label>
              <textarea
                value={promptNotes}
                rows={7}
                onChange={(event) => setPromptNotes(event.target.value)}
                placeholder="Add admin tuning notes for the selected platform, vertical, and task."
                className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm leading-5 outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => void savePromptTuning()}
                disabled={savingPrompt}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
              >
                {savingPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Prompt Notes
              </button>
            </div>
          </section>
        </aside>
      </div>

      <section className="mx-auto max-w-7xl px-5 pb-6">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Platform Skill Editor</h2>
              <p className="text-xs text-slate-500">These markdown skills are still used by the legacy fallback chain and as review references.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedSkillPlatform}
                onChange={(event) => setSelectedSkillPlatform(event.target.value as PlatformType)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
              >
                {platforms.map((platform) => (
                  <option key={platform.platform} value={platform.platform}>{platform.displayName}</option>
                ))}
              </select>
              <button
                onClick={() => void savePlatformSkill()}
                disabled={savingSkill || !skillMarkdown.trim()}
                className="flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
              >
                {savingSkill ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Skill
              </button>
            </div>
          </div>
          <textarea
            value={skillMarkdown}
            rows={18}
            onChange={(event) => setSkillMarkdown(event.target.value)}
            className="w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-xs leading-5 text-slate-800 outline-none focus:border-indigo-500"
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Review Logs</h2>
              <p className="text-xs text-slate-500">Stored copywriter inputs, outputs, provenance, and training annotations.</p>
            </div>
            <button
              onClick={() => void loadReviewLogs()}
              className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Reload Logs
            </button>
          </div>

          {logsError ? (
            <div className="mb-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{logsError}</span>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <div className="min-h-[360px] rounded-md border border-slate-200">
              {logsLoading && reviewLogs.length === 0 ? (
                <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading logs
                </div>
              ) : null}

              {!logsLoading && reviewLogs.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                  No copywriter logs yet.
                </div>
              ) : null}

              {reviewLogs.map((log) => (
                <button
                  key={log.id}
                  onClick={() => setSelectedLogId(log.id)}
                  className={`block w-full border-b border-slate-100 px-3 py-3 text-left last:border-b-0 ${
                    selectedLog?.id === log.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{log.brand?.name || log.brandId}</span>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                      log.isAnnotated ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {log.isAnnotated ? 'reviewed' : 'new'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span>{log.platform || 'all'}</span>
                    <span>·</span>
                    <span>{log.modelId || 'unknown model'}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{log.userInput}</p>
                  <p className="mt-2 text-[11px] text-slate-400">{formatDateTime(log.createdAt)}</p>
                </button>
              ))}
            </div>

            {selectedLog ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <Metric label="Brand" value={selectedLog.brand?.name || selectedLog.brandId} />
                  <Metric label="Platform" value={selectedLog.platform || 'all'} />
                  <Metric label="Model" value={selectedLog.modelId || 'unknown'} />
                  <Metric label="Latency" value={selectedLog.latencyMs ? `${selectedLog.latencyMs}ms` : 'n/a'} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <LogPanel title="Input" value={selectedLog.userInput} />
                  <LogPanel title="Output" value={formatJsonLike(selectedLog.rawOutput)} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <LogPanel title="System Prompt / Provenance" value={formatJsonLike(selectedLog.systemPrompt)} />
                  <div className="rounded-md border border-slate-200 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Eye className="h-4 w-4 text-indigo-600" />
                      <h3 className="text-sm font-semibold">Training Review</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Rating</span>
                        <select
                          value={logRating}
                          onChange={(event) => setLogRating(event.target.value)}
                          className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-indigo-500"
                        >
                          <option value="3">3 · good</option>
                          <option value="2">2 · ok</option>
                          <option value="1">1 · bad</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Training tag</span>
                        <select
                          value={logTrainingTag}
                          onChange={(event) => setLogTrainingTag(event.target.value)}
                          className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-indigo-500"
                        >
                          <option value="include">include</option>
                          <option value="exclude">exclude</option>
                          <option value="needs_rewrite">needs_rewrite</option>
                        </select>
                      </label>
                    </div>
                    <TextArea label="Admin note" value={logAdminNote} rows={4} onChange={setLogAdminNote} />
                    <TextArea label="Corrected content" value={logCorrectedContent} rows={7} onChange={setLogCorrectedContent} />
                    <button
                      onClick={() => void saveLogReview()}
                      disabled={savingLogReview}
                      className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
                    >
                      {savingLogReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Review
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[360px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                Select a log to review input, output, and training fields.
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
      />
    </label>
  )
}

function TextArea({
  label,
  value,
  rows,
  onChange,
}: {
  label: string
  value: string
  rows: number
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm leading-5 outline-none focus:border-indigo-500"
      />
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function IssueList({ issues }: { issues: LabResult['quality']['issues'] }) {
  if (issues.length === 0) {
    return <p className="text-sm text-slate-500">No quality issues.</p>
  }
  return (
    <div className="space-y-2">
      {issues.map((issue, index) => (
        <div key={`${issue.code}-${index}`} className="rounded-md border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">{issue.code}</span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              issue.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {issue.severity}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{issue.message}</p>
        </div>
      ))}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function LogPanel({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{title}</div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-700">
        {value || 'Empty'}
      </pre>
    </div>
  )
}

function formatJsonLike(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-SG', {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: false,
    }).format(new Date(value))
  } catch {
    return value
  }
}

function lines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)
}

function guessMimeType(url: string): string | undefined {
  const lower = url.toLowerCase()
  if (lower.endsWith('.mp4') || lower.endsWith('.mov')) return 'video/mp4'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.includes('image')) return 'image/jpeg'
  return undefined
}

function findPromptEntry(
  entries: PromptTuningEntry[],
  platform: PlatformType,
  vertical: IndustryVertical,
  task: PromptTask,
): PromptTuningEntry | undefined {
  return entries.find((entry) =>
    entry.platform === platform
    && entry.vertical === vertical
    && entry.task === task
  )
}
