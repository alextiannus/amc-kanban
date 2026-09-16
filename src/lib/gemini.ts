import { callLLM } from './llmRouter.ts'



/**
 * Call the best available LLM to generate text.
 * Routes through LLMConfig by taskTag — no hardcoded provider.
 */
export async function generateText(prompt: string, maxTokens: number = 800): Promise<string | null> {
  const result = await callLLM('copywriting', prompt, maxTokens)
  if (result.text) return result.text
  console.warn('[generateText] All LLM providers failed:', result.error)
  return null
}
