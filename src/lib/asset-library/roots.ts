export const MATERIAL_ROOTS = [
  { id: 'ORIGINAL', materialClass: 'ORIGINAL', name: '原始素材', description: '存放实拍原图、原视频，供视频创作默认选材使用。' },
  { id: 'AI', materialClass: 'AI', name: 'AI制作成果', description: '存放 AI 生成的图片、视频片段和完整成片。' },
  { id: 'MANUAL', materialClass: 'MANUAL', name: '人工加工', description: '存放外部人工剪辑、修图、设计后上传的图片、海报或视频。' },
] as const
export type MaterialRoot = { id: string; materialClass: string; name: string; description: string }
export const STATUS_FOLDER_KEYS = ['needs_review', 'not_recommended']
