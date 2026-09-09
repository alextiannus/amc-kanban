import { listBrandVoiceProfiles } from '@/lib/brandVoiceProfiles'
import { generateTtsAudio, getActiveMiniMaxTtsConfigs } from '@/lib/ttsGeneration'
import { miniMaxVoiceEndpoint } from '@/lib/miniMaxEndpoints'

export type MerchantVoiceSelection = { id: string; brandId: string; label: string; providerVoiceId: string; configId: string }
const fail = (message: string, status = 409): never => { throw Object.assign(new Error(message), { status }) }

export async function resolveContentBrandVoice(brandId: string, id: string, expected?: MerchantVoiceSelection) {
  const { profiles } = await listBrandVoiceProfiles(brandId)
  const profile = profiles.find(p => p.id === id)
  if (!profile || profile.brandId !== brandId) return fail('VOICE_NOT_FOUND: Voice is outside this brand or does not exist', 404)
  if (profile.status !== 'ready' || !profile.consent?.confirmedByUserId) return fail('VOICE_UNAVAILABLE: Voice is not ready or consent is missing')
  if (!profile.configId) return fail('VOICE_REENROLL_REQUIRED: Voice has no original configuration')
  const config = (await getActiveMiniMaxTtsConfigs()).find(c => c.id === profile.configId)
  if (!config?.apiKey?.trim()) return fail('VOICE_CONFIG_UNAVAILABLE: Original MiniMax configuration is unavailable')
  miniMaxVoiceEndpoint(config.baseUrl, '/v1/t2a_v2')
  const selection: MerchantVoiceSelection = { id: profile.id, brandId, label: profile.label, providerVoiceId: profile.providerVoiceId, configId: profile.configId }
  if (expected && ['id', 'brandId', 'providerVoiceId', 'configId'].some(key => expected[key as keyof MerchantVoiceSelection] !== selection[key as keyof MerchantVoiceSelection])) {
    return fail('VOICE_SELECTION_CHANGED: Saved voice binding has changed; select the voice again')
  }
  return selection
}

export async function listContentBrandVoices(brandId: string) {
  const { profiles, defaultBrandVoiceProfileId } = await listBrandVoiceProfiles(brandId)
  const items = await Promise.all(profiles.filter(p => p.status !== 'disabled').map(async p => {
    let error: string | undefined
    try { await resolveContentBrandVoice(brandId, p.id) } catch (e) { error = e instanceof Error ? e.message : 'Voice unavailable' }
    return { id: p.id, name: p.label, role: p.role, status: p.status, usable: !error, error,
      isDefault: p.id === defaultBrandVoiceProfileId }
  }))
  return { items, defaultBrandVoiceProfileId }
}

export async function generateContentBrandVoice(input: {
  brandId: string; brandVoiceProfileId: string; text: string; actorId: string; actorRole: string;
  expected?: MerchantVoiceSelection; speed?: number; volume?: number; pitch?: number
}) {
  if (!input.text.trim() || input.text.length > 1200) return fail('Voice text must contain 1 to 1200 characters', 400)
  const selection = await resolveContentBrandVoice(input.brandId, input.brandVoiceProfileId, input.expected)
  const result = await generateTtsAudio({ ...input, voiceId: selection.providerVoiceId, configId: selection.configId })
  return { selection, audioBase64: result.audio.toString('base64'), contentType: result.contentType,
    durationSec: result.durationSec, provenance: result.provenance }
}
