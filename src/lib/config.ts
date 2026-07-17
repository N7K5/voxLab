import type { AppConfig, UserSettings } from '../types';

const fallbackConfig: AppConfig = {
  storage: { mode: 'browser', apiBaseUrl: '/api' },
  ai: {
    provider: 'browser',
    ollamaEndpoint: 'http://localhost:11434',
    ollamaModel: 'qwen3:4b',
    ollamaViaServer: false,
  },
  speech: { model: 'onnx-community/whisper-tiny.en', device: 'auto', language: 'en' },
  practice: { defaultDurationSeconds: 60, saveRecordings: true },
};

let cachedConfig: AppConfig | null = null;

function deploymentConfig(config: AppConfig): AppConfig {
  if (import.meta.env.VITE_BROWSER_ONLY !== 'true') return config;
  return {
    ...config,
    storage: { ...config.storage, mode: 'browser' },
    ai: { ...config.ai, ollamaViaServer: false },
  };
}

export async function loadAppConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}app.config.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Config returned ${response.status}`);
    const incoming = (await response.json()) as Partial<AppConfig>;
    cachedConfig = deploymentConfig({
      storage: { ...fallbackConfig.storage, ...incoming.storage },
      ai: { ...fallbackConfig.ai, ...incoming.ai },
      speech: { ...fallbackConfig.speech, ...incoming.speech },
      practice: { ...fallbackConfig.practice, ...incoming.practice },
    });
  } catch {
    cachedConfig = deploymentConfig(fallbackConfig);
  }
  return cachedConfig;
}

export function settingsFromConfig(config: AppConfig): UserSettings {
  return {
    aiProvider: config.ai.provider,
    ollamaEndpoint: config.ai.ollamaEndpoint,
    ollamaModel: config.ai.ollamaModel,
    ollamaViaServer: config.ai.ollamaViaServer,
    whisperModel: config.speech.model,
    whisperDevice: config.speech.device,
    saveRecordings: config.practice.saveRecordings,
  };
}
