import { shouldTryWebGpuAutomatically } from './transcriptionModel';

export type RequestedTranscriptionDevice = 'auto' | 'webgpu' | 'wasm';
export type ResolvedTranscriptionDevice = Exclude<RequestedTranscriptionDevice, 'auto'>;

export interface WebGpuAdapterLike {
  features: object;
  limits: object;
  requestDevice: (...args: unknown[]) => Promise<unknown>;
}

type RequestAdapter = () => Promise<unknown | null>;

export function isWebGpuAdapter(value: unknown): value is WebGpuAdapterLike {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WebGpuAdapterLike>;
  return typeof candidate.features === 'object'
    && typeof candidate.limits === 'object'
    && typeof candidate.requestDevice === 'function';
}

export function shouldPreferWasmForDevice(input: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  deviceMemory?: number;
}): boolean {
  const lowMemory = typeof input.deviceMemory === 'number' && input.deviceMemory <= 4;
  const mobileBrowser = /Android|iPhone|iPad|iPod|Mobile/i.test(input.userAgent ?? '');
  const desktopModeIpad = (input.maxTouchPoints ?? 0) > 1
    && /Mac/i.test(`${input.platform ?? ''} ${input.userAgent ?? ''}`);
  return lowMemory || mobileBrowser || desktopModeIpad;
}

async function adapterWithTimeout(
  requestAdapter: RequestAdapter,
  timeoutMs: number,
): Promise<WebGpuAdapterLike | null> {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = globalThis.setTimeout(() => resolve(null), timeoutMs);
    });
    const requested = Promise.resolve()
      .then(requestAdapter)
      .then((adapter) => isWebGpuAdapter(adapter) ? adapter : null)
      .catch(() => null);
    return await Promise.race([requested, timeout]);
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  }
}

export async function chooseTranscriptionDevice(
  requested: RequestedTranscriptionDevice,
  model: string,
  requestAdapter?: RequestAdapter,
  adapterTimeoutMs = 2_000,
): Promise<{ device: ResolvedTranscriptionDevice; adapter?: WebGpuAdapterLike }> {
  if (requested === 'wasm') return { device: 'wasm' };
  if (requested === 'auto' && !shouldTryWebGpuAutomatically(model)) return { device: 'wasm' };
  if (!requestAdapter) return { device: 'wasm' };

  const adapter = await adapterWithTimeout(requestAdapter, adapterTimeoutMs);
  return adapter ? { device: 'webgpu', adapter } : { device: 'wasm' };
}
