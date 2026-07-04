import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { PromptTuningQuery, PromptTuningRepository } from 'amc-content'

type PromptTuningEntry = {
  platform?: string
  vertical?: string
  task?: string
  notes: string
  updatedAt?: string
  updatedBy?: string
}

type PromptTuningFile = {
  entries?: PromptTuningEntry[]
}

const PROMPT_TUNING_PATH = join(process.cwd(), 'packages', 'amc-content', 'config', 'prompt-tuning.json')
const CACHE_TTL_MS = 5 * 60 * 1000
let cachedEntries: { expiresAt: number; entries: PromptTuningEntry[] } | null = null

export function createFilePromptTuningRepository(): PromptTuningRepository {
  return {
    async getTuningNotes(input: PromptTuningQuery): Promise<string | null> {
      const entries = readEntries()
      const matching = entries.filter((entry) =>
        matchesScope(entry.platform, input.platform)
        && matchesScope(entry.vertical, input.vertical)
        && matchesScope(entry.task, input.task)
        && entry.notes.trim().length > 0
      )

      if (matching.length === 0) return null
      return matching
        .map((entry) => entry.notes.trim())
        .join('\n\n')
    },
  }
}

function readEntries(): PromptTuningEntry[] {
  if (cachedEntries && cachedEntries.expiresAt > Date.now()) return cachedEntries.entries
  if (!existsSync(PROMPT_TUNING_PATH)) return []
  try {
    const parsed = JSON.parse(readFileSync(PROMPT_TUNING_PATH, 'utf-8')) as PromptTuningFile
    const entries = Array.isArray(parsed.entries) ? parsed.entries : []
    cachedEntries = { expiresAt: Date.now() + CACHE_TTL_MS, entries }
    return entries
  } catch (err) {
    console.error('[PromptTuning] Failed to read prompt tuning config:', err)
    return []
  }
}

function matchesScope(value: string | undefined, target: string): boolean {
  return !value || value === '*' || value === target
}
