import { getCustomTemplates, addCustomTemplate, getRelevantKnowledge } from '../knowledgeBase.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CUSTOM_TEMPLATES_PATH = join(process.cwd(), 'src/agents/customTemplates.json')

async function runTest() {
  console.log('=== Starting Knowledge Base Templates Tests ===')

  // Backup current custom templates
  let backup = '[]'
  try {
    backup = readFileSync(CUSTOM_TEMPLATES_PATH, 'utf-8')
  } catch {}

  // Clean state
  writeFileSync(CUSTOM_TEMPLATES_PATH, '[]', 'utf-8')

  // Test 1: Submit a template
  const newTemplate = {
    industry: 'fitness',
    platform: 'instagram',
    template: '【TEST TEMPLATE】Welcome to [BrandName] Pilates!',
    idea: '【TEST IDEA】Focus on alignment check',
    videoScript: '【TEST SCRIPT】Reformer setup walk',
    prompt: '【TEST PROMPT】Keep it extremely professional'
  }

  const success = addCustomTemplate(newTemplate)
  console.log('Test 1 - Submit template success:', success)
  if (!success) throw new Error('Failed to submit template')

  // Test 2: Retrieve custom templates list
  const templates = getCustomTemplates()
  console.log('Test 2 - Retrieve custom templates count:', templates.length)
  if (templates.length !== 1) throw new Error('Expected 1 template in list')
  console.log('Template details:', JSON.stringify(templates[0], null, 2))

  // Test 3: Verify dynamic loading in copywriter pre-reads
  const fitnessInstagram = getRelevantKnowledge('fitness', 'instagram')
  console.log('Test 3 - Matched templates:', fitnessInstagram.templates)
  console.log('Test 3 - Matched ideas:', fitnessInstagram.ideas)
  console.log('Test 3 - Matched videoScripts:', fitnessInstagram.videoScripts)
  console.log('Test 3 - Matched prompts:', fitnessInstagram.prompts)

  const templateMatched = fitnessInstagram.templates.includes('【TEST TEMPLATE】Welcome to [BrandName] Pilates!')
  const ideaMatched = fitnessInstagram.ideas.includes('【TEST IDEA】Focus on alignment check')
  const scriptMatched = fitnessInstagram.videoScripts.includes('【TEST SCRIPT】Reformer setup walk')
  const promptMatched = fitnessInstagram.prompts.includes('【TEST PROMPT】Keep it extremely professional')

  if (!templateMatched || !ideaMatched || !scriptMatched || !promptMatched) {
    throw new Error('Verification failed: Custom entry was not loaded correctly')
  }

  console.log('[PASS] All template integration tests passed!')

  // Restore backup
  writeFileSync(CUSTOM_TEMPLATES_PATH, backup, 'utf-8')
  console.log('Restored customTemplates.json backup.')
}

runTest().catch((err) => {
  console.error('[FAIL] Test failed:', err)
  process.exit(1)
})
