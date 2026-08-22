import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isMiniMaxTtsConfig } from '../src/lib/minimaxTtsValidation.ts'

function run() {
  assert.equal(
    isMiniMaxTtsConfig('minimax', 'speech-2.8-hd', null, ['tts']),
    true,
    'MiniMax with tts tag should use MiniMax TTS validation',
  )

  assert.equal(
    isMiniMaxTtsConfig('minimax', 'speech-2.8-hd', null, []),
    true,
    'MiniMax speech models should use MiniMax TTS validation even without tags',
  )

  assert.equal(
    isMiniMaxTtsConfig('minimax', 'abab6.5-chat', 'https://api.minimaxi.com/v1/t2a_v2', []),
    true,
    'MiniMax t2a endpoints should use MiniMax TTS validation',
  )

  assert.equal(
    isMiniMaxTtsConfig('google', 'gemini-2.0-flash', null, ['tts']),
    false,
    'Gemini should never be treated as MiniMax TTS',
  )

  assert.equal(
    isMiniMaxTtsConfig('minimax', 'abab6.5-chat', 'https://api.minimaxi.chat/v1', ['companion']),
    false,
    'MiniMax chat configs should stay on the chat validation path',
  )

  const collectionRoute = readFileSync(new URL('../src/app/api/admin/llm-configs/route.ts', import.meta.url), 'utf8')
  const itemRoute = readFileSync(new URL('../src/app/api/admin/llm-configs/[id]/route.ts', import.meta.url), 'utf8')
  const systemTab = readFileSync(new URL('../src/components/admin/SystemTab.tsx', import.meta.url), 'utf8')

  assert.ok(!collectionRoute.includes('Video and TTS profiles are owned by AMC-Content'), 'collection route should not reject restored TTS/video profiles')
  assert.ok(!itemRoute.includes('Video and TTS profiles are owned by AMC-Content'), 'item route should not reject restored TTS/video profiles')
  assert.ok(!collectionRoute.includes(".filter((c: any) => !isVideoModelConfig"), 'GET should return restored TTS/video model profiles')
  assert.ok(systemTab.includes('<option value="minimax">MiniMax TTS / Chat</option>'), 'MiniMax provider should be selectable in admin UI')
  assert.ok(systemTab.includes('这里显示 Kanban 的文本 LLM、MiniMax TTS 与视频模型路由'), 'admin UI should explain restored model visibility')
}

run()
console.log('✅ MiniMax LLM config routing checks passed')
