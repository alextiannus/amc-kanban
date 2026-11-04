import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  if (process.env.NODE_ENV === 'production') return new NextResponse(null, { status: 404 })
  const user = (await getSession())?.user
  if (!user) return new NextResponse(null, { status: 401 })
  const { filename } = await params
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,240}\.(jpg|jpeg|png|webp|gif|mp4|mov|webm)$/.test(filename)) return new NextResponse(null, { status: 404 })
  const url = `/api/designer-media/${encodeURIComponent(filename)}`
  const asset = await prisma.mediaAsset.findFirst({ where: { url }, select: { brandId: true } })
  if (!asset || !await canSessionAccessBrandProject(asset.brandId, user.id, user.type || 'HUMAN', user.role)) return new NextResponse(null, { status: 404 })
  try {
    const extension = filename.split('.').pop()!
    const contentType = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' } as Record<string, string>)[extension]
    return new NextResponse(await readFile(path.join(process.cwd(), 'public', 'uploads', 'designer', filename)), { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, no-store' } })
  } catch { return new NextResponse(null, { status: 404 }) }
}
