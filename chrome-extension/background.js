// Listen for execution commands from the AMC content script
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'EXECUTE_ACTION') {
    const senderTabId = sender.tab?.id;
    if (!senderTabId) {
      console.error('[AMC SW] Command received but sender tab ID is missing.');
      return;
    }

    (async () => {
      const { requestId, action, payload } = message;
      console.log(`[AMC SW] Starting execution of action: ${action} (reqId: ${requestId})`);

      try {
        const result = await handleExecuteAction(action, payload);
        console.log(`[AMC SW] Action succeeded, returning result:`, result);
        
        await chrome.tabs.sendMessage(senderTabId, {
          type: 'ACTION_RESULT',
          requestId,
          success: true,
          data: result
        });
      } catch (err) {
        console.error(`[AMC SW] Action failed:`, err);
        
        await chrome.tabs.sendMessage(senderTabId, {
          type: 'ACTION_RESULT',
          requestId,
          success: false,
          error: err.message || String(err)
        });
      }
    })();
    return true; // Keep message channel open for asynchronous reply
  }
});

/**
 * Find active tab for targeted platforms and inject reply script.
 */
async function handleExecuteAction(action, payload) {
  if (action !== 'domestic_reply_review') {
    throw new Error(`Unsupported extension action: ${action}`);
  }

  const { reviewId, replyText, platform } = payload;
  if (!reviewId || !replyText) {
    throw new Error('reviewId and replyText are required for review replies.');
  }

  // Look for Dianping, Meituan, Instagram, TikTok, Xiaohongshu, or localhost mock pages for testing
  const queryUrls = [
    '*://*.dianping.com/*',
    '*://*.meituan.com/*',
    '*://*.instagram.com/*',
    '*://*.tiktok.com/*',
    '*://*.xiaohongshu.com/*',
    '*://localhost/*',
    '*://127.0.0.1/*'
  ];

  const tabs = await chrome.tabs.query({ url: queryUrls });
  if (tabs.length === 0) {
    throw new Error('Target platform merchant page (dianping.com, meituan.com, instagram.com, tiktok.com, xiaohongshu.com, or localhost) is not open in any browser tab. Please open and log in first.');
  }

  // Choose the best matching tab
  let targetTab = null;

  // 1. Try to find a tab matching our mock merchant simulator
  targetTab = tabs.find(t => t.url && t.url.includes('mock-merchant'));

  // 2. If not found, try to find a tab matching the specific platform domain
  if (!targetTab && platform) {
    targetTab = tabs.find(t => {
      if (!t.url) return false;
      const url = t.url.toLowerCase();
      if (platform === 'dianping' && url.includes('dianping.com')) return true;
      if (platform === 'meituan' && url.includes('meituan.com')) return true;
      if (platform === 'instagram' && url.includes('instagram.com')) return true;
      if (platform === 'tiktok' && url.includes('tiktok.com')) return true;
      if (platform === 'xiaohongshu' && url.includes('xiaohongshu.com')) return true;
      return false;
    });
  }

  // 3. Fallback to the first tab that is NOT the dashboard /board page
  if (!targetTab) {
    targetTab = tabs.find(t => t.url && !t.url.includes('/board'));
  }

  // 4. Ultimate fallback to the first tab in the list
  if (!targetTab) {
    targetTab = tabs[0];
  }

  console.log(`[AMC SW] Found target tab for automation: ${targetTab.url} (ID: ${targetTab.id})`);

  // Execute the reply automation script inside the target tab context
  const results = await chrome.scripting.executeScript({
    target: { tabId: targetTab.id },
    func: runDomesticReplyInPage,
    args: [reviewId, replyText]
  });

  const finalResult = results[0]?.result;
  if (finalResult && !finalResult.success) {
    throw new Error(finalResult.error || 'Automation script failed to submit the reply.');
  }

  return finalResult || { success: true };
}

/**
 * This function runs inside the target merchant page DOM context.
 * It queries elements, types text, and submits the form.
 */
