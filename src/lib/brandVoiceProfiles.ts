import { prisma } from '@/lib/prisma'
import { generateTtsAudio, getActiveMiniMaxTtsConfigs, type TtsConfig } from '@/lib/ttsGeneration'

export type BrandVoiceProfileRole = 'owner' | 'chef' | 'staff' | 'announcer' | 'custom'
export type BrandVoiceProfileStatus = 'processing' | 'ready' | 'failed' | 'disabled'

export type BrandVoiceProfile = {
  id: string
  brandId: string
  label: string
  role: BrandVoiceProfileRole
  provider: 'minimax'
  providerVoiceId: string
  sampleFileName?: string
  sampleMimeType?: string
  status: BrandVoiceProfileStatus
  isDefaultForVoiceover: boolean
  consent: {
    confirmedByUserId: string
    confirmedAt: string
    scope: 'brand_content'
    speakerName?: string
  }
  error?: string
  createdAt: string
  updatedAt: string
}

type CreateBrandVoiceInput = {
  brandId: string
  label: string
  role?: string
  speakerName?: string
  file: File
  actorId: string
  actorType?: string
  actorRole?: string
}

const MAX_AUDIO_BYTES = 20 * 1024 * 1024
const SUPPORTED_AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/wave', 'audio/x-wav'])
const DEFAULT_CLONE_TEXT = '你好，欢迎来到我们的店。今天给大家介绍一道很适合现在品尝的招牌推荐。'

export function normalizeBrandVoiceProfiles(value: unknown, brandId: string): BrandVoiceProfile[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const id = text(record.id)
    const providerVoiceId = text(record.providerVoiceId)
    if (!id || !providerVoiceId) return []
    const status = normalizeStatus(record.status)
    return [{
      id,
      brandId: text(record.brandId) || brandId,
      label: text(record.label) || '商家声音',
      role: normalizeRole(record.role),
      provider: 'minimax',
      providerVoiceId,
      sampleFileName: text(record.sampleFileName) || undefined,
      sampleMimeType: text(record.sampleMimeType) || undefined,
      status,
      isDefaultForVoiceover: Boolean(record.isDefaultForVoiceover),
      consent: normalizeConsent(record.consent, text(record.createdAt) || new Date().toISOString()),
      error: text(record.error) || undefined,
      createdAt: text(record.createdAt) || new Date().toISOString(),
      updatedAt: text(record.updatedAt) || new Date().toISOString(),
    }]
  })
}

export async function listBrandVoiceProfiles(brandId: string) {
  const knowledge = await prisma.brandKnowledge.findUnique({
    where: { brandId },
    select: { brandVoiceProfiles: true, defaultBrandVoiceProfileId: true },
  })
  const profiles = normalizeBrandVoiceProfiles(knowledge?.brandVoiceProfiles, brandId)
  return {
    profiles: profiles.map((profile) => ({
      ...profile,
      isDefaultForVoiceover: profile.id === knowledge?.defaultBrandVoiceProfileId || profile.isDefaultForVoiceover,
    })),
    defaultBrandVoiceProfileId: knowledge?.defaultBrandVoiceProfileId || profiles.find((item) => item.isDefaultForVoiceover)?.id || null,
  }
}

export async function createBrandVoiceProfile(input: CreateBrandVoiceInput) {
  validateAudioFile(input.file)
  const configs = await getActiveMiniMaxTtsConfigs()
  const config = configs[0]
  if (!config) throw new Error('TTS_MODEL_NOT_CONFIGURED')

  const now = new Date().toISOString()
  const profileId = crypto.randomUUID()
  const providerVoiceId = buildMiniMaxVoiceId(input.brandId, profileId)
  const role = normalizeRole(input.role)
  const label = text(input.label) || defaultRoleLabel(role)
  const fileId = await uploadMiniMaxVoiceSource(config, input.file)
  await cloneMiniMaxVoice(config, {
    fileId,
    voiceId: providerVoiceId,
    modelName: config.modelName || 'speech-2.8-hd',
    sampleText: DEFAULT_CLONE_TEXT,
  })

  const profile: BrandVoiceProfile = {
    id: profileId,
    brandId: input.brandId,
    label,
    role,
    provider: 'minimax',
    providerVoiceId,
    sampleFileName: input.file.name || undefined,
    sampleMimeType: input.file.type || undefined,
    status: 'ready',
    isDefaultForVoiceover: false,
    consent: {
      confirmedByUserId: input.actorId,
      confirmedAt: now,
      scope: 'brand_content',
      speakerName: text(input.speakerName) || undefined,
    },
    createdAt: now,
    updatedAt: now,
  }

  await generateTtsAudio({
    text: DEFAULT_CLONE_TEXT,
    voiceId: providerVoiceId,
    brandId: input.brandId,
    actorId: input.actorId,
    actorType: input.actorType,
    actorRole: input.actorRole,
  }).catch((error) => {
    console.warn('[brand-voices] activation TTS failed after clone:', error)
  })

  return saveBrandVoiceProfile(input.brandId, profile, { makeDefaultIfFirst: true })
}

