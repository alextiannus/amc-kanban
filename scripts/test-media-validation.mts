import assert from 'node:assert/strict'
import {
  blockingMediaIssues,
  inspectMediaBuffer,
  mediaValidationWarnings,
  MediaInspectionUnavailableError,
  MediaValidationError,
  normalizeVideoCodec,
  type MediaTechnicalMetadata,
  validatePlatformMedia,
  validateUploadMedia,
} from '../src/lib/mediaValidation.ts'
import {
  formatMediaWarnings,
  mediaValidationErrorMessage,
} from '../src/lib/mediaValidationClient.ts'
import { shouldValidateMediaForDraftDelivery } from '../src/lib/mediaPublishPolicy.ts'

assert.equal(normalizeVideoCodec('hvc1'), 'hevc')
assert.equal(normalizeVideoCodec('hev1'), 'hevc')
assert.equal(normalizeVideoCodec('HVC1'), 'hevc')

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
assert.equal(blockingMediaIssues(instagramIssues).length, 0)
assert.equal(mediaValidationWarnings(instagramIssues).length, instagramIssues.length)

const tiktokIssues = validatePlatformMedia('tiktok', [{
  assetId: 'cms5sxic600g7qo29p1sile6j',
  filename: '2024-07-27 114533.jpg',
  metadata: failingCashmereImage,
}])
assert(tiktokIssues.some((issue) => issue.field === 'sizeBytes'))
assert(tiktokIssues.some((issue) => issue.field === 'dimensions'))
assert.equal(blockingMediaIssues(tiktokIssues).length, 0)
assert.equal(mediaValidationWarnings(tiktokIssues).length, tiktokIssues.length)
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

const unusualInstagramVideo: MediaTechnicalMetadata = {
  ...validInstagramReel,
  width: 3_840,
  height: 2_160,
  videoCodec: 'av1',
  audioCodec: 'opus',
  frameRate: 120,
  durationSeconds: 1_200,
  videoBitrate: 40_000_000,
  audioSampleRate: 96_000,
}
const unusualVideoIssues = validatePlatformMedia('instagram', [{
  filename: 'unusual-reel.mp4',
  metadata: unusualInstagramVideo,
}])
assert(unusualVideoIssues.length >= 6)
assert.equal(blockingMediaIssues(unusualVideoIssues).length, 0)
assert.equal(mediaValidationWarnings(unusualVideoIssues).length, unusualVideoIssues.length)
const warningText = formatMediaWarnings({ warnings: unusualVideoIssues })
assert.match(warningText, /不会阻止提交/)
assert.match(warningText, /已继续提交/)
assert.match(warningText, /unusual-reel\.mp4/)

const mixedIssues = validatePlatformMedia('instagram', [
  { filename: 'photo.jpg', metadata: { ...failingCashmereImage, sizeBytes: 1_000_000, width: 1_080, height: 1_350 } },
  { filename: 'reel.mp4', metadata: validInstagramReel },
])
assert(mixedIssues.every((issue) => issue.field === 'mediaMix'))
assert.equal(blockingMediaIssues(mixedIssues).length, mixedIssues.length)
assert.match(
  mediaValidationErrorMessage({
    code: 'MEDIA_VALIDATION_FAILED',
    error: '素材不符合发布要求',
    issues: mixedIssues,
  }, '发布失败'),
  /mediaMix|图片|视频/,
)

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

const oversizedReadablePng = Buffer.concat([
  png,
  Buffer.alloc(10_000_001 - png.length),
])
await assert.rejects(
  () => inspectMediaBuffer(oversizedReadablePng, {
    filename: 'oversized-history.png',
    mimeType: 'image/png',
  }),
  (error: unknown) => error instanceof MediaValidationError &&
    error.issues.some((issue) => issue.field === 'sizeBytes'),
)
const inspectedHistoricalImage = await inspectMediaBuffer(oversizedReadablePng, {
  filename: 'oversized-history.png',
  mimeType: 'image/png',
  enforceUploadLimits: false,
})
assert.equal(inspectedHistoricalImage.kind, 'image')
assert.equal(inspectedHistoricalImage.sizeBytes, oversizedReadablePng.length)
assert(validateUploadMedia(inspectedHistoricalImage).some((issue) => issue.field === 'sizeBytes'))

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
assert.equal(blockingMediaIssues(genericIssues).length, 0)
assert.equal(mediaValidationWarnings(genericIssues).length, genericIssues.length)

const validGoogleImage = {
  ...failingCashmereImage,
  sizeBytes: 1_000_000,
  width: 1_200,
  height: 675,
}
assert.deepEqual(validatePlatformMedia('google', [{ filename: 'cover.jpg', metadata: validGoogleImage }]), [])
const googleMultipleImageIssues = validatePlatformMedia('google_business', [
  { filename: 'cover.jpg', metadata: validGoogleImage },
  { filename: 'content.jpg', metadata: validGoogleImage },
])
assert(googleMultipleImageIssues.some((issue) => issue.field === 'mediaCount'))
assert(blockingMediaIssues(googleMultipleImageIssues).length > 0)
const googleVideoIssues = validatePlatformMedia('google', [{ filename: 'video.mp4', metadata: validInstagramReel }])
assert(googleVideoIssues.some((issue) => issue.field === 'mediaType'))
assert(blockingMediaIssues(googleVideoIssues).length > 0)

const platformImageFormats: Array<[string, string]> = [
  ['instagram', 'image/png'],
  ['instagram', 'image/webp'],
  ['instagram', 'image/gif'],
  ['tiktok', 'image/png'],
  ['tiktok', 'image/gif'],
]
for (const [platform, mimeType] of platformImageFormats) {
  const issues = validatePlatformMedia(platform, [{
    filename: `supported-${mimeType.split('/')[1]}`,
    metadata: {
      ...failingCashmereImage,
      mimeType,
      sizeBytes: 1_000_000,
      width: 1_080,
      height: 1_080,
    },
  }])
  assert(issues.some((issue) => issue.field === 'mimeType'))
  assert.equal(blockingMediaIssues(issues).length, 0)
}

const unsupportedImageIssues = validatePlatformMedia('instagram', [{
  filename: 'unsupported.bmp',
  metadata: {
    ...failingCashmereImage,
    mimeType: 'image/bmp',
    sizeBytes: 1_000_000,
    width: 1_080,
    height: 1_080,
  },
}])
assert(unsupportedImageIssues.some((issue) => issue.field === 'mimeType' && issue.severity !== 'warning'))
assert(blockingMediaIssues(unsupportedImageIssues).length > 0)

const tooManyImages = validatePlatformMedia('instagram', Array.from({ length: 11 }, (_, index) => ({
  filename: `photo-${index + 1}.jpg`,
  metadata: {
    ...failingCashmereImage,
    sizeBytes: 1_000_000,
    width: 1_080,
    height: 1_350,
  },
})))
assert(tooManyImages.some((issue) => issue.field === 'mediaCount'))
assert(blockingMediaIssues(tooManyImages).length > 0)

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
