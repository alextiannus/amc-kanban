import { PrismaClient } from '@prisma/client'
import { startCopywriterScheduler } from './copywriterScheduler.ts'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Start copywriter background scheduler on boot
startCopywriterScheduler()
