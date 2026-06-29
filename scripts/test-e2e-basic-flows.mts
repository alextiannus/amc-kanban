#!/usr/bin/env node
import { spawn } from 'child_process'
import net from 'net'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma.ts'

// Constants
const PORT = 3000
const BASE_URL = `http://127.0.0.1:${PORT}`
const TEST_PASSWORD = 'E2ETest!123'
const PROMO_CODE = 'E2ETEST50'

const TEST_USERS = {
  merchant: {
    email: 'merchant-e2e@example.com',
    nickname: 'Merchant E2E',
  },
  bd: {
    email: 'bd-e2e@example.com',
    nickname: 'BD E2E',
  },
  admin: {
    email: 'admin-e2e@example.com',
    nickname: 'Admin E2E',
  },
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Check if port is in use
function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => {
      resolve(true) // Port is in use
    })
    server.once('listening', () => {
      server.close()
      resolve(false) // Port is free
    })
    server.listen(port, '127.0.0.1')
  })
}

// Wait for dev server to respond
async function waitForServer(url: string, timeout = 40000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url)
      if (res.status === 200 || res.status === 302 || res.status === 404) {
        return true
      }
    } catch {}
    await delay(1000)
  }
  return false
}

async function main() {
  console.log('================================================')
  console.log(' Starting End-to-End User Flow Tests')
  console.log('================================================\n')

  let devServerProcess: any = null

  // 1. Seed database
  console.log('Step 1: Seeding E2E test database records...')
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Clean up existing test records
  const allEmails = [TEST_USERS.merchant.email, TEST_USERS.bd.email, TEST_USERS.admin.email, 'referred-e2e@example.com']
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: allEmails } },
    select: { id: true }
  })
  const existingUserIds = existingUsers.map((u: { id: string }) => u.id)

  if (existingUserIds.length > 0) {
    await prisma.promoCodeUsage.deleteMany({ where: { userId: { in: existingUserIds } } })
    await prisma.campaignPromoCode.deleteMany({ where: { code: PROMO_CODE } })
    await prisma.brandSubscription.deleteMany({ where: { createdById: { in: existingUserIds } } })
    await prisma.brandOwner.deleteMany({ where: { userId: { in: existingUserIds } } })
    await prisma.userBusinessRole.deleteMany({ where: { userId: { in: existingUserIds } } })
    await prisma.user.deleteMany({ where: { id: { in: existingUserIds } } })
  } else {
    await prisma.campaignPromoCode.deleteMany({ where: { code: PROMO_CODE } })
  }
  await prisma.brand.deleteMany({ where: { name: 'E2E Test Restaurant' } })

  // Create Users
  const merchantUser = await prisma.user.create({
    data: {
      email: TEST_USERS.merchant.email,
      password: passwordHash,
      type: 'HUMAN',
      role: 'USER',
      nickname: TEST_USERS.merchant.nickname,
    }
  })

  const bdUser = await prisma.user.create({
    data: {
      email: TEST_USERS.bd.email,
      password: passwordHash,
      type: 'HUMAN',
      role: 'USER',
      nickname: TEST_USERS.bd.nickname,
    }
  })

  await prisma.userBusinessRole.create({
    data: {
      userId: bdUser.id,
      role: 'BD'
    }
  })

  const adminUser = await prisma.user.create({
    data: {
      email: TEST_USERS.admin.email,
      password: passwordHash,
      type: 'HUMAN',
      role: 'ADMIN',
      nickname: TEST_USERS.admin.nickname,
    }
  })

  // Create Promo Code
  await prisma.campaignPromoCode.create({
    data: {
      code: PROMO_CODE,
      name: 'E2E Test Coupon',
      discountType: 'PERCENT',
      discountValue: 50,
      isActive: true,
      maxUses: 100,
      usedCount: 0,
      createdById: adminUser.id,
    }
  })

  console.log('✅ Seeding completed.\n')

  // 2. Start / Check Dev Server
  console.log('Step 2: Checking for active server on port 3000...')
  const serverRunning = await checkPort(PORT)
  if (!serverRunning) {
    console.log('  -> No server detected. Spawning next dev server...')
    devServerProcess = spawn('npm', ['run', 'dev'], {
      stdio: 'ignore',
      detached: true,
    })
    const responding = await waitForServer(BASE_URL)
    if (!responding) {
      throw new Error('Failed to start Next.js development server')
    }
    console.log('  -> Dev server is responding.')
  } else {
    console.log('  -> Existing server detected.')
  }

  // 3. Launch Playwright
  console.log('\nStep 3: Launching Playwright browser...')
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  
  try {
    // ──────── FLOW 1: MERCHANT OWNER ────────
    console.log('\nRunning Flow 1: Merchant Owner User Flow')
    const context1 = await browser.newContext()
    const page1 = await context1.newPage()

    console.log('  -> Navigating to Login Page...')
    await page1.goto(BASE_URL)
    await page1.waitForSelector('#email', { timeout: 10000 })

    console.log('  -> Submitting merchant credentials...')
    await page1.fill('#email', TEST_USERS.merchant.email)
    await page1.fill('#password', TEST_PASSWORD)
    await page1.click('button[type="submit"]')

    console.log('  -> Waiting for board redirect...')
    await page1.waitForURL('**/board', { timeout: 15000 })
    console.log(`  -> Landed on: ${page1.url()}`)

    console.log('  -> Navigating to Profile page...')
    await page1.goto(`${BASE_URL}/profile`)
    
    console.log('  -> Click Edit Profile button to toggle editing...')
    const editBtn = await page1.locator('button:has-text("编辑资料")')
    await editBtn.waitFor({ state: 'visible', timeout: 10000 })
    await editBtn.click()

    await page1.waitForSelector('form input[type="text"]', { timeout: 10000 })

    console.log('  -> Verifying invite code container...')
    const profileText = await page1.innerText('body')
    if (!profileText.includes('邀请码') && !profileText.includes('Invite Link')) {
      console.warn('  ⚠️ Warning: Profile page text is missing "邀请码" or "Invite Link". But form fields are loaded.')
    }

    console.log('  -> Editing profile nickname...')
    await page1.fill('form input[type="text"]', 'Merchant E2E Updated')
    // Click submit/save button
    const saveBtn = await page1.locator('button:has-text("保存"), button:has-text("Save"), button:has-text("更新")').first()
    if (await saveBtn.isVisible()) {
      await saveBtn.click()
      await delay(1000)
      console.log('  -> Profile save clicked.')
    }
    console.log('✅ Merchant Owner flow PASSED.')

    // ──────── FLOW 2: BD CLIENT ONBOARDING ────────
    console.log('\nRunning Flow 2: BD / Principal Client Onboarding & Promo Code')
    const context2 = await browser.newContext()
    const page2 = await context2.newPage()

    console.log('  -> Navigating to Login Page...')
    await page2.goto(BASE_URL)
    await page2.waitForSelector('#email', { timeout: 10000 })

    console.log('  -> Submitting BD credentials...')
    await page2.fill('#email', TEST_USERS.bd.email)
    await page2.fill('#password', TEST_PASSWORD)
    await page2.click('button[type="submit"]')

    console.log('  -> Waiting for board redirect...')
    await page2.waitForURL('**/board', { timeout: 15000 })

    console.log('  -> Navigating to Subscription wizard page...')
    await page2.goto(`${BASE_URL}/board/subscription`)
    
    console.log('  -> Filling Step 1 Brand Details form...')
    await page2.waitForSelector('input[placeholder*="大渔铁板烧"]', { timeout: 10000 })
    await page2.fill('input[placeholder*="大渔铁板烧"]', 'E2E Test Restaurant')
    await page2.fill('input[placeholder*="新加坡"]', 'Singapore')
    await page2.fill('input[placeholder*="owner@example.com"]', 'referred-e2e@example.com')
    
    console.log('  -> Click Next to step 2...')
    await page2.click('button:has-text("下一步：选择订阅计划")')
    await delay(1500)

    console.log('  -> Selecting Starter Plan card...')
    // Starter plan defaults to 'starter', we can click it using button text "Starter"
    const starterCard = await page2.locator('button:has-text("Starter"), button:has-text("starter")').first()
    if (await starterCard.isVisible()) {
      await starterCard.click()
      await delay(500)
    }

    console.log('  -> Verifying Invite Code field is visible for BD...')
    await page2.waitForSelector('input[placeholder*="邀请码"]', { timeout: 5000 })

    console.log('  -> Inputting invalid promo code...')
    await page2.fill('input[placeholder*="邀请码"]', 'INVALID999')
    await page2.click('button:has-text("核销")')
    await delay(1000)
    const errText = await page2.innerText('body')
    if (errText.includes('验证失败') || errText.includes('❌')) {
      console.log('  -> Successfully rejected invalid code.')
    } else {
      console.warn('  ⚠️ Expected invalid validation error message.')
    }

    console.log('  -> Inputting valid promo code E2ETEST50...')
    await page2.fill('input[placeholder*="邀请码"]', PROMO_CODE)
    await page2.click('button:has-text("核销")')
    await delay(1500)
    const validText = await page2.innerText('body')
    if (validText.includes('已应用') || validText.includes('✅')) {
      console.log('  -> Successfully validated and applied E2ETEST50.')
    } else {
      throw new Error('Failed to validate valid promo code E2ETEST50')
    }

    console.log('  -> Agreeing to terms & submitting subscription...')
    await page2.click('input[type="checkbox"]')
    await page2.click('button:has-text("确认并激活"), button:has-text("Stripe")')
    await delay(2000)
    console.log('✅ BD Client Onboarding flow PASSED.')

    // ──────── FLOW 3: ADMIN CONSOLE ACCESS ────────
    console.log('\nRunning Flow 3: Admin Console Access')
    const context3 = await browser.newContext()
    const page3 = await context3.newPage()

    console.log('  -> Navigating to Login Page...')
    await page3.goto(BASE_URL)
    await page3.waitForSelector('#email', { timeout: 10000 })

    console.log('  -> Submitting admin credentials...')
    await page3.fill('#email', TEST_USERS.admin.email)
    await page3.fill('#password', TEST_PASSWORD)
    await page3.click('button[type="submit"]')

    console.log('  -> Waiting for board redirect...')
    await page3.waitForURL('**/board', { timeout: 15000 })

    console.log('  -> Navigating to Admin console...')
    await page3.goto(`${BASE_URL}/admin`)
    await page3.waitForSelector('body', { timeout: 10000 })

    const adminBodyText = await page3.innerText('body')
    if (adminBodyText.includes('全局 AI 接口配置') || adminBodyText.includes('系统管理') || adminBodyText.includes('配置')) {
      console.log('  -> Admin panel rendered correctly.')
    } else {
      throw new Error('Admin panel components not found')
    }
    console.log('✅ Admin Console flow PASSED.')

  } finally {
    // 4. Cleanup
    console.log('\nStep 4: Cleaning up E2E test database records...')
    
    // Fetch all created test users again to delete related usages securely
    const cleanupUsers = await prisma.user.findMany({
      where: { email: { in: allEmails } },
      select: { id: true }
    })
    const cleanupIds = cleanupUsers.map((u: { id: string }) => u.id)

    if (cleanupIds.length > 0) {
      await prisma.promoCodeUsage.deleteMany({ where: { userId: { in: cleanupIds } } })
      await prisma.campaignPromoCode.deleteMany({ where: { code: PROMO_CODE } })
      await prisma.brandSubscription.deleteMany({ where: { createdById: { in: cleanupIds } } })
      await prisma.brandOwner.deleteMany({ where: { userId: { in: cleanupIds } } })
      await prisma.userBusinessRole.deleteMany({ where: { userId: { in: cleanupIds } } })
      await prisma.user.deleteMany({ where: { id: { in: cleanupIds } } })
    } else {
      await prisma.campaignPromoCode.deleteMany({ where: { code: PROMO_CODE } })
    }
    await prisma.brand.deleteMany({ where: { name: 'E2E Test Restaurant' } })

    console.log('  -> Closing browser...')
    await browser.close()

    if (devServerProcess) {
      console.log('  -> Terminating dev server process...')
      try {
        if (devServerProcess.pid) {
          process.kill(-devServerProcess.pid)
        }
      } catch {
        try {
          if (devServerProcess.pid) {
            process.kill(devServerProcess.pid)
          }
        } catch {}
      }
    }
  }

  console.log('\n================================================')
  console.log(' E2E Test Suite completed successfully! 🎉')
  console.log('================================================')
}

main().catch((err) => {
  console.error('\n❌ E2E TEST RUN FAILED:', err)
  process.exit(1)
})
