import { NextResponse } from 'next/server'
import { partnerMarkdownResponse, readPartnerSkill } from '@/lib/partner/skills'

export async function GET() {
  try {
    const content = await readPartnerSkill('amc-integrations')
    return partnerMarkdownResponse(content)
  } catch (error) {
    console.error('Error serving integrations skill:', error)
    return NextResponse.json({ error: 'Failed to load integrations skill' }, { status: 500 })
  }
}
