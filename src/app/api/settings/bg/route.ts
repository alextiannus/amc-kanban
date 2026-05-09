import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Ensure the uploads directory exists
    const uploadDir = path.join(process.cwd(), 'public/uploads')
    try {
      await fs.access(uploadDir)
    } catch {
      await fs.mkdir(uploadDir, { recursive: true })
    }

    // Save with user ID and timestamp to break cache
    const fileName = `${session.user.id}-bg-${Date.now()}.jpg`
    const filePath = path.join(uploadDir, fileName)

    await fs.writeFile(filePath, buffer)

    return NextResponse.json({ url: `/uploads/${fileName}` })
  } catch (error) {
    console.error('Error uploading background:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
