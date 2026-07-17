import type { PracticeAttempt, User, UserSettings } from '../types';
import type { AppRepository } from './repository';

const DB_NAME = 'voxlab';
const DB_VERSION = 1;
const CURRENT_USER_KEY = 'voxlab.currentUser';
const PBKDF2_ITERATIONS = 310_000;
const MAX_RECORDING_BYTES = 15 * 1024 * 1024;

interface LocalUser extends User {
  usernameNormalized: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
}

interface StoredSettings extends UserSettings {
  userId: string;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted'));
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hashPassword(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  if (iterations !== PBKDF2_ITERATIONS) throw new Error('This local password record is not supported.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = base64ToBytes(left);
  const b = base64ToBytes(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function validateCredentials(usernameValue: string, password: string): { username: string; normalized: string } {
  if (typeof usernameValue !== 'string' || typeof password !== 'string') {
    throw new Error('Username and password are required.');
  }
  const username = usernameValue.trim().normalize('NFKC');
  if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(username)) {
    throw new Error('Use 3–32 letters, numbers, dots, dashes, or underscores for the username.');
  }
  const normalized = username.toLowerCase();
  if ([...normalized].length > 32) throw new Error('That username is too long after normalization.');
  if (password.length < 8 || password.length > 256) throw new Error('Password must contain 8–256 characters.');
  return { username, normalized };
}

function validateLocalUser(value: unknown): value is LocalUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<LocalUser>;
  return typeof user.id === 'string'
    && typeof user.username === 'string'
    && typeof user.usernameNormalized === 'string'
    && typeof user.passwordHash === 'string'
    && typeof user.passwordSalt === 'string'
    && user.passwordIterations === PBKDF2_ITERATIONS
    && typeof user.createdAt === 'string';
}

function validatedSettings(settings: UserSettings): UserSettings {
  if (settings.aiProvider !== 'browser' && settings.aiProvider !== 'ollama') throw new Error('Invalid AI provider.');
  if (!['auto', 'webgpu', 'wasm'].includes(settings.whisperDevice)) throw new Error('Invalid speech-model device.');
  if (!['signals', 'semantic'].includes(settings.stanceAnalysis)) throw new Error('Invalid stance-analysis mode.');
  if (typeof settings.ollamaViaServer !== 'boolean' || typeof settings.saveRecordings !== 'boolean') {
    throw new Error('Settings contain invalid boolean values.');
  }
  if (!settings.ollamaModel.trim() || settings.ollamaModel.length > 120) throw new Error('Invalid Ollama model.');
  if (!settings.whisperModel.trim() || settings.whisperModel.length > 200) throw new Error('Invalid speech model.');
  try {
    const endpoint = new URL(settings.ollamaEndpoint);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error();
  } catch {
    throw new Error('Ollama endpoint must be an HTTP(S) URL without embedded credentials.');
  }
  return {
    aiProvider: settings.aiProvider,
    ollamaEndpoint: settings.ollamaEndpoint.replace(/\/$/, ''),
    ollamaModel: settings.ollamaModel,
    ollamaViaServer: settings.ollamaViaServer,
    whisperModel: settings.whisperModel,
    whisperDevice: settings.whisperDevice,
    stanceAnalysis: settings.stanceAnalysis,
    saveRecordings: settings.saveRecordings,
  };
}

function settingsWithDefaults(defaults: UserSettings, stored?: Partial<UserSettings>): UserSettings {
  const candidate = { ...defaults, ...(stored ?? {}) };
  try {
    return validatedSettings(candidate);
  } catch {
    return validatedSettings(defaults);
  }
}

function publicUser(user: LocalUser): User {
  return { id: user.id, username: user.username, createdAt: user.createdAt };
}

export class LocalRepository implements AppRepository {
  readonly status = {
    kind: 'browser' as const,
    label: 'Stored on this device',
    detail: 'Your account, recordings, and history stay in this browser.',
  };

  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('users')) {
          const users = db.createObjectStore('users', { keyPath: 'id' });
          users.createIndex('usernameNormalized', 'usernameNormalized', { unique: true });
        }
        if (!db.objectStoreNames.contains('attempts')) {
          const attempts = db.createObjectStore('attempts', { keyPath: 'id' });
          attempts.createIndex('userId', 'userId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'userId' });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error ?? new Error('Could not open browser storage'));
      };
      request.onblocked = () => {
        this.dbPromise = null;
        reject(new Error('Browser storage is open in another tab. Close the other tab and try again.'));
      };
    });
    return this.dbPromise;
  }

  async ensureAvailable(): Promise<void> {
    await this.open();
  }

  private async requireCurrentUser(): Promise<User> {
    const user = await this.currentUser();
    if (!user) throw new Error('Please sign in again.');
    return user;
  }

  async signUp(username: string, password: string): Promise<User> {
    const credentials = validateCredentials(username, password);

    const db = await this.open();
    const checkTx = db.transaction('users', 'readonly');
    const existing = await requestResult(checkTx.objectStore('users').index('usernameNormalized').get(credentials.normalized));
    if (existing) throw new Error('That username is already used in this browser.');

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const user: LocalUser = {
      id: crypto.randomUUID(),
      username: credentials.username,
      usernameNormalized: credentials.normalized,
      passwordHash: await hashPassword(password, salt, PBKDF2_ITERATIONS),
      passwordSalt: bytesToBase64(salt),
      passwordIterations: PBKDF2_ITERATIONS,
      createdAt: new Date().toISOString(),
    };
    const writeTx = db.transaction('users', 'readwrite');
    writeTx.objectStore('users').add(user);
    try {
      await transactionDone(writeTx);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        throw new Error('That username is already used in this browser.');
      }
      throw error;
    }
    localStorage.setItem(CURRENT_USER_KEY, user.id);
    return publicUser(user);
  }

  async logIn(username: string, password: string): Promise<User> {
    const credentials = validateCredentials(username, password);
    const db = await this.open();
    const tx = db.transaction('users', 'readonly');
    const foundValue = await requestResult(tx.objectStore('users').index('usernameNormalized').get(credentials.normalized));
    if (!validateLocalUser(foundValue)) throw new Error('Incorrect username or password.');
    const found = foundValue;
    try {
      const hash = await hashPassword(password, base64ToBytes(found.passwordSalt), found.passwordIterations);
      if (!constantTimeEqual(hash, found.passwordHash)) throw new Error('Incorrect username or password.');
    } catch {
      throw new Error('Incorrect username or password.');
    }
    localStorage.setItem(CURRENT_USER_KEY, found.id);
    return publicUser(found);
  }

  async currentUser(): Promise<User | null> {
    const id = localStorage.getItem(CURRENT_USER_KEY);
    if (!id) return null;
    const db = await this.open();
    const tx = db.transaction('users', 'readonly');
    const found = await requestResult(tx.objectStore('users').get(id));
    if (!validateLocalUser(found)) {
      localStorage.removeItem(CURRENT_USER_KEY);
      return null;
    }
    return publicUser(found);
  }

  async logOut(): Promise<void> {
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  async deleteAccount(): Promise<void> {
    const user = await this.requireCurrentUser();
    const db = await this.open();
    const writeTx = db.transaction(['users', 'attempts', 'settings'], 'readwrite');
    writeTx.objectStore('users').delete(user.id);
    writeTx.objectStore('settings').delete(user.id);
    const attempts = writeTx.objectStore('attempts');
    const cursorRequest = attempts.index('userId').openKeyCursor(IDBKeyRange.only(user.id));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      attempts.delete(cursor.primaryKey);
      cursor.continue();
    };
    await transactionDone(writeTx);
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  async listAttempts(): Promise<PracticeAttempt[]> {
    const user = await this.requireCurrentUser();
    const db = await this.open();
    const tx = db.transaction('attempts', 'readonly');
    const attempts = await requestResult(tx.objectStore('attempts').index('userId').getAll(user.id)) as PracticeAttempt[];
    return attempts
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ recording, ...attempt }) => ({
        ...attempt,
        hasRecording: Boolean(recording),
        recordingMimeType: recording?.type || attempt.recordingMimeType,
      }));
  }

  async getAttempt(id: string): Promise<PracticeAttempt | null> {
    const user = await this.requireCurrentUser();
    const db = await this.open();
    const tx = db.transaction('attempts', 'readonly');
    const attempt = await requestResult(tx.objectStore('attempts').get(id)) as PracticeAttempt | undefined;
    if (attempt?.userId !== user.id) return null;
    return {
      ...attempt,
      hasRecording: Boolean(attempt.recording),
      recordingMimeType: attempt.recording?.type || attempt.recordingMimeType,
    };
  }

  async saveAttempt(attempt: PracticeAttempt): Promise<void> {
    await this.saveAttempts([attempt]);
  }

  async saveAttempts(attempts: PracticeAttempt[]): Promise<void> {
    if (!attempts.length) return;
    const user = await this.requireCurrentUser();
    if (new Set(attempts.map((attempt) => attempt.id)).size !== attempts.length) throw new Error('Attempt IDs must be unique.');
    attempts.forEach((attempt) => {
      if (attempt.userId !== user.id) throw new Error('Cannot save another user’s attempt.');
      if (attempt.recording && attempt.recording.size > MAX_RECORDING_BYTES) throw new Error('Recording is too large.');
    });
    const db = await this.open();
    const tx = db.transaction('attempts', 'readwrite');
    const store = tx.objectStore('attempts');
    const done = transactionDone(tx);
    attempts.forEach((attempt) => {
      const request = store.get(attempt.id);
      request.onsuccess = () => {
        const existing = request.result as PracticeAttempt | undefined;
        const recording = attempt.recording ?? existing?.recording;
        store.put({
          ...attempt,
          userId: user.id,
          recording,
          hasRecording: Boolean(recording),
          recordingMimeType: recording?.type || attempt.recordingMimeType,
        });
      };
    });
    await done;
  }

  async deleteAttempt(id: string): Promise<void> {
    await this.deleteAttempts([id]);
  }

  async deleteAttempts(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const user = await this.requireCurrentUser();
    const db = await this.open();
    const tx = db.transaction('attempts', 'readwrite');
    const store = tx.objectStore('attempts');
    const done = transactionDone(tx);
    ids.forEach((id) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const existing = request.result as PracticeAttempt | undefined;
        if (existing?.userId === user.id) store.delete(id);
      };
    });
    await done;
  }

  async getRecording(id: string): Promise<Blob | null> {
    const attempt = await this.getAttempt(id);
    return attempt?.recording ?? null;
  }

  async loadSettings(defaults: UserSettings): Promise<UserSettings> {
    const user = await this.requireCurrentUser();
    const db = await this.open();
    const tx = db.transaction('settings', 'readonly');
    const stored = await requestResult(tx.objectStore('settings').get(user.id)) as StoredSettings | undefined;
    if (!stored) return settingsWithDefaults(defaults);
    const { userId: _userId, ...values } = stored;
    return settingsWithDefaults(defaults, values);
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    const user = await this.requireCurrentUser();
    const values = validatedSettings(settings);
    const db = await this.open();
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ ...values, userId: user.id });
    await transactionDone(tx);
  }
}