export async function updateBrandVoiceProfile(brandId: string, voiceProfileId: string, input: {
  label?: unknown
  role?: unknown
  isDefaultForVoiceover?: unknown
  status?: unknown
}) {
  const current = await listBrandVoiceProfiles(brandId)
  const now = new Date().toISOString()
  let found = false
  const profiles = current.profiles.map((profile) => {
    if (profile.id !== voiceProfileId) return profile
    found = true
    return {
      ...profile,
      label: input.label !== undefined ? text(input.label) || profile.label : profile.label,
      role: input.role !== undefined ? normalizeRole(input.role) : profile.role,
      status: input.status !== undefined ? normalizeStatus(input.status) : profile.status,
      isDefaultForVoiceover: input.isDefaultForVoiceover !== undefined ? Boolean(input.isDefaultForVoiceover) : profile.isDefaultForVoiceover,
      updatedAt: now,
    }
  })
  if (!found) return null
  const defaultId = input.isDefaultForVoiceover
    ? voiceProfileId
    : current.defaultBrandVoiceProfileId === voiceProfileId
      ? null
      : current.defaultBrandVoiceProfileId
  return persistBrandVoiceProfiles(brandId, profiles, defaultId)
}

export async function disableBrandVoiceProfile(brandId: string, voiceProfileId: string) {
  return updateBrandVoiceProfile(brandId, voiceProfileId, { status: 'disabled', isDefaultForVoiceover: false })
}

export async function previewBrandVoiceProfile(brandId: string, voiceProfileId: string, input: {
  text?: unknown
  actorId: string
  actorType?: string
  actorRole?: string
}) {
  const current = await listBrandVoiceProfiles(brandId)
  const profile = current.profiles.find((item) => item.id === voiceProfileId && item.status === 'ready')
  if (!profile) return null
  const result = await generateTtsAudio({
    text: text(input.text) || DEFAULT_CLONE_TEXT,
    voiceId: profile.providerVoiceId,
    brandId,
    actorId: input.actorId,
    actorType: input.actorType,
    actorRole: input.actorRole,
  })
  return { profile, result }
}

async function saveBrandVoiceProfile(brandId: string, profile: BrandVoiceProfile, options?: { makeDefaultIfFirst?: boolean }) {
  const current = await listBrandVoiceProfiles(brandId)
  const profiles = [...current.profiles, profile]
  const defaultId = current.defaultBrandVoiceProfileId || (options?.makeDefaultIfFirst ? profile.id : null)
  return persistBrandVoiceProfiles(brandId, profiles, defaultId)
}

async function persistBrandVoiceProfiles(brandId: string, profiles: BrandVoiceProfile[], defaultId: string | null) {
  const nextProfiles = profiles.map((profile) => ({
    ...profile,
    isDefaultForVoiceover: Boolean(defaultId && profile.id === defaultId),
  }))
  const saved = await prisma.brandKnowledge.upsert({
    where: { brandId },
    update: {
      brandVoiceProfiles: nextProfiles,
      defaultBrandVoiceProfileId: defaultId,
    },
    create: {
      brandId,
      slangDict: {},
      negPrompts: [],
      menuItems: [],
      voiceId: '',
      brandVoiceProfiles: nextProfiles,
      defaultBrandVoiceProfileId: defaultId,
    },
    select: { brandVoiceProfiles: true, defaultBrandVoiceProfileId: true },
  })
  const savedProfiles = normalizeBrandVoiceProfiles(saved.brandVoiceProfiles, brandId)
  return {
    profiles: savedProfiles,
    defaultBrandVoiceProfileId: saved.defaultBrandVoiceProfileId || null,
    profile: savedProfiles.find((item) => item.id === profiles[profiles.length - 1]?.id) || null,
  }
}

