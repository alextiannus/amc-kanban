interface ExtensionBridgeState {
  activeExtensions: Map<string, any>;
  pendingRequests: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason?: any) => void;
      timeout: NodeJS.Timeout;
    }
  >;
}

const globalForBridge = globalThis as unknown as {
  extensionBridgeState?: ExtensionBridgeState;
};

if (!globalForBridge.extensionBridgeState) {
  globalForBridge.extensionBridgeState = {
    activeExtensions: new Map(),
    pendingRequests: new Map(),
  };
}

export const bridgeState = globalForBridge.extensionBridgeState;

/**
 * Register an active extension's SSE stream controller.
 */
export function registerExtension(brandId: string, controller: any) {
  const oldController = bridgeState.activeExtensions.get(brandId);
  if (oldController) {
    try {
      oldController.close();
    } catch (e) {
      // Ignored
    }
  }
  bridgeState.activeExtensions.set(brandId, controller);
  console.log(`[Extension Bridge] Registered active stream for brand: ${brandId}`);
}

/**
 * Unregister an extension stream.
 */
export function unregisterExtension(brandId: string) {
  if (bridgeState.activeExtensions.delete(brandId)) {
    console.log(`[Extension Bridge] Unregistered stream for brand: ${brandId}`);
  }
}

/**
 * Send a command down the SSE connection to the extension and await the POST reply.
 */
export async function sendExtensionCommand(
  brandId: string,
  action: string,
  payload: any
): Promise<any> {
  const controller = bridgeState.activeExtensions.get(brandId);
  if (!controller) {
    throw new Error('No active browser extension connection found for this brand.');
  }

  const requestId = `req_${Math.random().toString(36).substring(2, 11)}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      bridgeState.pendingRequests.delete(requestId);
      reject(new Error('Extension response timeout after 45 seconds.'));
    }, 45000);

    bridgeState.pendingRequests.set(requestId, { resolve, reject, timeout });

    try {
      // Format as standard Server-Sent Event data line
      const message = `data: ${JSON.stringify({ id: requestId, action, payload })}\n\n`;
      controller.enqueue(message);
    } catch (e: any) {
      clearTimeout(timeout);
      bridgeState.pendingRequests.delete(requestId);
      reject(new Error(`Failed to send command to extension: ${e?.message || String(e)}`));
    }
  });
}
