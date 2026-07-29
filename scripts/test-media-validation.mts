import assert from 'node:assert/strict'
import {
  inspectMediaBuffer,
  MediaInspectionUnavailableError,
  MediaValidationError,
  type MediaTechnicalMetadata,
  validatePlatformMedia,
  validateUploadMedia,
} from '../src/lib/mediaValidation.ts'
import { shouldValidateMediaForDraftDelivery } from '../src/lib/mediaPublishPolicy.ts'

const failingCashmereImage: MediaTechnicalMetadata = {
  kind: 'image',
  mimeType: 'image/jpeg',
  sizeBytes: 23_191_745,
  width: 5_464,
  height: 8_192,
  format: 'jpeg',
}

assert.equal(shouldValidateMediaForDraftDelivery({
  autoPilot: false,
  forcePublish: false,
  accountHandle: 'configured',
}), false)
assert.equal(shouldValidateMediaForDraftDelivery({
  autoPilot: true,
  accountHandle: 'unconfigured',
}), false)
assert.equal(shouldValidateMediaForDraftDelivery({
  autoPilot: false,
  forcePublish: true,
  accountHandle: 'configured',
}), true)

const instagramIssues = validatePlatformMedia('instagram', [{
  assetId: 'cms5sxic600g7qo29p1sile6j',
  filename: '2024-07-27 114533.jpg',
  metadata: failingCashmereImage,
}])
assert(instagramIssues.some((issue) => issue.field === 'sizeBytes'))
assert(instagramIssues.some((issue) => issue.field === 'width'))
assert(instagramIssues.some((issue) => issue.field === 'aspectRatio'))

const tiktokIssues = validatePlatformMedia('tiktok', [{
  assetId: 'cms5sxic600g7qo29p1sile6j',
  filename: '2024-07-27 114533.jpg',
  metadata: failingCashmereImage,
}])
assert(tiktokIssues.some((issue) => issue.field === 'sizeBytes'))
assert(tiktokIssues.some((issue) => issue.field === 'dimensions'))
assert.equal(validatePlatformMedia('instagram', [])[0]?.field, 'mediaCount')

const validInstagramReel: MediaTechnicalMetadata = {
  kind: 'video',
  mimeType: 'video/mp4',
  sizeBytes: 20_000_000,
  width: 1_080,
  height: 1_920,
  container: 'mov,mp4,m4a,3gp,3g2,mj2',
  videoCodec: 'h264',
  audioCodec: 'aac',
  frameRate: 30,
  durationSeconds: 30,
  videoBitrate: 8_000_000,
  audioSampleRate: 48_000,
}
assert.deepEqual(validatePlatformMedia('instagram', [{
  filename: 'reel.mp4',
  metadata: validInstagramReel,
}]), [])

const mixedIssues = validatePlatformMedia('instagram', [
  { filename: 'photo.jpg', metadata: { ...failingCashmereImage, sizeBytes: 1_000_000, width: 1_080, height: 1_350 } },
  { filename: 'reel.mp4', metadata: validInstagramReel },
])
assert(mixedIssues.every((issue) => issue.field === 'mediaMix'))

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const inspected = await inspectMediaBuffer(png, { filename: 'tiny.png', mimeType: 'application/octet-stream' })
assert.equal(inspected.kind, 'image')
assert.equal(inspected.mimeType, 'image/png')
assert.equal(inspected.width, 1)
assert.equal(inspected.height, 1)
assert.deepEqual(validateUploadMedia(inspected, { filename: 'tiny.png' }), [])

const expiredDeadlineStartedAt = Date.now()
await assert.rejects(
  () => inspectMediaBuffer(png, {
    filename: 'tiny.png',
    mimeType: 'image/png',
    deadlineAt: Date.now() - 1,
  }),
  (error: unknown) => error instanceof MediaInspectionUnavailableError,
)
assert(Date.now() - expiredDeadlineStartedAt < 1_000)

const genericIssues = validatePlatformMedia('facebook', [{
  filename: 'oversized.jpg',
  metadata: { ...failingCashmereImage },
}])
assert(genericIssues.some((issue) => issue.field === 'sizeBytes'))

const wasmStartedAt = Date.now()
await assert.rejects(
  () => inspectMediaBuffer(Buffer.from('not-a-real-video'), {
    filename: 'broken.mp4',
    mimeType: 'video/mp4',
  }),
  (error: unknown) => error instanceof MediaValidationError &&
    error.issues.some((issue) => issue.field === 'file'),
)
assert(Date.now() - wasmStartedAt < 20_000)

console.log('media validation tests passed')
