export interface BrowserStorageManagerLike {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

function currentStorageManager(): BrowserStorageManagerLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.storage;
}

/**
 * Asks the browser to make Cache Storage and IndexedDB less likely to be
 * evicted. Browsers may decline, so model loading must never depend on this.
 */
export async function requestPersistentBrowserStorage(
  storage: BrowserStorageManagerLike | undefined = currentStorageManager(),
): Promise<boolean> {
  if (!storage?.persist) return false;
  try {
    if (await storage.persisted?.()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
