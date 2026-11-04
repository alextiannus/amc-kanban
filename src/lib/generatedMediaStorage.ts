import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getHuaweiObsConfig, makeBrandAssetKey, uploadHuaweiObsObject } from './integrations/huaweiObs'

export async function storeGeneratedMedia(brandId: string, filename: string, buffer: Buffer, contentType: string) {
  if (getHuaweiObsConfig()) {
    const result = await uploadHuaweiObsObject({ key: makeBrandAssetKey({ brandId, folder: 'AI制作', filename }), body: buffer, contentType })
    if (!result.ok || !result.url) throw new Error(result.error || 'OBS upload failed')
    return result.url
  }
  if (process.env.NODE_ENV === 'production') throw new Error('OBS is required for generated assets')
  const safeName = `${randomUUID()}-${filename.replace(/[^a-zA-Z0-9_.-]/g, '_')}`
  const directory = path.join(process.cwd(), 'public', 'uploads', 'designer')
  await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, safeName), buffer)
  return `/api/designer-media/${encodeURIComponent(safeName)}`
}
