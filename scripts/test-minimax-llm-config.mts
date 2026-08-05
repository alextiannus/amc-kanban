import assert from 'node:assert/strict'
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
}

run()
console.log('✅ MiniMax LLM config routing checks passed')
