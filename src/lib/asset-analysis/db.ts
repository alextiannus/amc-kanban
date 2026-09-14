import type { PrismaClient } from '@prisma/client'
import { prisma as sharedPrisma } from '@/lib/prisma'

// The legacy extension exports `any`; restore generated schema types locally.
export const prisma = sharedPrisma as PrismaClient
