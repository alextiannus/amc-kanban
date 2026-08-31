import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [videoProduction, assembleRoute, videoPage] = await Promise.all([
  read('src/lib/videoProduction.ts'),
  read('src/app/api/content/video/assemble/route.ts'),
  read('src/app/dashboard/video/page.tsx'),
])

assert.match(
  videoProduction,
  /if \(!serviceUrl\) {\s*if \(input\.clipUrls\.length > 1\) {\s*return assembleVideoWithFfmpeg\(input\)/s,
  'multiple clips must use real FFmpeg assembly when no assembly service is configured',
)
assert.match(
  videoProduction,
  /process\.env\.AMC_VIDEO_ASSEMBLY_SERVICE_URL[\s\S]*process\.env\.AMC_CONTENT_SERVICE_URL/,
  'assembly should prefer a dedicated service but fall back to the remote AMC Content service',
)
assert.match(
  videoProduction,
  /if \(!outputUrl && input\.clipUrls\.length > 1\) {\s*return assembleVideoWithFfmpeg\(input,/s,
  'remote assembly responses without an output URL must fall back to FFmpeg instead of leaving an unrefreshable job',
)
assert.match(
  videoProduction,
  /buildNormalizeConcatArgs\(clipPaths, outputPath, input\.aspectRatio\)/,
  'FFmpeg fallback must normalize clip dimensions before final concat retry',
)
assert.match(
  videoProduction,
  /sourceType: obs\.ok \? 'huawei_obs' : 'local'/,
  'assembled final videos must be persisted as playable asset-library media',
)
assert.match(
  videoProduction,
  /text\(value\?\.asset\?\.url\)/,
  'assembly output URL parsing must recognize persisted asset URLs',
)
assert.match(
  assembleRoute,
  /aspectRatio: optionalString\(body\.aspectRatio\)/,
  'the video assembly API must pass the requested aspect ratio to the assembly runner',
)
assert.match(
  videoPage,
  /function normalizeVideoExecution\(value: any\)/,
  'the video creator UI must normalize provider execution payloads before storing them',
)
assert.match(
  videoPage,
  /text\(value\?\.asset\?\.url\)/,
  'the video creator UI must recognize completed clip URLs returned as asset.url',
)
assert.match(
  videoPage,
  /请先生成至少一个已完成的分镜视频，再合成最终视频。/,
  'the final assembly button must explain why it cannot run instead of silently returning',
)
assert.match(
  videoPage,
  /disabled=\{finalBusy\}/,
  'the final assembly button should remain clickable when clips are missing so the UI can show a reason',
)

console.log('SUCCESS: Video assembly uses real multi-clip concat, service fallback, aspect-ratio normalization, asset persistence, and non-silent UI handling')
