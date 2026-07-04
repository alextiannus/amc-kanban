import assert from 'node:assert/strict'
import {
  createPlatformContent,
  getPlatformCopywriter,
  getPlatformProvider,
  listContentModelProfiles,
  listPlatformCopywriters,
  platformModelProfiles,
  runDeterministicGate,
  type ContentLogger,
  type GenerationLog,
  type KnowledgeEntry,
  type KnowledgeRepository,
  type ModelRequest,
  type ModelRouter,
  type PromptTuningRepository,
} from '../packages/amc-content/src/index.ts'

async function main() {
  testPlatformValidators()
  testPlatformCopywriterRegistry()
  testModelProfileRegistry()
  testDeterministicGate()
  await testPipelineRewriteAndNormalization()
  console.log('SUCCESS: amc-content tests passed')
}

function testPlatformCopywriterRegistry() {
  const copywriters = listPlatformCopywriters()
  assert.deepEqual(
    copywriters.map((copywriter) => copywriter.platform).sort(),
    ['facebook', 'google_business', 'instagram', 'tiktok', 'xiaohongshu'],
  )

  const google = getPlatformCopywriter('google_business')
  const prompt = google.buildBodyPrompt({
    input: {
      platform: 'google_business',
      brand: {
        id: 'brand-copywriter',
        name: 'Glow Studio',
        address: '1 Test Street',
      },
      brief: {
        industryVertical: 'beauty_wellness',
        theme: 'Hydration facial package',
      },
      adapters: {
        modelRouter: {
          async generateJson() {
            throw new Error('not used')
          },
        },
      },
    },
    hook: { text: 'Book a calm weekday facial in East Coast', category: 'seo', score: 0.9 },
    knowledge: [],
  })

  assert.match(prompt, /Google Business Copywriter/)
  assert.match(prompt, /Return an empty hashtags array/)
}

function testModelProfileRegistry() {
  const profiles = listContentModelProfiles()
  assert.ok(profiles.some((profile) => profile.id === 'local_social_balanced_v1'))
  assert.equal(platformModelProfiles.instagram.body_composition, 'local_social_balanced_v1')
  assert.equal(platformModelProfiles.google_business.body_composition, 'local_seo_precise_v1')
  assert.equal(platformModelProfiles.xiaohongshu.body_composition, 'local_social_creative_v1')
  assert.equal(platformModelProfiles.tiktok.body_composition, 'short_video_native_v1')
}

function testPlatformValidators() {
  const instagram = getPlatformProvider('instagram')
  const instagramIssues = instagram.validateText({
    caption: 'A simple local update.',
    hashtags: ['sg'],
  })
  assertIssue(instagramIssues, 'too_few_hashtags')

  const google = getPlatformProvider('google_business')
  const googleIssues = google.validateText({
    caption: 'This is a game-changer for your weekend.',
    hashtags: ['sglocal'],
  })
  assertIssue(googleIssues, 'hashtags_not_allowed')
  assertIssue(googleIssues, 'ai_tone_phrase')

  const facebook = getPlatformProvider('facebook')
  const facebookIssues = facebook.validateText({
    caption: 'Community update.',
    hashtags: ['one', 'two', 'three', 'four'],
  })
  assertIssue(facebookIssues, 'too_many_hashtags')
}

function testDeterministicGate() {
  const missingAddress = runDeterministicGate({
    platform: 'google_business',
    vertical: 'general_local_service',
    brand: { id: 'brand-1', name: 'Local Studio' },
    content: { caption: 'We have a new weekend update.', hashtags: [] },
  })
  assert.equal(missingAddress.passed, false)
  assertIssue(missingAddress.issues, 'missing_address')
  assertIssue(missingAddress.issues, 'missing_cta')

  const healthcare = runDeterministicGate({
    platform: 'facebook',
    vertical: 'healthcare_clinic',
    brand: { id: 'brand-2', name: 'Care Clinic' },
    content: { caption: 'Our treatment can cure your condition with guaranteed results.', hashtags: [] },
  })
  assert.equal(healthcare.passed, false)
  assertIssue(healthcare.issues, 'healthcare_claim')

  const instagramNoMedia = runDeterministicGate({
    platform: 'instagram',
    vertical: 'fitness_pilates',
    brand: { id: 'brand-3', name: 'Pilates Loft' },
    media: [],
    content: { caption: 'Book your trial class today.', hashtags: ['sgfitness', 'pilates', 'workout', 'sgfit', 'movement'] },
  })
  assertIssue(instagramNoMedia.issues, 'media_required')

  const googleVideo = runDeterministicGate({
    platform: 'google_business',
    vertical: 'events_entertainment',
    brand: { id: 'brand-4', name: 'Local Events', address: '1 Test Street' },
    media: [{ url: 'https://example.com/video.mp4', mimeType: 'video/mp4' }],
    content: { caption: 'Visit us this weekend for the event.', hashtags: [] },
  })
  assertIssue(googleVideo.issues, 'video_not_allowed')

  const googlePhone = runDeterministicGate({
    platform: 'google_business',
    vertical: 'beauty_wellness',
    brand: { id: 'brand-6', name: 'Glow Studio', address: '1 Test Street' },
    content: { caption: 'Visit Glow Studio at 1 Test Street or call +65 6123 4567 to book.', hashtags: [] },
  })
  assertIssue(googlePhone.issues, 'google_business_phone_stuffing')
}

