import { enqueueUploadedImage } from './asset-analysis/service'

// Compatibility entry point: enqueue durably instead of starting a detached model request.
export async function triggerDesignerAutoTag(assetId: string, batchKey?: string, language?: string): Promise<void> {
  await enqueueUploadedImage(assetId, batchKey, language)
}
