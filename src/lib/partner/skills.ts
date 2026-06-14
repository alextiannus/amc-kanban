import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

export type PartnerSkillId = 'amc-integrations' | 'agent-instructions'

export async function readPartnerSkill(skillId: PartnerSkillId): Promise<string> {
  switch (skillId) {
    case 'amc-integrations':
    case 'agent-instructions':
      return readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), 'docs', 'AGENT_CONNECTIVITY.md'), 'utf-8')
  }
}

export function partnerMarkdownResponse(content: string, cacheControl = 'public, max-age=300') {
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': cacheControl,
    },
  })
}
