import { miniMaxVoiceEndpoint } from '@/lib/miniMaxEndpoints'
import { miniMaxFileId, miniMaxVoiceBody, readMiniMaxVoiceResponse } from '@/lib/miniMaxVoiceResponse'
import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { generateTtsAudio, getActiveMiniMaxTtsConfigs, type TtsConfig } from '@/lib/ttsGeneration'
import { inspectVoiceAudio, measureAudioDuration, MAX_VOICE_BYTES } from '@/lib/voiceAudioValidation'
import { uploadHuaweiObsObject, getHuaweiObsPrivateUrl, deleteHuaweiObsObject } from '@/lib/integrations/huaweiObs'

export type BrandVoiceProfileRole = 'owner' | 'chef' | 'staff' | 'announcer' | 'custom'
export type BrandVoiceProfileStatus = 'processing' | 'ready' | 'failed' | 'disabled'

export type BrandVoiceProfile = {
  id: string
  brandId: string
  label: string
  role: BrandVoiceProfileRole
  provider: 'minimax'
  providerVoiceId: string
  configId?: string
  configFingerprint?: string
  activatedAt?: string
  taskId?: string
  errorStage?: string
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

const SAMPLE_TEXT = '你好，欢迎来到我们的店。今天给大家介绍一道招牌推荐，希望你会喜欢。'
export const SYSTEM_VOICE_ID = 'Chinese (Mandarin)_Warm_Bestie'
type Actor = { actorId: string; actorType?: string; actorRole?: string }
type Segment = { text: string; shotDurationSec: number; shotId?: string; shotIndex: number }
type VoiceSelection = { profileId: string | null; providerVoiceId: string; label: string; configId: string; configFingerprint: string }
type TaskPayload = Actor & {
  profile?: BrandVoiceProfile; sourceKey?: string; fileId?: string | number; cloneSubmitted?: boolean; cloneSucceeded?: boolean;
  selection?: VoiceSelection; segments?: Segment[];
}
const fingerprint = (c: TtsConfig) => createHash('sha256').update(`${c.apiKey}|${endpoint(c, '/')}`).digest('hex')
const text = (v: unknown) => typeof v === 'string' ? v.trim() : ''
function fail(message: string, status = 409): never { throw Object.assign(new Error(message), { status }) }

export function normalizeBrandVoiceProfiles(value: unknown, brandId: string): BrandVoiceProfile[] {
  if (!Array.isArray(value)) return []
  return value.filter(p => p && typeof p === 'object' && p.id && p.providerVoiceId && (!p.brandId || p.brandId === brandId))
    .map(p => p.status === 'ready' && (!p.configId || !p.configFingerprint || !p.activatedAt)
      ? { ...p, brandId, status: 'failed', error: 'VOICE_REENROLL_REQUIRED: Please record this voice again to verify its account' }
      : { ...p, brandId, status: ['processing', 'ready', 'failed', 'disabled'].includes(p.status) ? p.status : 'failed' })
}

export async function listBrandVoiceProfiles(brandId: string) {
  const row = await prisma.brandKnowledge.findUnique({ where: { brandId }, select: { brandVoiceProfiles: true, defaultBrandVoiceProfileId: true } })
  const profiles = normalizeBrandVoiceProfiles(row?.brandVoiceProfiles, brandId)
  const defaultId = row?.defaultBrandVoiceProfileId || null
  return { profiles: profiles.map(p => ({ ...p, isDefaultForVoiceover: p.id === defaultId })), defaultBrandVoiceProfileId: defaultId }
}

// Serialize the read/modify/write of the JSON document across all server instances.
async function mutateProfiles(brandId: string, mutate: (profiles: BrandVoiceProfile[], defaultId: string | null) => { profiles: BrandVoiceProfile[]; defaultId: string | null }) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`merchant-voice:${brandId}`}))`
    const row = await tx.brandKnowledge.findUnique({ where: { brandId } })
    const next = mutate(normalizeBrandVoiceProfiles(row?.brandVoiceProfiles, brandId), row?.defaultBrandVoiceProfileId || null)
    if (!next.profiles.some(p => p.id === next.defaultId && p.status === 'ready')) next.defaultId = null
    const profiles = next.profiles.map(p => ({ ...p, isDefaultForVoiceover: p.id === next.defaultId }))
    await tx.brandKnowledge.upsert({ where: { brandId },
      update: { brandVoiceProfiles: profiles, defaultBrandVoiceProfileId: next.defaultId },
      create: { brandId, slangDict: {}, negPrompts: [], menuItems: [], voiceId: '', brandVoiceProfiles: profiles, defaultBrandVoiceProfileId: next.defaultId },
    })
    return { profiles, defaultBrandVoiceProfileId: next.defaultId }
  }, { timeout: 15_000 })
}

export async function createBrandVoiceProfile(input: Actor & { brandId: string; file: File; label: string; role?: string; speakerName?: string; requestKey: string }) {
  if (!/^[\w-]{8,100}$/.test(input.requestKey)) fail('A valid idempotency key is required', 400)
  const existing = await prisma.voiceTask.findUnique({ where: { brandId_kind_requestKey: { brandId: input.brandId, kind: 'clone', requestKey: input.requestKey } } })
  if (existing) return { ...await listBrandVoiceProfiles(input.brandId), taskId: existing.id }
  if (!input.file.size || input.file.size > MAX_VOICE_BYTES) fail('VOICE_AUDIO_SIZE: Recording must be at most 20 MB', 400)
  const body = Buffer.from(await input.file.arrayBuffer())
  const info = await inspectVoiceAudio(body)
  const config = (await getActiveMiniMaxTtsConfigs())[0]
  if (!config) fail('TTS_MODEL_NOT_CONFIGURED', 503)
  const id = randomUUID()
  const now = new Date().toISOString()
  const profile: BrandVoiceProfile = {
    id, brandId: input.brandId, label: text(input.label) || 'Merchant voice',
    role: ['owner', 'chef', 'staff', 'announcer', 'custom'].includes(input.role || '') ? input.role as BrandVoiceProfileRole : 'owner',
    provider: 'minimax', providerVoiceId: `amc_${id.replaceAll('-', '')}`,
    configId: config.id, configFingerprint: fingerprint(config), taskId: id,
    sampleFileName: input.file.name, sampleMimeType: info.format === 'Wave' ? 'audio/wav' : info.format === 'MPEG-4' ? 'audio/mp4' : 'audio/mpeg',
    status: 'processing', isDefaultForVoiceover: false,
    consent: { confirmedByUserId: input.actorId, confirmedAt: now, scope: 'brand_content', speakerName: text(input.speakerName) || undefined },
    createdAt: now, updatedAt: now,
  }
  const sourceKey = `brands/${input.brandId}/voices/private/${id}.audio`
  const uploaded = await uploadHuaweiObsObject({ key: sourceKey, body, contentType: profile.sampleMimeType!, private: true, cacheControl: 'private, no-store' })
  if (!uploaded.ok) fail('Voice recording storage is unavailable', 503)
  // Verify bucket policy does not override the private ACL before accepting a recording.
  const anonymous = await fetch(getHuaweiObsPrivateUrl(sourceKey).split('?')[0], { method: 'HEAD', signal: AbortSignal.timeout(10_000) })
  if (anonymous.ok) {
    await deleteHuaweiObsObject(sourceKey)
    fail('Voice source storage must deny anonymous access', 503)
  }
  let task
  try {
    task = await prisma.voiceTask.create({ data: { id, brandId: input.brandId, kind: 'clone', requestKey: input.requestKey,
      payload: { profile, sourceKey, actorId: input.actorId, actorType: input.actorType, actorRole: input.actorRole } } })
  } catch (error: any) {
    await deleteHuaweiObsObject(sourceKey)
    if (error.code !== 'P2002') throw error
    task = await prisma.voiceTask.findUniqueOrThrow({ where: { brandId_kind_requestKey: { brandId: input.brandId, kind: 'clone', requestKey: input.requestKey } } })
  }
  const saved = (task.payload as TaskPayload).profile!
  const result = await mutateProfiles(input.brandId, (profiles, defaultId) => ({ profiles: profiles.some(p => p.id === saved.id) ? profiles : [...profiles, saved], defaultId }))
  return { ...result, taskId: task.id }
}

export async function updateBrandVoiceProfile(brandId: string, id: string, input: { label?: unknown; role?: unknown; isDefaultForVoiceover?: unknown; retry?: unknown; status?: unknown }) {
  if (input.status !== undefined) fail('Voice status is managed by the server', 400)
  if (input.retry === true) {
    const current = (await listBrandVoiceProfiles(brandId)).profiles.find(p => p.id === id)
    if (!current || current.status !== 'failed' || !current.taskId) fail('Only failed voice tasks may be retried; older voices must be recorded again')
    await prisma.voiceTask.updateMany({ where: { id: current.taskId, brandId, status: 'failed' }, data: { status: 'queued', error: null } })
  }
  return mutateProfiles(brandId, (profiles, defaultId) => {
    const p = profiles.find(p => p.id === id)
    if (!p) fail('Voice profile not found', 404)
    if (input.isDefaultForVoiceover === true && p.status !== 'ready') fail('Voice is not ready')
    if (input.label !== undefined) p.label = text(input.label) || p.label
    if (input.role !== undefined && ['owner', 'chef', 'staff', 'announcer', 'custom'].includes(text(input.role))) p.role = text(input.role) as BrandVoiceProfileRole
    if (input.retry === true) { p.status = 'processing'; delete p.error }
    p.updatedAt = new Date().toISOString()
    return { profiles, defaultId: input.isDefaultForVoiceover === true ? id : input.isDefaultForVoiceover === false && defaultId === id ? null : defaultId }
  })
}

export async function disableBrandVoiceProfile(brandId: string, id: string) {
  return mutateProfiles(brandId, (profiles, defaultId) => {
    const p = profiles.find(p => p.id === id)
    if (!p) fail('Voice profile not found', 404)
    p.status = 'disabled'; p.updatedAt = new Date().toISOString()
    return { profiles, defaultId: defaultId === id ? null : defaultId }
  })
}

async function boundConfig(selection: { configId?: string; configFingerprint?: string }) {
  if (!selection.configId || !selection.configFingerprint) fail('VOICE_REENROLL_REQUIRED: Record this voice again to verify its account')
  const config = (await getActiveMiniMaxTtsConfigs()).find(c => c.id === selection.configId)
  if (!config || fingerprint(config) !== selection.configFingerprint) fail('VOICE_CONFIG_UNAVAILABLE: The original MiniMax account is unavailable', 503)
  return config
}

export async function resolveBrandVoiceSelection(brandId: string, input: { brandVoiceProfileId?: string; systemVoiceId?: string }): Promise<VoiceSelection> {
  const list = await listBrandVoiceProfiles(brandId)
  const id = input.brandVoiceProfileId || (!input.systemVoiceId ? list.defaultBrandVoiceProfileId : null)
  if (id) {
    const p = list.profiles.find(p => p.id === id)
    if (!p || p.status !== 'ready' || !p.activatedAt || !p.consent?.confirmedByUserId) fail('VOICE_NOT_READY: Selected merchant voice is unavailable')
    const config = await boundConfig(p)
    return { profileId: p.id, providerVoiceId: p.providerVoiceId, label: p.label, configId: config.id, configFingerprint: fingerprint(config) }
  }
  if (input.systemVoiceId && input.systemVoiceId !== SYSTEM_VOICE_ID) fail('Unknown system voice', 400)
  const config = (await getActiveMiniMaxTtsConfigs())[0]
  if (!config) fail('TTS_MODEL_NOT_CONFIGURED', 503)
  return { profileId: null, providerVoiceId: SYSTEM_VOICE_ID, label: 'System voice', configId: config.id, configFingerprint: fingerprint(config) }
}

export async function previewBrandVoiceProfile(brandId: string, id: string, input: Actor & { text?: unknown }) {
  const selection = await resolveBrandVoiceSelection(brandId, { brandVoiceProfileId: id })
  const sample = text(input.text) || SAMPLE_TEXT
  if (sample.length > 500) fail('Preview text is too long', 400)
  const result = await generateTtsAudio({ ...input, text: sample, voiceId: selection.providerVoiceId, configId: selection.configId, brandId })
  return { profile: (await listBrandVoiceProfiles(brandId)).profiles.find(p => p.id === id)!, result }
}

export async function createVoiceoverTask(brandId: string, input: Actor & { requestKey: string; selection: VoiceSelection; segments: Segment[] }) {
  if (!/^[\w-]{8,150}$/.test(input.requestKey)) fail('Invalid narration request key', 400)
  if (!Array.isArray(input.segments) || !input.segments.length || input.segments.length > 50) fail('Narration requires 1–50 segments', 400)
  let total = 0
  for (const s of input.segments) {
    if (!text(s.text) || s.text.length > 2000 || !Number.isInteger(s.shotIndex) || s.shotIndex < 0 || !Number.isFinite(s.shotDurationSec) || s.shotDurationSec <= 0 || s.shotDurationSec > 300) fail('Invalid narration segment', 400)
    total += s.text.length
  }
  if (total > 10000) fail('Narration text is too long', 400)
  await assertSelection(brandId, input.selection)
  const existing = await prisma.voiceTask.findUnique({ where: { brandId_kind_requestKey: { brandId, kind: 'narration', requestKey: input.requestKey } } })
  if (existing) {
    const previous = existing.payload as TaskPayload
    if (JSON.stringify(previous.selection) !== JSON.stringify(input.selection) || JSON.stringify(previous.segments) !== JSON.stringify(input.segments)) fail('Narration idempotency conflict')
    if (existing.status === 'failed') return prisma.voiceTask.update({ where: { id: existing.id }, data: { status: 'queued', error: null } })
    return existing
  }
  return prisma.voiceTask.upsert({ where: { brandId_kind_requestKey: { brandId, kind: 'narration', requestKey: input.requestKey } }, update: {},
    create: { id: randomUUID(), brandId, kind: 'narration', requestKey: input.requestKey, payload: input } })
}

export async function assertSelection(brandId: string, selection: VoiceSelection) {
  if (!selection || !selection.configId) fail('Missing voice selection', 400)
  await boundConfig(selection)
  if (selection.profileId) {
    const p = (await listBrandVoiceProfiles(brandId)).profiles.find(p => p.id === selection.profileId)
    if (!p || p.status !== 'ready' || !p.activatedAt || !p.consent?.confirmedByUserId || p.providerVoiceId !== selection.providerVoiceId || p.configId !== selection.configId || p.configFingerprint !== selection.configFingerprint) fail('VOICE_DISABLED: Selected merchant voice is unavailable')
  } else if (selection.providerVoiceId !== SYSTEM_VOICE_ID) fail('Unknown system voice', 400)
}

function endpoint(config: TtsConfig, path: string) {
  return miniMaxVoiceEndpoint(config.baseUrl, path)
}
async function miniMax(config: TtsConfig, path: string, body: FormData | object) {
  const form = body instanceof FormData
  const response = await fetch(endpoint(config, path), { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${config.apiKey}`, ...(!form ? { 'Content-Type': 'application/json' } : {}) }, body: form ? body : miniMaxVoiceBody(body), signal: AbortSignal.timeout(120_000) })
  return readMiniMaxVoiceResponse(response, path, config.apiKey)
}

