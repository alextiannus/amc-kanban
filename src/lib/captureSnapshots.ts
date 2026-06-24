import { prisma } from './prisma.ts'
import fs from 'fs'
import path from 'path'

// Try importing playwright dynamically to avoid server-start load overhead if missing
async function getBrowser() {
  try {
    const { chromium } = await import('playwright')
    return await chromium.launch({ headless: true })
  } catch (e) {
    console.warn('Playwright chromium load failed.', e)
    return null
  }
}

async function loginInstagram(page: any, account: any): Promise<boolean> {
  const username = account.loginUsername
  const password = account.loginPassword

  if (!username || !password) {
    console.log(`[AMC Researcher] No credentials provided for Instagram account ${account.handle}`)
    return false
  }

  try {
    console.log(`[AMC Researcher] Attempting Instagram login for ${account.handle} with user ${username}...`)
    // Navigate to login page
    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle', timeout: 30000 })
    
    // Wait for input elements
    await page.waitForSelector('input[name="username"]', { timeout: 10000 })
    
    // Fill in credentials
    await page.fill('input[name="username"]', username)
    await page.fill('input[name="password"]', password)
    
    // Click submit
    await page.click('button[type="submit"]')
    
    // Wait for navigation or successful login indicator
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 })
    
    // Check if we logged in successfully (we shouldn't be on the login page anymore)
    const currentUrl = page.url()
    if (currentUrl.includes('/login') || currentUrl.includes('accounts/login')) {
      console.error(`[AMC Researcher] Instagram login failed: still on login page.`)
      return false
    }
    
    console.log(`[AMC Researcher] Instagram login succeeded for ${account.handle}`)
    return true
  } catch (err) {
    console.error(`[AMC Researcher] Instagram login exception for ${account.handle}:`, err)
    return false
  }
}

export async function captureAccountSnapshot(accountId: string): Promise<string> {
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    include: { brand: true },
  })

  if (!account) {
    throw new Error(`SocialAccount with ID ${accountId} not found`)
  }

  const dirPath = path.join(process.cwd(), 'public', 'snapshots', accountId)
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }

  const timestamp = Date.now()
  
  // Clean handle for platform URL construction
  let cleanHandle = account.handle
  if (cleanHandle.startsWith('@')) {
    cleanHandle = cleanHandle.slice(1)
  }

  let profileUrl = account.profileUrl
  if (!profileUrl) {
    const platform = account.platformId.toLowerCase()
    if (platform === 'instagram' || platform === 'ig') {
      profileUrl = `https://www.instagram.com/${cleanHandle}/`
    } else if (platform === 'tiktok') {
      profileUrl = `https://www.tiktok.com/@${cleanHandle}`
    } else if (platform === 'xiaohongshu' || platform === 'red') {
      profileUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(account.handle)}`
    } else if (platform === 'facebook' || platform === 'fb') {
      profileUrl = `https://www.facebook.com/${cleanHandle}/`
    } else if (platform === 'google' || platform === 'google_business') {
      const q = account.brand ? `${account.brand.name} ${account.brand.location || ''}` : account.handle
      profileUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`
    } else {
      profileUrl = `https://www.google.com/search?q=${encodeURIComponent(account.handle)}`
    }
  }

  let savedFilename = ''
  let screenshotCaptured = false

  const browser = await getBrowser()
  if (browser) {
    const context = await browser.newContext()
    const cookiesPath = path.join(dirPath, 'cookies.json')
    
    // Load cookies if exists
    if (fs.existsSync(cookiesPath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'))
        await context.addCookies(cookies)
        console.log(`[AMC Researcher] Loaded cookies from ${cookiesPath}`)
      } catch (e) {
        console.warn(`[AMC Researcher] Failed to load cookies:`, e)
      }
    }

    try {
      const page = await context.newPage()
      await page.setViewportSize({ width: 800, height: 1200 })
      
      // Navigate to profileUrl
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(2000)
      
      let currentUrl = page.url()
      let pageContent = await page.content()
      
      let isBlockedOrInvalid = false
      if (currentUrl.includes('/login') || currentUrl.includes('accounts/login') || currentUrl.includes('/signup')) {
        console.log(`[AMC Researcher] Detected login wall for ${account.handle} at ${currentUrl}`);
        isBlockedOrInvalid = true;
      } else if (pageContent.includes("Profile isn't available") || pageContent.includes("页面不存在") || pageContent.includes("page not found") || pageContent.includes("找不到页面")) {
        console.log(`[AMC Researcher] Detected invalid/missing profile page for ${account.handle}`);
        isBlockedOrInvalid = true;
      }

      // If blocked or redirected to login, try logging in
      if (isBlockedOrInvalid && account.loginUsername && account.loginPassword) {
        console.log(`[AMC Researcher] Blocked or redirected to login for ${account.handle}. Attempting credentials-based login...`)
        const loggedIn = await loginInstagram(page, account)
        if (loggedIn) {
          // Save new cookies
          const cookies = await context.cookies()
          fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2))
          console.log(`[AMC Researcher] Saved new cookies to ${cookiesPath}`)
          
          // Re-navigate to profile
          await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
          await page.waitForTimeout(2000)
          
          // Re-check
          currentUrl = page.url()
          pageContent = await page.content()
          isBlockedOrInvalid = currentUrl.includes('/login') || currentUrl.includes('accounts/login') || 
                               currentUrl.includes('/signup') || pageContent.includes("Profile isn't available")
        }
      }
      
      if (isBlockedOrInvalid) {
        screenshotCaptured = false;
      } else {
        const pngPath = path.join(dirPath, `${timestamp}.png`)
        await page.screenshot({ path: pngPath, fullPage: false })
        savedFilename = `/snapshots/${accountId}/${timestamp}.png`
        screenshotCaptured = true
        console.log(`[AMC Researcher] Captured screenshot successfully for ${account.handle} at ${pngPath}`)
      }
    } catch (err) {
      console.error(`[AMC Researcher] Playwright capture failed for ${account.handle}`, err)
    } finally {
      await browser.close()
    }
  }

  if (!screenshotCaptured) {
    throw new Error('Screenshot failed: redirected to Instagram login wall or profile not found')
  }

  // Update account timestamp and create snapshot DB record
  await prisma.$transaction([
    prisma.socialAccount.update({
      where: { id: accountId },
      data: { snapshotAt: new Date() },
    }),
    prisma.socialAccountSnapshot.create({
      data: {
        accountId,
        imageUrl: savedFilename,
        capturedAt: new Date(),
      },
    }),
  ])

  return savedFilename
}

export async function runDailySnapshotCrawler(): Promise<{ successCount: number; failedCount: number }> {
  // Fetch active social accounts (focus on Instagram only!)
  const accounts = await prisma.socialAccount.findMany({
    where: {
      platformId: 'instagram',
      brand: {
        status: 'ACTIVE',
      },
    },
  })

  let successCount = 0
  let failedCount = 0

  for (const account of accounts) {
    try {
      await captureAccountSnapshot(account.id)
      successCount++
    } catch (e) {
      console.error(`[AMC Researcher] Crawler failed for account ${account.handle} (${account.id}):`, e)
      failedCount++
    }
  }

  return { successCount, failedCount }
}
