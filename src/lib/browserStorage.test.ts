import { describe, expect, it, vi } from 'vitest';
import { requestPersistentBrowserStorage } from './browserStorage';

describe('browser storage persistence', () => {
  it('does not request persistence again when it is already granted', async () => {
    const persist = vi.fn(async () => true);
    await expect(requestPersistentBrowserStorage({
      persisted: async () => true,
      persist,
    })).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence when the browser supports it', async () => {
    const persist = vi.fn(async () => true);
    await expect(requestPersistentBrowserStorage({
      persisted: async () => false,
      persist,
    })).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('fails closed when storage persistence is unavailable or rejected', async () => {
    await expect(requestPersistentBrowserStorage(undefined)).resolves.toBe(false);
    await expect(requestPersistentBrowserStorage({
      persist: async () => { throw new Error('denied'); },
    })).resolves.toBe(false);
  });
});
