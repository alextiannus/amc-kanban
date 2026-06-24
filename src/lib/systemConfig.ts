import { prisma } from './prisma.ts'

export async function ensureSystemConfig() {
  const existing = await prisma.systemConfig.findUnique({ where: { id: 'default' } })
  if (existing) return existing

  return prisma.systemConfig.create({
    data: {
      id: 'default',
      geminiApiKey: null,
    },
  })
}

export async function getGeminiApiKey(): Promise<string | null> {
  try {
    const config = await ensureSystemConfig()
    return config.geminiApiKey || process.env.GEMINI_API_KEY || null
  } catch (error) {
    console.error('[getGeminiApiKey Error]', error)
    return process.env.GEMINI_API_KEY || null
  }
}
