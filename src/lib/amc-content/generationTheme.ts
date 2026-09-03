type DraftInstructionSource = {
  caption?: string | null
  agentNote?: string | null
}

export function extractDraftContentInstruction(draft: DraftInstructionSource): string {
  const note = draft.agentNote || ''
  const match = note.match(/【AI 生成指令】([\s\S]*?)【\/AI 生成指令】/)
  if (match?.[1]?.trim()) return match[1].trim()

  const caption = draft.caption?.trim()
  if (caption && !caption.includes('【AI 正在创作中')) return caption
  return ''
}

export function resolveContentGenerationTheme(
  requestedTheme: unknown,
  draft: DraftInstructionSource,
): string {
  const explicitTheme = typeof requestedTheme === 'string' ? requestedTheme.trim() : ''
  return explicitTheme || extractDraftContentInstruction(draft)
}
