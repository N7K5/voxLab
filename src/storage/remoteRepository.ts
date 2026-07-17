import type { PracticeAttempt, User, UserSettings } from '../types';
import { isSpeechLanguage, modelForSpeechLanguage } from '../lib/speechLanguages';
import type { AppRepository } from './repository';

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function recordingExtension(type: string): string {
  const mimeType = type.split(';', 1)[0].toLowerCase();
  if (mimeType === 'audio/ogg') return 'ogg';
  if (mimeType === 'audio/mp4') return 'm4a';
  return 'webm';
}

export class RemoteRepository implements AppRepository {
  readonly status = {
    kind: 'database' as const,
    label: 'Stored on your server',
    detail: 'Your account, analytics, and enabled recordings use the configured database.',
  };

  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        credentials: 'include',
        cache: (init.method ?? 'GET') === 'GET' ? 'no-store' : init.cache,
      });
    } catch (error) {
      throw new Error(`Could not reach remote storage: ${error instanceof Error ? error.message : 'network request failed'}`);
    }
    const text = response.status === 204 ? '' : await response.text();
    let body: { error?: string } | null = null;
    if (text) {
      try {
        body = JSON.parse(text) as { error?: string };
      } catch {
        if (response.ok) throw new Error('The storage server returned an invalid response.');
      }
    }
    if (!response.ok) throw new ApiError(body?.error || `Request failed (${response.status}).`, response.status);
    return body as T;
  }

  signUp(username: string, password: string): Promise<User> {
    return this.request<User>('/auth/signup', { method: 'POST', body: JSON.stringify({ username, password }) });
  }

  logIn(username: string, password: string): Promise<User> {
    return this.request<User>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  }

  async currentUser(): Promise<User | null> {
    try {
      return await this.request<User>('/auth/me');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }

  logOut(): Promise<void> {
    return this.request<void>('/auth/logout', { method: 'POST' });
  }

  deleteAccount(): Promise<void> {
    return this.request<void>('/account', { method: 'DELETE' });
  }

  listAttempts(): Promise<PracticeAttempt[]> {
    return this.request<PracticeAttempt[]>('/attempts');
  }

  getAttempt(id: string): Promise<PracticeAttempt | null> {
    return this.request<PracticeAttempt>(`/attempts/${encodeURIComponent(id)}`).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    });
  }

  async saveAttempt(attempt: PracticeAttempt): Promise<void> {
    const form = new FormData();
    const { recording, ...serializable } = attempt;
    form.append('attempt', JSON.stringify(serializable));
    if (recording) form.append('recording', recording, `speech.${recordingExtension(recording.type)}`);
    await this.request<void>('/attempts', { method: 'POST', body: form });
  }

  async saveAttempts(attempts: PracticeAttempt[]): Promise<void> {
    if (!attempts.length) return;
    if (attempts.length === 1) {
      await this.saveAttempt(attempts[0]);
      return;
    }
    const form = new FormData();
    form.append('attempts', JSON.stringify(attempts.map(({ recording: _recording, ...attempt }) => attempt)));
    attempts.forEach((attempt, index) => {
      if (attempt.recording) form.append(`recording${index}`, attempt.recording, `speech-${index + 1}.${recordingExtension(attempt.recording.type)}`);
    });
    await this.request<void>('/attempts/batch', { method: 'POST', body: form });
  }

  deleteAttempt(id: string): Promise<void> {
    return this.request<void>(`/attempts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  deleteAttempts(ids: string[]): Promise<void> {
    if (!ids.length) return Promise.resolve();
    if (ids.length === 1) return this.deleteAttempt(ids[0]);
    return this.request<void>('/attempts/batch', { method: 'DELETE', body: JSON.stringify({ ids }) });
  }

  async getRecording(id: string): Promise<Blob | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/attempts/${encodeURIComponent(id)}/recording`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'audio/webm,audio/ogg,audio/mp4,application/octet-stream' },
      });
    } catch (error) {
      throw new Error(`Could not reach remote storage: ${error instanceof Error ? error.message : 'network request failed'}`);
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new ApiError(body?.error || 'Could not load this recording.', response.status);
    }
    return response.blob();
  }

  async loadSettings(defaults: UserSettings): Promise<UserSettings> {
    const stored = await this.request<Partial<UserSettings> | null>('/settings');
    const merged = { ...defaults, ...(stored ?? {}) };
    merged.speechLanguage = isSpeechLanguage(merged.speechLanguage) ? merged.speechLanguage : 'en';
    merged.whisperModel = modelForSpeechLanguage(merged.whisperModel, merged.speechLanguage);
    if (merged.speechLanguage === 'bn') merged.stanceAnalysis = 'signals';
    return merged;
  }

  saveSettings(settings: UserSettings): Promise<void> {
    return this.request<void>('/settings', { method: 'PUT', body: JSON.stringify(settings) });
  }
}
