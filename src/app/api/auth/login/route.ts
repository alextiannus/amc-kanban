import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { encrypt } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    const bootstrapAdminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim()
    const bootstrapAdminPassword = process.env.BOOTSTRAP_ADMIN_INITIAL_PASSWORD

    let user = await prisma.user.findUnique({ where: { email } })

    const userCount = await prisma.user.count()
    if (userCount === 0) {
      if (!bootstrapAdminEmail || !bootstrapAdminPassword) {
        console.error('Bootstrap admin configuration is missing')
        return NextResponse.json(
          { error: 'System is not initialized. Please set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_INITIAL_PASSWORD.' },
          { status: 500 }
        )
      }

      const hashedPassword = await bcrypt.hash(bootstrapAdminPassword, 12)
      await prisma.user.create({
        data: {
          email: bootstrapAdminEmail,
          password: hashedPassword,
          role: 'ADMIN',
        }
      })
      // Refetch the user attempting to log in after potential initialization
      user = await prisma.user.findUnique({ where: { email } })
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    if (bootstrapAdminEmail && user.email === bootstrapAdminEmail && user.role !== 'ADMIN') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' }
      })
    }

    const sessionData = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    }
    const encryptedSession = await encrypt(sessionData)
    const cookieStore = await cookies()
    cookieStore.set('session', encryptedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    })

    return NextResponse.json({ success: true, user: sessionData.user })
  } catch (error) {
    console.error('Login error', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
