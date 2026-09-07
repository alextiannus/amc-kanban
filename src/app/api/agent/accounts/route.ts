import { saveSocialAccount, SocialAccountBindingError } from '@/lib/socialAccountBinding'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest, requireCapability } from '@/lib/auth-v2'

async function getAgent(request: Request) {
  const principal = await authenticateRequest(request)
  return principal
}

/**
 * PATCH /api/agent/accounts
 *
 * Upserts a social account for a brand by (brandId + platformId + handle).
 * Creates if not exists, updates if exists.
 *
 * Body:
 *   brandId       string  required
 *   platformId    string  required  e.g. "instagram" | "tiktok" | "xiaohongshu" | "google" ...
 *   handle        string  required  e.g. "@yushanfang_nyc"
 *   displayName   string  optional
 *   profileUrl    string  optional  public profile URL
 *   loginUsername string  optional  account login email / username
 *   loginPassword string  optional  account password
 *   followerCount number  optional
 *   ratingScore   number  optional  (for Google Business etc.)
 *
 * Returns: { ok: true, account: { id, platformId, handle, profileUrl, loginUsername } }
 */
export async function PATCH(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { brandId, platformId, handle, ...rest } = body

  if (!brandId || !platformId || !handle) {
    return NextResponse.json({ error: 'brandId, platformId, handle are required' }, { status: 400 })
  }

  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  try {
    await requireCapability(agent, 'brand.update', { brandId })
  } catch {
    return NextResponse.json({ error: 'Brand not linked to this agent' }, { status: 403 })
  }

  const opt = (v: unknown) => (v === undefined ? undefined : v === '' ? null : v)

  let saved
  try {
    saved = await saveSocialAccount(brandId, {
      platformId, handle: handle.trim(),
      ...(rest.displayName !== undefined && { displayName: opt(rest.displayName) }),
      ...(rest.profileUrl !== undefined && { profileUrl: opt(rest.profileUrl) }),
      ...(rest.loginUsername !== undefined && { loginUsername: opt(rest.loginUsername) }),
      ...(rest.loginPassword !== undefined && { loginPassword: opt(rest.loginPassword) }),
      ...(rest.followerCount != null && { followerCount: Number(rest.followerCount) }),
      ...(rest.ratingScore != null && { ratingScore: Number(rest.ratingScore) }),
    })
  } catch (error) {
    if (error instanceof SocialAccountBindingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    throw error
  }
  const { id, displayName, profileUrl, loginUsername, followerCount, ratingScore } = saved
  const account = { id, platformId: saved.platformId, handle: saved.handle, displayName, profileUrl, loginUsername, followerCount, ratingScore }

  return NextResponse.json({ ok: true, account })
}
