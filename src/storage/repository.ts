import type { AppConfig, PracticeAttempt, StorageStatus, User, UserSettings } from '../types';

export interface AppRepository {
  readonly status: StorageStatus;
  signUp(username: string, password: string): Promise<User>;
  logIn(username: string, password: string): Promise<User>;
  currentUser(): Promise<User | null>;
  logOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  listAttempts(): Promise<PracticeAttempt[]>;
  getAttempt(id: string): Promise<PracticeAttempt | null>;
  saveAttempt(attempt: PracticeAttempt): Promise<void>;
  deleteAttempt(id: string): Promise<void>;
  getRecording(id: string): Promise<Blob | null>;
  loadSettings(defaults: UserSettings): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<void>;
}

export interface HealthResponse {
  ok: boolean;
  database: {
    configured: boolean;
    ready: boolean;
    error?: string;
  };
}

export async function checkApiHealth(config: AppConfig): Promise<HealthResponse> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 2_500);
  const baseUrl = config.storage.apiBaseUrl.replace(/\/$/, '');
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/health`, {
        signal: controller.signal,
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      throw new Error(controller.signal.aborted
        ? 'The storage API health check timed out.'
        : `Could not reach the storage API: ${error instanceof Error ? error.message : 'network request failed'}`);
    }
    if (!response.ok) throw new Error(`API health check returned ${response.status}`);
    const health = await response.json() as Partial<HealthResponse>;
    if (health.ok !== true
      || !health.database
      || typeof health.database.configured !== 'boolean'
      || typeof health.database.ready !== 'boolean') {
      throw new Error('The storage API returned an invalid health response.');
    }
    return health as HealthResponse;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
