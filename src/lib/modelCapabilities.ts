export const MODEL_CAPABILITIES = [
  'text_input', 'image_input', 'video_input', 'audio_input', 'structured_json', 'video_output',
  'audio_output', 'reference_video', 'reference_image', 'reference_audio',
] as const

export type ModelCapability = typeof MODEL_CAPABILITIES[number]

export const MODEL_TASK_REQUIREMENTS: Record<string, ModelCapability[]> = {
  reference_video_analysis: ['video_input', 'structured_json'],
  reference_audio_transcription: ['audio_input', 'structured_json'],
  reference_subtitle_ocr: ['image_input', 'structured_json'],
  selling_point_extraction: ['text_input', 'structured_json'],
  script_generation: ['text_input', 'structured_json'],
  storyboard_generation: ['text_input', 'structured_json'],
  video_prompt_generation: ['text_input', 'structured_json'],
  video_generation: ['video_output'],
  tts_generation: ['audio_output'],
  creative_quality_review: ['text_input', 'structured_json'],
}

export function normalizeCapabilities(value: unknown): ModelCapability[] {
  if (!Array.isArray(value)) return []
  const known = new Set<string>(MODEL_CAPABILITIES)
  return Array.from(new Set(value.map((item) => String(item).trim().toLowerCase().replace(/[\s-]+/g, '_')).filter((item): item is ModelCapability => known.has(item))))
}

export function inferExecutionCapabilities(provider: string, taskTags: string[], explicit: ModelCapability[]): ModelCapability[] {
  if (explicit.length) return explicit
  const normalizedProvider = provider.trim().toLowerCase()
  const tags = new Set(taskTags)
  if (['seedance', 'fal', 'kieai', 'volcengine'].includes(normalizedProvider) || tags.has('video_generation')) {
    return ['video_output', 'reference_image', 'reference_video', 'reference_audio']
  }
  if (tags.has('tts') || tags.has('tts_generation')) return ['audio_output', 'text_input']
  return ['text_input', 'structured_json']
}

export function unsupportedTasks(taskTags: string[], capabilities: ModelCapability[]): string[] {
  return taskTags.filter((task) => {
    const required = MODEL_TASK_REQUIREMENTS[task]
    return required && !required.every((capability) => capabilities.includes(capability))
  })
}

export function supportsTask(profile: { taskTags: string[]; capabilities: string[]; isEnabled: boolean }, task: string, extra: ModelCapability[] = []): boolean {
  if (!profile.isEnabled || !profile.taskTags.includes(task)) return false
  const required = [...(MODEL_TASK_REQUIREMENTS[task] || []), ...extra]
  return required.every((capability) => profile.capabilities.includes(capability))
}

export function incompatibleFallbackIds(
  taskTags: string[],
  fallbacks: Array<{ id: string; provider?: string; taskTags: string[]; capabilities: string[] }>,
): string[] {
  return fallbacks.filter((fallback) => taskTags.some((task) => {
    if (!fallback.taskTags.includes(task)) return true
    const required = MODEL_TASK_REQUIREMENTS[task] || []
    const capabilities = inferExecutionCapabilities(
      fallback.provider || '',
      fallback.taskTags,
      normalizeCapabilities(fallback.capabilities),
    )
    return required.some((capability) => !capabilities.includes(capability))
  })).map((fallback) => fallback.id)
}