function runDomesticReplyInPage(reviewId, replyText) {
  console.log(`[AMC Automation] Injecting reply for review ID ${reviewId}: "${replyText}"`);
  const hostname = window.location.hostname;

  // 1. Mock Testing Logic (for localhost developer pages)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    console.log('[AMC Automation] Running on localhost mock platform');
    const mockInput = document.getElementById('mock-reply-input') || document.querySelector('[data-test-reply-input]');
    const mockSubmit = document.getElementById('mock-reply-submit') || document.querySelector('[data-test-reply-submit]');
    if (mockInput && mockSubmit) {
      mockInput.value = replyText;
      mockInput.dispatchEvent(new Event('input', { bubbles: true }));
      mockSubmit.click();
      return { success: true, platform: 'mock', reviewId };
    }
    console.log('[AMC Automation] No custom mock-reply-input found, falling through to generic DOM automation...');
  }

  // 2. Platform-specific Automation
  
  // ── Xiaohongshu (RED) Creator Platform ───────────────────────────────
  if (hostname.includes('xiaohongshu.com') || window.location.pathname.includes('/mock-merchant/xiaohongshu')) {
    console.log('[AMC Automation] Running Xiaohongshu automation');
    const commentEl = document.querySelector(`[data-comment-id="${reviewId}"]`) || 
                      document.querySelector(`#comment-${reviewId}`) || 
                      document.querySelector('.comment-item') || 
                      document.body;

    const textarea = commentEl.querySelector('textarea') || 
                     commentEl.querySelector('input') || 
                     document.querySelector('textarea') || 
                     document.querySelector('[placeholder*="输入回复"]') ||
                     document.querySelector('.reply-input');

    if (!textarea) {
      return { success: false, error: 'Could not locate Xiaohongshu reply input textarea.' };
    }

    textarea.value = replyText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    const sendBtn = commentEl.querySelector('.publish-btn') || 
                    commentEl.querySelector('.send-btn') || 
                    document.querySelector('.reply-submit') || 
                    document.querySelector('.submit-btn') ||
                    document.querySelector('button');

    if (!sendBtn) {
      return { success: false, error: 'Could not locate Xiaohongshu reply submit button.' };
    }

    sendBtn.click();
    return { success: true, platform: 'xiaohongshu', reviewId };
  }

  // ── Instagram Automation ─────────────────────────────────────────────
  if (hostname.includes('instagram.com') || window.location.pathname.includes('/mock-merchant/instagram')) {
    console.log('[AMC Automation] Running Instagram automation');
    const textarea = document.querySelector('textarea[placeholder*="comment"]') || 
                     document.querySelector('textarea[placeholder*="评论"]') || 
                     document.querySelector('textarea') ||
                     document.querySelector('form textarea');

    if (!textarea) {
      return { success: false, error: 'Could not locate Instagram comment input textarea.' };
    }

    textarea.focus();
    textarea.value = replyText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    const submitBtn = document.querySelector('form button[type="submit"]') || 
                      document.querySelector('button[type="submit"]') ||
                      document.querySelector('form button');

    if (!submitBtn) {
      return { success: false, error: 'Could not locate Instagram comment submit button.' };
    }

    submitBtn.click();
    return { success: true, platform: 'instagram', reviewId };
  }

  // ── TikTok Automation ────────────────────────────────────────────────
  if (hostname.includes('tiktok.com') || window.location.pathname.includes('/mock-merchant/tiktok')) {
    console.log('[AMC Automation] Running TikTok automation');
    const textarea = document.querySelector('[placeholder*="reply"]') || 
                     document.querySelector('[placeholder*="回复"]') || 
                     document.querySelector('textarea') ||
                     document.querySelector('.comment-reply-input');

    if (!textarea) {
      return { success: false, error: 'Could not locate TikTok reply input textarea.' };
    }

    textarea.value = replyText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    const submitBtn = document.querySelector('.reply-btn') || 
                      document.querySelector('.publish-btn') || 
                      document.querySelector('button[type="submit"]') ||
                      document.querySelector('button');

    if (!submitBtn) {
      return { success: false, error: 'Could not locate TikTok reply submit button.' };
    }

    submitBtn.click();
    return { success: true, platform: 'tiktok', reviewId };
  }

  // ── Dianping / Meituan / Generic Fallback Automation ──────────────────
  console.log('[AMC Automation] Running Dianping/Meituan/Fallback automation');
  const reviewElement = document.querySelector(`[data-review-id="${reviewId}"]`) || 
                        document.querySelector(`#review-${reviewId}`) || 
                        document.body;

  if (!reviewElement) {
    return { success: false, error: `Review element for ID ${reviewId} could not be located on the page.` };
  }

  const textarea = reviewElement.querySelector('textarea') || 
                   reviewElement.querySelector('input[type="text"]') || 
                   document.querySelector('.reply-textarea') || 
                   document.querySelector('textarea');

  if (!textarea) {
    return { success: false, error: 'Could not locate the reply textarea input.' };
  }

  textarea.value = replyText;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));

  const submitButton = reviewElement.querySelector('button[type="submit"]') || 
                       reviewElement.querySelector('.btn-reply-submit') || 
                       document.querySelector('.reply-submit-btn') || 
                       document.querySelector('button.btn-primary');

  if (!submitButton) {
    return { success: false, error: 'Could not locate the reply submit button.' };
  }

  submitButton.click();
  console.log('[AMC Automation] Reply submitted successfully!');

  return { success: true, reviewId };
}
