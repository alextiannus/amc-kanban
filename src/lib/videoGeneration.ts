/**
 * Compatibility shim for the Kanban model-config routes.
 * Video execution moved to AMC-Content; Kanban keeps the route metadata visible.
 */
export async function validateVideoProviderConfig(input?: {
  provider?: string
  modelName?: string
  apiKey?: string
  baseUrl?: string | null
}): Promise<{ success: boolean; error?: string }> {
  if (!input?.provider?.trim()) return { success: false, error: 'Video provider is required.' }
  if (!input.modelName?.trim()) return { success: false, error: 'Video model name is required.' }
  if (!input.apiKey?.trim()) return { success: false, error: 'Video API key is required.' }
  return { success: true }
}