async function testPipelineRewriteAndNormalization() {
  const calls: ModelRequest[] = []
  const knowledgeEntries: KnowledgeEntry[] = [{
    id: 'knowledge-1',
    level: 'brand',
    platform: 'google_business',
    vertical: 'beauty_wellness',
    category: 'example',
    title: 'Preferred booking CTA',
    content: 'Use a calm, direct booking CTA and mention the studio address.',
  }]

  const modelRouter: ModelRouter = {
    async generateJson<T>(input: ModelRequest): Promise<{ data: T; modelId?: string }> {
      calls.push(input)
      if (input.task === 'body_composition') {
        return {
          data: {
            caption: 'This game-changer helps you relax after work.',
            hashtags: ['#sgspa', 'sgspa', 'wellness'],
          } as T,
          modelId: 'fake-model',
        }
      }
      if (input.task === 'quality_rewrite') {
        return {
          data: {
            caption: 'Visit Glow Studio at 1 Test Street and book your calming facial appointment today.',
            hashtags: ['#shouldBeRemoved'],
          } as T,
          modelId: 'fake-model-rewrite',
        }
      }
      throw new Error(`Unexpected task: ${input.task}`)
    },
  }

  const knowledgeRepository: KnowledgeRepository = {
    async retrieve() {
      return knowledgeEntries
    },
  }

  const promptTuningRepository: PromptTuningRepository = {
    async getTuningNotes(input) {
      return input.task === 'body_composition'
        ? 'Use calm, concrete wording and avoid luxury hype.'
        : null
    },
  }

  const logs: GenerationLog[] = []
  const logger: ContentLogger = {
    async logGeneration(event: GenerationLog) {
      logs.push(event)
    },
  }

  const result = await createPlatformContent({
    platform: 'google_business',
    brand: {
      id: 'brand-5',
      name: 'Glow Studio',
      description: 'A calm facial studio in Singapore.',
      address: '1 Test Street',
      negativePrompts: ['cheap miracle'],
    },
    brief: {
      industryVertical: 'beauty_wellness',
      theme: 'Promote a relaxing weekday facial',
      customerIntent: 'booking',
      locationFocus: 'Tanjong Pagar',
      mustAvoid: ['cheap miracle'],
      localProof: ['Near Tanjong Pagar MRT'],
    },
    media: [{
      url: 'https://example.com/facial.jpg',
      mimeType: 'image/jpeg',
      tags: ['facial room', 'calm lighting'],
      category: 'studio',
      caption: 'Treatment room with warm lighting.',
    }],
    adapters: {
      modelRouter,
      knowledgeRepository,
      promptTuningRepository,
      logger,
    },
  })

  assert.equal(result.caption, 'Visit Glow Studio at 1 Test Street and book your calming facial appointment today.')
  assert.deepEqual(result.hashtags, [])
  assert.equal(result.quality.passed, true)
  assert.equal(result.hook.category, 'seo')
  assert.equal(result.hook.score, 0.75)
  assert.deepEqual(result.provenance.knowledgeEntryIds, ['knowledge-1'])
  assert.equal(result.provenance.modelProfileId, 'local_seo_precise_v1')
  assert.equal(logs.length, 1)
  assert.equal(calls.map((call) => call.task).join(','), 'body_composition,quality_rewrite')
  assert.deepEqual(calls.map((call) => call.modelProfileId), [
    'local_seo_precise_v1',
    'local_seo_precise_v1',
  ])
  assert.match(calls[0].prompt, /Media:/)
  assert.match(calls[0].prompt, /Vertical compliance:/)
  assert.match(calls[0].prompt, /Preferred booking CTA/)
  assert.match(calls[0].prompt, /ADMIN PROMPT TUNING NOTES/)
  assert.match(calls[0].prompt, /Use calm, concrete wording/)
}

function assertIssue(issues: Array<{ code: string }>, code: string) {
  assert.ok(
    issues.some((issue) => issue.code === code),
    `Expected issue ${code}; got ${issues.map((issue) => issue.code).join(', ')}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