// One task per tick/process; database leases prevent duplicate workers across replicas.
export async function runVoiceTask() {
  const task = await prisma.voiceTask.findFirst({ where: { OR: [{ status: 'queued' }, { status: 'running', leaseUntil: { lt: new Date() } }] }, orderBy: { createdAt: 'asc' } })
  if (!task) return
  const token = randomUUID()
  const acquired = await prisma.voiceTask.updateMany({ where: { id: task.id, status: task.status, leaseToken: task.leaseToken, leaseUntil: task.leaseUntil }, data: { status: 'running', leaseToken: token, leaseUntil: new Date(Date.now() + 600_000) } })
  if (!acquired.count) return
  const payload = task.payload as TaskPayload
  let stage = 'configuration'
  const checkpoint = async (data: object) => {
    const saved = await prisma.voiceTask.updateMany({ where: { id: task.id, leaseToken: token, status: 'running' }, data: { ...data, leaseUntil: new Date(Date.now() + 600_000) } })
    if (!saved.count) throw new Error('VOICE_LEASE_LOST')
  }
  try {
    if (task.kind === 'clone') {
      const p = payload.profile!
      const current = (await listBrandVoiceProfiles(task.brandId)).profiles.find(v => v.id === p.id)
      if (current?.status === 'disabled') fail('VOICE_DISABLED')
      if (!current) await mutateProfiles(task.brandId, (profiles, defaultId) => ({ profiles: [...profiles, p], defaultId }))
      const config = await boundConfig(p)
      let cloned = Boolean(p.activatedAt || payload.cloneSucceeded)
      let activated = false
      stage = 'reconcile'
      if (payload.cloneSubmitted && !cloned) {
        const voices = await miniMax(config, '/v1/get_voice', { voice_type: 'voice_cloning' })
        cloned = (voices.voice_cloning || []).some((v: any) => v.voice_id === p.providerVoiceId)
        // Inactive clones are omitted from get_voice. A missing entry is not proof
        // that the original request failed: activate the same ID, never reclone blindly.
        if (!cloned) {
          await generateTtsAudio({ text: SAMPLE_TEXT, voiceId: p.providerVoiceId, configId: config.id, activateVoice: true, brandId: task.brandId, actorId: payload.actorId })
          cloned = true; activated = true
        }
      }
      if (!cloned) {
        stage = 'upload'
        if (!payload.fileId) {
          const response = await fetch(getHuaweiObsPrivateUrl(payload.sourceKey!), { signal: AbortSignal.timeout(60_000) })
          if (!response.ok) throw new Error('Recording could not be read from private storage')
          const form = new FormData(); form.set('purpose', 'voice_clone')
          const ext = p.sampleMimeType === 'audio/wav' ? 'wav' : p.sampleMimeType === 'audio/mp4' ? 'm4a' : 'mp3'
          form.set('file', new Blob([await response.arrayBuffer()], { type: p.sampleMimeType }), `voice.${ext}`)
          const result = await miniMax(config, '/v1/files/upload', form)
          payload.fileId = miniMaxFileId(result.file?.file_id ?? result.file_id ?? result.data?.file_id)
          await checkpoint({ payload })
        }
        stage = 'clone'
        payload.cloneSubmitted = true
        await checkpoint({ payload })
        await miniMax(config, '/v1/voice_clone', { file_id: payload.fileId, voice_id: p.providerVoiceId, need_noise_reduction: true, need_volume_normalization: true })
        payload.cloneSucceeded = true
        await checkpoint({ payload })
      }
      stage = 'activation'
      if (!activated) await generateTtsAudio({ text: SAMPLE_TEXT, voiceId: p.providerVoiceId, configId: config.id, activateVoice: true, brandId: task.brandId, actorId: payload.actorId })
      p.status = 'ready'; p.activatedAt = new Date().toISOString(); p.updatedAt = p.activatedAt; delete p.error; delete p.errorStage
      await checkpoint({ payload })
      await mutateProfiles(task.brandId, (profiles, defaultId) => {
        const current = profiles.find(v => v.id === p.id)
        if (current?.status === 'disabled') fail('VOICE_DISABLED')
        return { profiles: [...profiles.filter(v => v.id !== p.id), { ...p, label: current?.label || p.label, role: current?.role || p.role }], defaultId: profiles.some(v => v.id === defaultId && v.status === 'ready') ? defaultId : p.id }
      })
      // A successful task no longer needs the source recording.
      await deleteHuaweiObsObject(payload.sourceKey!).catch(() => undefined)
    } else {
      const selection = payload.selection!
      const result = (task.result || { segments: [] }) as { segments: any[] }
      for (let i = 0; i < payload.segments!.length; i++) {
        await assertSelection(task.brandId, selection)
        if (result.segments[i]) continue
        stage = `tts:${i}`
        const segment = payload.segments![i]
        const audio = await generateTtsAudio({ text: segment.text, voiceId: selection.providerVoiceId, configId: selection.configId, brandId: task.brandId, actorId: payload.actorId })
        const durationSec = await measureAudioDuration(audio.audio)
        const key = `brands/${task.brandId}/voices/generated/${task.id}/${i}.mp3`
        const uploaded = await uploadHuaweiObsObject({ key, body: audio.audio, contentType: 'audio/mpeg', private: true, cacheControl: 'private, no-store' })
        if (!uploaded.ok) throw new Error('Narration storage failed')
        result.segments[i] = { key, durationSec, shotDurationSec: segment.shotDurationSec, shotIndex: segment.shotIndex, shotId: segment.shotId }
        await checkpoint({ result })
      }
    }
    await checkpoint({ status: 'completed', error: null })
  } catch (error: any) {
    if (stage === 'clone' && error.remoteRejected) payload.cloneSubmitted = false
    const message = `${stage}: ${error.message || 'Voice task failed'}`
    await checkpoint({ status: 'failed', error: message, payload })
    if (task.kind === 'clone') await mutateProfiles(task.brandId, (profiles, defaultId) => {
      const p = profiles.find(p => p.id === payload.profile?.id)
      if (p && p.status !== 'disabled') { p.status = 'failed'; p.error = message; p.errorStage = stage }
      return { profiles, defaultId }
    })
  }
}

export function publicVoiceTask(task: any) {
  const result = task.result as { segments?: any[] } | null
  return { id: task.id, status: task.status, error: task.error, segments: result?.segments?.map(s => ({ ...s, key: undefined, url: getHuaweiObsPrivateUrl(s.key, 3600) })) || [] }
}
