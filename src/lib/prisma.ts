import { PrismaClient } from '@prisma/client'
import { startCopywriterScheduler } from './copywriterScheduler.ts'
import { startResearcherScheduler } from './researcherScheduler.ts'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Start background schedulers on boot
startCopywriterScheduler()
startResearcherScheduler()
