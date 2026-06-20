import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function run() {
  const pathToExtension = path.resolve('chrome-extension');
  const userDataDir = path.resolve('node_modules/.cache/playwright-user-data');

  console.log('Cleaning up old user data directory...');
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch (e) {
    console.warn('Failed to delete old userDataDir:', e);
  }

  console.log('Launching browser with Chrome Extension...');
  let browserContext;
  try {
    browserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Must be false for extensions to load
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--headless=new', // Modern headless mode that supports extensions
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
    });
  } catch (err) {
    console.error('Failed to launch browser with extension:', err);
    process.exit(1);
  }

  try {
    // Page 1: Login and go to Dashboard board view
    const boardPage = await browserContext.newPage();
    
    // Log console & errors
    boardPage.on('console', msg => console.log('PAGE LOG:', msg.text()));
    boardPage.on('pageerror', err => console.error('PAGE ERROR:', err.stack || err.message || err));
    
    console.log('Navigating to login page...');
    await boardPage.goto('http://127.0.0.1:3000/');
    
    // Wait for React hydration
    await boardPage.waitForTimeout(3000);
    
    // Fill credentials
    await boardPage.fill('#email', 'admin@example.com');
    await boardPage.fill('#password', 'password123');
    
    // Tiny delay before submit
    await boardPage.waitForTimeout(500);
    console.log('Submitting login...');
    await boardPage.click('button[type="submit"]');

    // Wait for board navigation
    console.log('Waiting for board page to load...');
    try {
      await boardPage.waitForURL('**/board', { timeout: 45000 });
    } catch (err) {
      console.error('waitForURL timed out! Current URL is:', boardPage.url());
      const screenshotPath = path.resolve('scratch/login_failed.png');
      try {
        await boardPage.screenshot({ path: screenshotPath });
        console.log(`Saved screenshot to ${screenshotPath}`);
      } catch (scre) {
        console.error('Failed to take screenshot:', scre);
      }
      try {
        const errorEl = await boardPage.$('.text-red-500');
        if (errorEl) {
          console.log('Login error displayed on page:', await errorEl.innerText());
        } else {
          console.log('No error element (.text-red-500) found on login page.');
        }
      } catch (er) {
        console.error('Failed to get error element:', er);
      }
      try {
        const bodyHtml = await boardPage.innerHTML('body');
        console.log('--- PAGE HTML CONTENT ---');
        console.log(bodyHtml.substring(0, 3000));
        console.log('-------------------------');
      } catch (htmle) {
        console.error('Failed to get page HTML:', htmle);
      }
      throw err;
    }
    console.log('Board loaded! Checking data-active-brand-id on body...');
    
    // Wait for the attribute to be present
    let brandId = null;
    for (let i = 0; i < 20; i++) {
      brandId = await boardPage.evaluate(() => document.body.getAttribute('data-active-brand-id'));
      if (brandId) break;
      await new Promise(r => setTimeout(r, 500));
    }
    
    if (!brandId) {
      throw new Error('data-active-brand-id was not set on document.body on the board page');
    }
    console.log(`Active brand ID resolved from DOM: ${brandId}`);

    // Page 2: Open mock merchant page
    const merchantPage = await browserContext.newPage();

    const platformsToTest = [
      { name: 'dianping', reviewId: 'rev_dp_01' },
      { name: 'meituan', reviewId: 'rev_mt_02' },
      { name: 'xiaohongshu', reviewId: 'rev_xhs_03' },
      { name: 'instagram', reviewId: 'rev_ig_04' },
      { name: 'tiktok', reviewId: 'rev_tt_05' },
    ];

    for (const pf of platformsToTest) {
      console.log(`\n--------------------------------------------`);
      console.log(`🚀 Testing platform: ${pf.name.toUpperCase()} (Review ID: ${pf.reviewId})`);
      console.log(`--------------------------------------------`);

      console.log(`Navigating to /mock-merchant/${pf.name}...`);
      await merchantPage.goto(`http://127.0.0.1:3000/mock-merchant/${pf.name}`);
      await merchantPage.waitForSelector(`#review-${pf.reviewId}`, { timeout: 10000 });

      // Wait for page hydration and stability
      await merchantPage.waitForTimeout(2000);

      let success = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`Triggering AI response test for ${pf.reviewId} (Attempt ${attempt}/3)...`);
        const triggerBtn = await merchantPage.$(`#review-${pf.reviewId} .reply-trigger-btn`);
        if (!triggerBtn) {
          throw new Error(`Could not find trigger button on /mock-merchant/${pf.name}`);
        }
        await triggerBtn.click();

        // Wait up to 6 seconds per attempt
        for (let i = 0; i < 6; i++) {
          const text = await merchantPage.innerText(`#review-${pf.reviewId}`);
          if (text.includes('已由 插件/AI 自动发表回复')) {
            success = true;
            console.log(`✅ Success: Injected reply detected for ${pf.name}!`);
            break;
          }
          await merchantPage.waitForTimeout(1000);
        }

        if (success) break;
        console.warn(`⚠️ Injection not detected after attempt ${attempt}. Retrying...`);
      }

      if (!success) {
        throw new Error(`Automation failed for platform ${pf.name}: Reply was not injected/submitted.`);
      }
    }

    console.log('\n✨ All E2E extension integration tests passed successfully across all 5 platforms! ✨');
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  } finally {
    console.log('Closing browser...');
    await browserContext.close();
  }
}

run();
