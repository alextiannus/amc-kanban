/**
 * Debug script: Check PostFast Google account sync for specific brand
 * Usage: npx ts-node --esm scripts/debug-google-account.mts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('🔍 Fetching brand details...\n')
    
    // Get all brands with their accounts
    const allBrands = await prisma.brand.findMany({
      include: {
        accounts: {
          orderBy: { platformId: 'asc' }
        }
      }
    })
    
    console.log(`Total brands: ${allBrands.length}\n`)
    
    allBrands.forEach(brand => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`📌 Brand: ${brand.name}`)
      console.log(`   ID: ${brand.id}`)
      console.log(`   PostFast configured: ${brand.postfastApiKey ? '✅ YES' : '❌ NO'}`)
      
      if (brand.accounts.length === 0) {
        console.log(`   Social Accounts: (none)`)
      } else {
        console.log(`   Social Accounts (${brand.accounts.length}):`)
        brand.accounts.forEach(acc => {
          const platformEmoji = acc.platformId === 'google' ? '⭐' : '📱'
          console.log(`     ${platformEmoji} [${acc.platformId}] ${acc.handle}`)
          console.log(`        displayName: ${acc.displayName}`)
          console.log(`        followers: ${acc.followerCount ?? 'N/A'} (Δ ${acc.followerDelta ?? 'N/A'})`)
          console.log(`        rating: ${acc.ratingScore ?? 'N/A'}`)
          console.log(`        snapshot: ${acc.snapshotAt ? new Date(acc.snapshotAt).toLocaleString() : 'N/A'}`)
        })
      }
      
      // Check for Google accounts specifically
      const googleAccounts = brand.accounts.filter(a => a.platformId === 'google')
      if (brand.postfastApiKey && googleAccounts.length === 0) {
        console.log(`   ⚠️  PostFast is configured but NO Google accounts found`)
      }
      console.log()
    })

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
