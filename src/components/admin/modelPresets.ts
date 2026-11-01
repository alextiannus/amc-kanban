import type { ModelDefinition } from '../../lib/model-management/types'

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
