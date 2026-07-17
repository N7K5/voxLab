import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadAppConfig, settingsFromConfig } from '../lib/config';
import { createRepository, type AppRepository } from '../storage';
import type {
  AppConfig,
  PracticeAttempt,
  StorageStatus,
  User,
  UserSettings,
} from '../types';

interface AppContextValue {
  config: AppConfig | null;
  storageStatus: StorageStatus | null;
  user: User | null;
  settings: UserSettings | null;
  attempts: PracticeAttempt[];
  ready: boolean;
  bootError: string | null;
  retryBootstrap: () => void;
  signUp: (username: string, password: string) => Promise<void>;
  logIn: (username: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  saveSettings: (settings: UserSettings) => Promise<void>;
  saveAttempt: (attempt: PracticeAttempt) => Promise<void>;
  deleteAttempt: (id: string) => Promise<void>;
  getAttempt: (id: string) => Promise<PracticeAttempt | null>;
  getRecording: (id: string) => Promise<Blob | null>;
  refreshAttempts: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something unexpected happened.';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [repository, setRepository] = useState<AppRepository | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootstrapVersion, setBootstrapVersion] = useState(0);

  const hydrateUser = useCallback(async (
    nextRepository: AppRepository,
    nextConfig: AppConfig,
    nextUser: User,
  ) => {
    const defaults = settingsFromConfig(nextConfig);
    const [nextSettings, nextAttempts] = await Promise.all([
      nextRepository.loadSettings(defaults),
      nextRepository.listAttempts(),
    ]);
    setUser(nextUser);
    setSettings(nextSettings);
    setAttempts(nextAttempts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setBootError(null);

    void (async () => {
      try {
        const nextConfig = await loadAppConfig();
        const nextRepository = await createRepository(nextConfig);
        const nextUser = await nextRepository.currentUser();
        if (cancelled) return;
        setConfig(nextConfig);
        setRepository(nextRepository);
        if (nextUser) await hydrateUser(nextRepository, nextConfig, nextUser);
        else {
          setUser(null);
          setSettings(null);
          setAttempts([]);
        }
      } catch (error) {
        if (!cancelled) setBootError(errorMessage(error));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [bootstrapVersion, hydrateUser]);

  const requireRepository = useCallback(() => {
    if (!repository || !config) throw new Error('The app is still starting. Please try again.');
    return { repository, config };
  }, [repository, config]);

  const signUp = useCallback(async (username: string, password: string) => {
    const current = requireRepository();
    const nextUser = await current.repository.signUp(username, password);
    await hydrateUser(current.repository, current.config, nextUser);
  }, [hydrateUser, requireRepository]);

  const logIn = useCallback(async (username: string, password: string) => {
    const current = requireRepository();
    const nextUser = await current.repository.logIn(username, password);
    await hydrateUser(current.repository, current.config, nextUser);
  }, [hydrateUser, requireRepository]);

  const logOut = useCallback(async () => {
    if (repository) await repository.logOut();
    setUser(null);
    setSettings(null);
    setAttempts([]);
  }, [repository]);

  const deleteAccount = useCallback(async () => {
    const current = requireRepository();
    await current.repository.deleteAccount();
    setUser(null);
    setSettings(null);
    setAttempts([]);
  }, [requireRepository]);

  const saveSettings = useCallback(async (nextSettings: UserSettings) => {
    const current = requireRepository();
    await current.repository.saveSettings(nextSettings);
    setSettings(nextSettings);
  }, [requireRepository]);

  const refreshAttempts = useCallback(async () => {
    if (!repository || !user) return;
    setAttempts(await repository.listAttempts());
  }, [repository, user]);

  const saveAttempt = useCallback(async (attempt: PracticeAttempt) => {
    const current = requireRepository();
    await current.repository.saveAttempt(attempt);
    await refreshAttempts();
  }, [refreshAttempts, requireRepository]);

  const deleteAttempt = useCallback(async (id: string) => {
    const current = requireRepository();
    await current.repository.deleteAttempt(id);
    setAttempts((currentAttempts) => currentAttempts.filter((attempt) => attempt.id !== id));
  }, [requireRepository]);

  const getAttempt = useCallback(async (id: string) => {
    const current = requireRepository();
    return current.repository.getAttempt(id);
  }, [requireRepository]);

  const getRecording = useCallback(async (id: string) => {
    const current = requireRepository();
    return current.repository.getRecording(id);
  }, [requireRepository]);

  const value = useMemo<AppContextValue>(() => ({
    config,
    storageStatus: repository?.status ?? null,
    user,
    settings,
    attempts,
    ready,
    bootError,
    retryBootstrap: () => setBootstrapVersion((version) => version + 1),
    signUp,
    logIn,
    logOut,
    deleteAccount,
    saveSettings,
    saveAttempt,
    deleteAttempt,
    getAttempt,
    getRecording,
    refreshAttempts,
  }), [
    attempts,
    bootError,
    config,
    deleteAccount,
    deleteAttempt,
    getAttempt,
    getRecording,
    logIn,
    logOut,
    ready,
    refreshAttempts,
    repository,
    saveAttempt,
    saveSettings,
    settings,
    signUp,
    user,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider.');
  return context;
}
