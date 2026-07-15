import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listPlatformProviders, listVerticalSpecs } from 'amc-content'

const PLATFORM_SKILL_DIR = join(process.cwd(), 'src', 'agents', 'skills', 'platforms')
const PROMPT_TUNING_PATH = join(process.cwd(), 'packages', 'amc-content', 'config', 'prompt-tuning.json')
const ALLOWED_PLATFORMS = new Set(listPlatformProviders().map((provider) => provider.platform))
const ALLOWED_VERTICALS = new Set(listVerticalSpecs().map((vertical) => vertical.vertical))
const ALLOWED_TASKS = new Set(['hook_generation', 'body_composition', 'quality_rewrite'])

type PromptTuningEntry = {
  platform?: string
  vertical?: string
  task?: string
  notes: string
  updatedAt?: string
  updatedBy?: string
}

type PromptTuningFile = {
  entries: PromptTuningEntry[]
}

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (auth) return auth

    return NextResponse.json({
      platformSkills: readPlatformSkills(),
      promptTuning: readPromptTuning(),
    })
  } catch (error) {
    console.error('[content-lab-skills] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load skill config' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (auth) return auth

    const session = await getSession()
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (body.kind === 'platformSkill') {
      const platform = typeof body.platform === 'string' ? body.platform : ''
      const markdown = typeof body.markdown === 'string' ? body.markdown : ''
      if (!ALLOWED_PLATFORMS.has(platform as any)) {
        return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 })
      }
      if (!markdown.trim()) {
        return NextResponse.json({ error: 'Skill markdown cannot be empty' }, { status: 400 })
      }

      const skillPath = platformSkillPath(platform)
      mkdirSync(join(PLATFORM_SKILL_DIR, platform), { recursive: true })
      writeFileSync(skillPath, markdown, 'utf-8')
      return NextResponse.json({ ok: true, platform, markdown })
    }

    if (body.kind === 'promptTuning') {
      const platform = normalizeScope(body.platform, ALLOWED_PLATFORMS)
      const vertical = normalizeScope(body.vertical, ALLOWED_VERTICALS)
      const task = normalizeScope(body.task, ALLOWED_TASKS)
      const notes = typeof body.notes === 'string' ? body.notes.trim() : ''

      if (!platform || !vertical || !task) {
        return NextResponse.json({ error: 'Invalid prompt tuning scope' }, { status: 400 })
      }

      const file = readPromptTuning()
      const nextEntry: PromptTuningEntry = {
        platform,
        vertical,
        task,
        notes,
        updatedAt: new Date().toISOString(),
        updatedBy: session?.user?.email || session?.user?.id || 'admin',
      }

      const entries = file.entries.filter((entry) =>
        entry.platform !== platform || entry.vertical !== vertical || entry.task !== task
      )
      if (notes) entries.push(nextEntry)

      const nextFile = { entries }
      ensurePromptTuningDir()
      writeFileSync(PROMPT_TUNING_PATH, `${JSON.stringify(nextFile, null, 2)}\n`, 'utf-8')

      return NextResponse.json({ ok: true, promptTuning: nextFile })
    }

    return NextResponse.json({ error: 'Unsupported update kind' }, { status: 400 })
  } catch (error) {
    console.error('[content-lab-skills] PATCH failed:', error)
    return NextResponse.json({ error: 'Failed to save skill config' }, { status: 500 })
  }
}

async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

function readPlatformSkills() {
  return Array.from(ALLOWED_PLATFORMS).map((platform) => {
    const skillPath = platformSkillPath(platform)
    const markdown = existsSync(skillPath) ? readFileSync(skillPath, 'utf-8') : ''
    return {
      platform,
      path: skillPath.replace(process.cwd(), ''),
      markdown,
    }
  })
}

function platformSkillPath(platform: string): string {
  return join(PLATFORM_SKILL_DIR, platform, 'SKILL.md')
}

function readPromptTuning(): PromptTuningFile {
  if (!existsSync(PROMPT_TUNING_PATH)) return { entries: [] }
  try {
    const parsed = JSON.parse(readFileSync(PROMPT_TUNING_PATH, 'utf-8')) as PromptTuningFile
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] }
  } catch {
    return { entries: [] }
  }
}

function ensurePromptTuningDir() {
  mkdirSync(join(process.cwd(), 'packages', 'amc-content', 'config'), { recursive: true })
}

function normalizeScope(value: unknown, allowed: Set<string>): string | null {
  if (value === '*' || value === undefined || value === null || value === '') return '*'
  if (typeof value === 'string' && allowed.has(value)) return value
  return null
}
