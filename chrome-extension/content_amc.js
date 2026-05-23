let eventSource = null;
let currentBrandId = null;

function setupConnection(brandId) {
  if (eventSource) {
    console.log(`[AMC Bridge] Closing previous connection for brand: ${currentBrandId}`);
    eventSource.close();
    eventSource = null;
  }

  currentBrandId = brandId;
  if (!brandId) return;

  console.log(`[AMC Bridge] Connecting to SSE bridge for brand: ${brandId}`);
  
  // Use relative path since content script runs on the AMC domain
  const url = `/api/integrations/extension/events?brandId=${brandId}`;
  eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.status === 'connected') {
        console.log(`[AMC Bridge] SSE Connection confirmed for brand: ${brandId}`);
        return;
      }

      console.log(`[AMC Bridge] Received command from server:`, data);
      
      // Send the request to background service worker for automation
      chrome.runtime.sendMessage({
        type: 'EXECUTE_ACTION',
        brandId,
        requestId: data.id,
        action: data.action,
        payload: data.payload
      });
    } catch (e) {
      console.error(`[AMC Bridge] Error parsing message:`, e);
    }
  };

  eventSource.onerror = (err) => {
    console.error(`[AMC Bridge] SSE connection error for brand ${brandId}. Reconnecting in 5s...`, err);
    eventSource.close();
    eventSource = null;
    setTimeout(() => {
      if (currentBrandId === brandId) {
        setupConnection(brandId);
      }
    }, 5000);
  };
}

// Listen to results sent back by the background script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ACTION_RESULT') {
    console.log(`[AMC Bridge] Sending action result back to server:`, msg);
    
    fetch('/api/integrations/extension/response', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requestId: msg.requestId,
        success: msg.success,
        data: msg.data,
        error: msg.error
      })
    })
    .then(res => {
      if (!res.ok) console.error(`[AMC Bridge] Failed to post result back to server: HTTP ${res.status}`);
    })
    .catch(err => {
      console.error(`[AMC Bridge] Network error posting result back:`, err);
    });
  }
});

// Start observing document.body for data-active-brand-id changes
const observer = new MutationObserver(() => {
  const brandId = document.body.getAttribute('data-active-brand-id');
  if (brandId !== currentBrandId) {
    console.log(`[AMC Bridge] Active brand ID changed to: ${brandId}`);
    setupConnection(brandId);
  }
});

// Initialize observer
observer.observe(document.body, {
  attributes: true,
  attributeFilter: ['data-active-brand-id']
});

// Check if brand ID is already present on load
const initialBrandId = document.body.getAttribute('data-active-brand-id');
if (initialBrandId) {
  setupConnection(initialBrandId);
}
