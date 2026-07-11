import { prisma } from '../src/lib/prisma'
import { getLarkTenantToken, LARK_BASE } from '../src/lib/integrations/lark'

const TARGET_FOLDER = 'OFPofcAeslii1odZkzTldRFrgpY'

async function main() {
  console.log('=== Lark Integration Check ===')
  
  // 1. Fetch brands with Lark credentials
  const brands = await prisma.brand.findMany({
    where: {
      larkAppId: { not: null },
      larkAppSecret: { not: null }
    },
    select: {
      id: true,
      name: true,
      larkAppId: true,
      larkAppSecret: true,
      larkDriveFolderId: true,
      larkParentFolderToken: true
    }
  })

  console.log(`Found ${brands.length} brand(s) with Lark credentials configured in database.`)

  if (brands.length === 0) {
    console.log('No brands have Lark App ID & Secret configured in the database yet.')
    return
  }

  for (const brand of brands) {
    console.log(`\nChecking Brand: "${brand.name}" (ID: ${brand.id})`)
    console.log(`Lark App ID: ${brand.larkAppId}`)
    
    // 2. Fetch tenant access token
    console.log('Fetching Lark tenant access token...')
    const token = await getLarkTenantToken(brand.larkAppId!, brand.larkAppSecret!)
    if (!token) {
      console.error('❌ Failed to obtain Lark access token. Please check App ID and App Secret.')
      continue
    }
    console.log('✅ Successfully obtained Lark access token.')

    // 3. Attempt to fetch details of the target folder
    console.log(`Attempting to access folder: ${TARGET_FOLDER}...`)
    try {
      // Using the Drive API to get folder metadata: /open-apis/drive/v1/files/:file_token/metadata
      const res = await fetch(`${LARK_BASE}/drive/v1/files/${TARGET_FOLDER}/metadata`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await res.json()
      if (res.ok && data.code === 0) {
        console.log('✅ Access Successful!')
        console.log('Folder Metadata:', JSON.stringify(data.data, null, 2))
      } else {
        console.log(`❌ Access Failed. Lark Code: ${data.code}, Message: ${data.msg}`)
        
        // Also try legacy explorer v2 API just in case
        console.log('Trying fallback folder children/meta endpoint...')
        const fallbackRes = await fetch(`${LARK_BASE}/drive/explorer/v2/folder/${TARGET_FOLDER}/meta`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        const fallbackData = await fallbackRes.json()
        console.log(`Fallback Code: ${fallbackData.code}, Message: ${fallbackData.msg}`)
      }
    } catch (e: any) {
      console.error('❌ Network/Request error:', e.message)
    }
  }
}

main()
  .catch(e => {
    console.error('Script error:', e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
