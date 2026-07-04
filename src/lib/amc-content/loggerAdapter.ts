import type { ContentLogger, GenerationLog } from 'amc-content'
import { prisma } from '../prisma.ts'

export function createPrismaContentLogger(userId: string): ContentLogger {
  return {
    async logGeneration(event: GenerationLog): Promise<void> {
      await prisma.copywriterLog.create({
        data: {
          brandId: event.brandId,
          userId,
          systemPrompt: JSON.stringify({
            engine: 'amc-content',
            promptVersion: event.promptVersion,
            provenance: event.provenance,
          }).slice(0, 20000),
          userInput: JSON.stringify(event.input).slice(0, 5000),
          rawOutput: JSON.stringify(event.output).slice(0, 20000),
          modelId: event.modelId,
          latencyMs: event.latencyMs ?? null,
          platform: event.platform,
          draftId: event.draftId ?? null,
          promptVersion: event.promptVersion,
        },
      })
    },
  }
}
