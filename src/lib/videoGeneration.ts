/**
 * Compatibility shim for the Kanban model-config routes.
 * Video execution and provider validation are owned by AMC-Content.
 */
export async function validateVideoProviderConfig(_input?: unknown): Promise<{ success: false; error: string }> {
  return {
    success: false,
    error: 'Video provider configuration has moved to AMC-Content Content Lab.',
  }
}
