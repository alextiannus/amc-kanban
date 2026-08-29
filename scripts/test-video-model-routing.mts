import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  inferExecutionCapabilities,
  incompatibleFallbackIds,
  normalizeCapabilities,
  unsupportedTasks,
} from '../src/lib/modelCapabilities.ts'

const seedance = inferExecutionCapabilities('seedance', ['video_generation'], [])
assert.ok(seedance.includes('video_output'))
assert.ok(seedance.includes('reference_video'))
assert.ok(!seedance.includes('video_input'), 'video output providers must not be inferred as analysis models')
assert.deepEqual(unsupportedTasks(['reference_video_analysis'], seedance), ['reference_video_analysis'])

const gemini = normalizeCapabilities(['video_input', 'structured_json', 'text_input'])
assert.deepEqual(unsupportedTasks(['reference_video_analysis'], gemini), [])

const tts = inferExecutionCapabilities('minimax', ['tts_generation'], [])
assert.ok(tts.includes('audio_output'))
assert.deepEqual(unsupportedTasks(['tts_generation'], tts), [])

const incompatible = incompatibleFallbackIds(['video_generation'], [
  { id: 'video-ok', provider: 'fal', taskTags: ['video_generation'], capabilities: [] },
  { id: 'text-only', provider: 'openai', taskTags: ['video_generation'], capabilities: ['text_input', 'structured_json'] },
])
assert.deepEqual(incompatible, ['text-only'])

const localVideoExecutor = readFileSync(new URL('../src/lib/videoGeneration.ts', import.meta.url), 'utf8')
const createRoute = readFileSync(new URL('../src/app/api/content/video/create/route.ts', import.meta.url), 'utf8')
const statusRoute = readFileSync(new URL('../src/app/api/content/video/status/route.ts', import.meta.url), 'utf8')
const providerRunner = readFileSync(new URL('../src/lib/videoProduction.ts', import.meta.url), 'utf8')
const jobsRoute = readFileSync(new URL('../src/app/api/content/video/jobs/route.ts', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
assert.ok(localVideoExecutor.includes('moved to AMC-Content'))
assert.ok(!createRoute.includes('generateVideoFromPlan'))
assert.ok(createRoute.includes('normalizeCreatorType(body.creatorType)'))
assert.ok(createRoute.includes('contentCreatorAliases'))
assert.ok(createRoute.includes("'event_offer'"))
assert.ok(createRoute.includes('submitVideoGeneration'))
assert.ok(createRoute.includes('if (suppliedPlan)'))
assert.ok(statusRoute.includes('refreshVideoGeneration'))
assert.ok(providerRunner.includes('submitMiniMax'))
assert.ok(providerRunner.includes('retrieveMiniMaxFileUrl'))
assert.ok(providerRunner.includes('/api/v1/jobs/createTask'))
assert.ok(providerRunner.includes('first_frame_url'))
assert.ok(providerRunner.includes('reference_image_urls'))
assert.ok(providerRunner.includes('marketTaskId'))
assert.ok(providerRunner.includes('value?.data?.taskId'))
assert.ok(jobsRoute.includes('videoProductionJob.upsert'))
assert.ok(schema.includes('model VideoProductionJob'))
assert.ok(!schema.includes('model VideoPerformanceSnapshot'))

console.log('SUCCESS: Kanban plans with AMC-Content, executes configured video providers, and persists video jobs')
