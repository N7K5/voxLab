import type { AppConfig } from '../types';
import { LocalRepository } from './localRepository';
import { checkApiHealth, type AppRepository } from './repository';
import { RemoteRepository } from './remoteRepository';

async function localRepository(): Promise<LocalRepository> {
  const repository = new LocalRepository();
  await repository.ensureAvailable();
  return repository;
}

export async function createRepository(config: AppConfig): Promise<AppRepository> {
  if (config.storage.mode === 'browser') return localRepository();

  try {
    const health = await checkApiHealth(config);
    if (health.database.configured && health.database.ready) {
      return new RemoteRepository(config.storage.apiBaseUrl);
    }
    if (health.database.configured && !health.database.ready) {
      throw new Error(`The configured database is unavailable${health.database.error ? `: ${health.database.error}` : '.'}`);
    }
    if (config.storage.mode === 'database') {
      throw new Error('Database storage is selected, but no database is configured on the server.');
    }
    return localRepository();
  } catch (error) {
    if (config.storage.mode === 'database') throw error;
    if (error instanceof Error && error.message.startsWith('The configured database')) throw error;
    return localRepository();
  }
}

export type { AppRepository } from './repository';
