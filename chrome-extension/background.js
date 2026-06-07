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

  const { reviewId, replyText } = payload;
  if (!reviewId || !replyText) {
    throw new Error('reviewId and replyText are required for review replies.');
  }

  // Look for Dianping, Meituan, or localhost mock pages for testing
  const queryUrls = [
    '*://*.dianping.com/*',
    '*://*.meituan.com/*',
    '*://localhost/*',
    '*://127.0.0.1/*'
  ];

  const tabs = await chrome.tabs.query({ url: queryUrls });
  if (tabs.length === 0) {
    throw new Error('Merchant dashboard (dianping.com, meituan.com, or localhost) is not open in any browser tab. Please open and log in first.');
  }

  // Choose the first matching tab
  const targetTab = tabs[0];
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

  // 1. Mock Testing Logic (for localhost developer pages)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('[AMC Automation] Running on localhost mock platform');
    // If mock input elements are present, fill them
    const mockInput = document.getElementById('mock-reply-input') || document.querySelector('[data-test-reply-input]');
    const mockSubmit = document.getElementById('mock-reply-submit') || document.querySelector('[data-test-reply-submit]');
    if (mockInput && mockSubmit) {
      mockInput.value = replyText;
      mockInput.dispatchEvent(new Event('input', { bubbles: true }));
      mockSubmit.click();
      return { success: true, platform: 'mock', reviewId };
    }
    return { success: true, platform: 'mock_simulated', reviewId };
  }

  // 2. Real Dianping / Meituan Merchant Page Automation
  // Search for the reply button/input associated with reviewId in Dianping page
  // (Dianping merchant dashboard uses structures like .review-item, [data-review-id], etc.)
  const reviewElement = document.querySelector(`[data-review-id="${reviewId}"]`) || 
                        document.querySelector(`#review-${reviewId}`) || 
                        document.body; // Fallback to body to search inputs generally

  if (!reviewElement) {
    return { success: false, error: `Review element for ID ${reviewId} could not be located on the page.` };
  }

  // Find the text input or textarea
  const textarea = reviewElement.querySelector('textarea') || 
                   reviewElement.querySelector('input[type="text"]') || 
                   document.querySelector('.reply-textarea') || 
                   document.querySelector('textarea');

  if (!textarea) {
    return { success: false, error: 'Could not locate the reply textarea input.' };
  }

  // Simulate typing (setting value + dispatching events so React/Vue models update)
  textarea.value = replyText;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));

  // Find the submit button
  const submitButton = reviewElement.querySelector('button[type="submit"]') || 
                       reviewElement.querySelector('.btn-reply-submit') || 
                       document.querySelector('.reply-submit-btn') || 
                       document.querySelector('button.btn-primary');

  if (!submitButton) {
    return { success: false, error: 'Could not locate the reply submit button.' };
  }

  // Click the submit button
  submitButton.click();
  console.log('[AMC Automation] Reply submitted successfully!');

  return { success: true, reviewId };
}
