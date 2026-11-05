import type { ModelDefinition } from '../../lib/model-management/types'

export const QIANFAN_SEEDANCE_V2_PRESETS: ModelDefinition[] = ['S2.0', 'S2.0-Fast', 'S2.0-Mini', 'S2.5'].map(modelName => {
  const extended = modelName === 'S2.5'
  return {
    name: `百度千帆 Seedance ${modelName}${extended ? ' · V2' : ' V2'}`, modelName, isEnabled: true,
    qianfanApi: 'v2_fire',
    capabilities: ['video_generation'],
    inputCapabilities: ['video_output', 'reference_image', 'reference_video', 'native_audio'],
    timeoutMs: 120000, maxRetries: 0,
    videoConstraints: { resolutions: ['720p'], nativeAudio: true, minDurationSec: 4, maxDurationSec: extended ? 30 : 15,
      maxImages: extended ? 30 : 9, maxVideos: extended ? 10 : 3,
      maxVideoDurationSec: extended ? 30 : 15, maxVideoTotalDurationSec: extended ? 30 : 15 },
  }
})

export const RUNY_SEEDANCE_25_PRESET: ModelDefinition = {
  name: 'Runy Seedance 2.5', modelName: 'doubao-seedance-2-5', isEnabled: true,
  capabilities: ['video_generation'],
  inputCapabilities: ['video_output', 'reference_image', 'reference_video', 'reference_audio', 'native_audio'],
  timeoutMs: 120000, maxRetries: 0,
  videoConstraints: {
    resolutions: ['720p'], nativeAudio: true, minDurationSec: 4, maxDurationSec: 30,
    maxImages: 30, maxVideos: 10, maxVideoDurationSec: 30, maxVideoTotalDurationSec: 30,
  },
}