async function uploadMiniMaxVoiceSource(config: TtsConfig, file: File): Promise<number> {
  const form = new FormData()
  form.set('purpose', 'voice_clone')
  form.set('file', file, file.name || 'voice-sample.mp3')
  const response = await fetch(endpointFromBase(config.baseUrl, '/v1/files/upload', 'https://api.minimax.io/v1/files/upload'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.base_resp?.status_msg || payload?.error || `MiniMax upload failed with ${response.status}`)
  const fileId = Number(payload?.file?.file_id || payload?.file_id || payload?.data?.file_id)
  if (!Number.isFinite(fileId) || fileId <= 0) throw new Error('MiniMax upload returned no file_id')
  return fileId
}

async function cloneMiniMaxVoice(config: TtsConfig, input: {
  fileId: number
  voiceId: string
  modelName: string
  sampleText: string
}) {
  const response = await fetch(endpointFromBase(config.baseUrl, '/v1/voice_clone', 'https://api.minimax.io/v1/voice_clone'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: input.fileId,
      voice_id: input.voiceId,
      text: input.sampleText,
      text_validation: input.sampleText,
      model: input.modelName,
      accuracy: 0.7,
      need_noise_reduction: true,
      need_volume_normalization: true,
      aigc_watermark: true,
    }),
    signal: AbortSignal.timeout(Math.max(60_000, Math.min(config.timeoutMs || 120_000, 180_000))),
  })
  const payload = await response.json().catch(() => null)
  const statusCode = payload?.base_resp?.status_code
  if (!response.ok || statusCode !== 0) {
    throw new Error(payload?.base_resp?.status_msg || payload?.error || `MiniMax voice clone failed with ${response.status}`)
  }
}

function endpointFromBase(baseUrl: string | null | undefined, path: string, fallback: string) {
  try {
    const url = new URL(baseUrl || fallback)
    url.pathname = path
    url.search = ''
    return url.toString()
  } catch {
    return fallback
  }
}

function validateAudioFile(file: File) {
  if (!file || file.size <= 0) throw new Error('Audio file is required')
  if (file.size > MAX_AUDIO_BYTES) throw new Error('声音文件不能超过 20MB')
  const name = file.name.toLowerCase()
  const hasSupportedExtension = /\.(mp3|m4a|wav)$/.test(name)
  if (file.type && !SUPPORTED_AUDIO_TYPES.has(file.type) && !hasSupportedExtension) {
    throw new Error('仅支持 mp3、m4a、wav 声音文件')
  }
}

function buildMiniMaxVoiceId(brandId: string, profileId: string) {
  return `amc_${safeToken(brandId).slice(0, 18)}_${safeToken(profileId).slice(0, 18)}`
}

function safeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'voice'
}

function normalizeRole(value: unknown): BrandVoiceProfileRole {
  const role = text(value)
  if (role === 'owner' || role === 'chef' || role === 'staff' || role === 'announcer' || role === 'custom') return role
  return 'owner'
}

function normalizeStatus(value: unknown): BrandVoiceProfileStatus {
  const status = text(value)
  if (status === 'processing' || status === 'ready' || status === 'failed' || status === 'disabled') return status
  return 'ready'
}

function normalizeConsent(value: unknown, fallbackAt: string): BrandVoiceProfile['consent'] {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return {
    confirmedByUserId: text(record.confirmedByUserId),
    confirmedAt: text(record.confirmedAt) || fallbackAt,
    scope: 'brand_content',
    speakerName: text(record.speakerName) || undefined,
  }
}

function defaultRoleLabel(role: BrandVoiceProfileRole) {
  if (role === 'chef') return '主厨声音'
  if (role === 'staff') return '店员声音'
  if (role === 'announcer') return '品牌广告声'
  return '老板声音'
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
