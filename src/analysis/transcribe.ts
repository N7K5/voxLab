import type { SpeechLanguage } from '../types';
import { shouldPreferWasmForDevice } from '../lib/transcriptionDevice';

export interface TranscriptionProgress {
  stage: 'model' | 'transcription';
  message: string;
  progress?: number;
  device?: 'webgpu' | 'wasm';
}

export interface TranscriptionResult {
  text: string;
  chunks: Array<{ text: string; timestamp: [number, number | null] }>;
  engine: string;
}

interface PendingRequest {
  resolve: (value: TranscriptionResult) => void;
  reject: (reason: Error) => void;
  onProgress?: (progress: TranscriptionProgress) => void;
  model: string;
  requestedDevice: 'auto' | 'webgpu' | 'wasm';
  preferWasm: boolean;
  audio: Float32Array;
  language: SpeechLanguage;
  hasSignal: boolean;
  fallbackAttempted: boolean;
  cleanup: () => void;
}

let worker: Worker | null = null;
const pending = new Map<string, PendingRequest>();
const TRANSCRIPTION_SAMPLE_RATE = 16_000;
const TRAILING_SILENCE_SECONDS = 0.2;
const TARGET_RMS = 0.08;
const MAX_GAIN = 12;

export function preferWasmForCurrentDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const current = navigator as Navigator & { deviceMemory?: number };
  return shouldPreferWasmForDevice({
    userAgent: current.userAgent,
    platform: current.platform,
    maxTouchPoints: current.maxTouchPoints,
    deviceMemory: current.deviceMemory,
  });
}

function transcriptionAbortError(): DOMException {
  return new DOMException('Local transcription was cancelled.', 'AbortError');
}

function stopWorker(error: Error): void {
  for (const request of pending.values()) {
    request.cleanup();
    request.reject(error);
  }
  pending.clear();
  worker?.terminate();
  worker = null;
}

export function disposeTranscriptionWorker(): void {
  if (pending.size) {
    stopWorker(transcriptionAbortError());
    return;
  }
  worker?.terminate();
  worker = null;
}

function postTranscriptionRequest(
  id: string,
  request: PendingRequest,
  forceDevice?: 'webgpu' | 'wasm',
): void {
  // Auto/WebGPU keeps one prepared copy so a failed GPU runtime can be replaced
  // by a fresh WASM worker. Known-WASM requests transfer their only copy.
  const canTransferMaster = forceDevice === 'wasm' || request.requestedDevice === 'wasm';
  const outbound = canTransferMaster ? request.audio : request.audio.slice();
  if (canTransferMaster) request.audio = new Float32Array();
  getWorker().postMessage({
    type: 'transcribe',
    id,
    audio: outbound,
    model: request.model,
    device: request.requestedDevice,
    forceDevice,
    preferWasm: request.preferWasm,
    language: request.language,
    hasSignal: request.hasSignal,
  }, [outbound.buffer]);
}

function restartRequestOnWasm(id: string, request: PendingRequest, message: string): void {
  if (request.fallbackAttempted) {
    stopWorker(new Error('Browser CPU fallback could not start after the GPU runtime failed.'));
    return;
  }
  request.fallbackAttempted = true;
  request.onProgress?.({ stage: 'model', device: 'wasm', message });

  for (const [otherId, other] of pending) {
    if (otherId === id) continue;
    other.cleanup();
    other.reject(new Error('The speech worker restarted on browser CPU. Please retry this analysis.'));
    pending.delete(otherId);
  }
  worker?.terminate();
  worker = null;
  try {
    postTranscriptionRequest(id, request, 'wasm');
  } catch (error) {
    stopWorker(error instanceof Error ? error : new Error('Browser CPU fallback could not start.'));
  }
}

function hasSignal(audio: Float32Array): boolean {
  if (!audio.length) return false;
  let mean = 0;
  for (const sample of audio) mean += Number.isFinite(sample) ? sample : 0;
  mean /= audio.length;
  let squareSum = 0;
  for (const sample of audio) {
    const centered = (Number.isFinite(sample) ? sample : 0) - mean;
    squareSum += centered * centered;
  }
  return Math.sqrt(squareSum / audio.length) >= 0.0005;
}

export function prepareTranscriptionAudio(audio: Float32Array): Float32Array {
  if (!audio.length) return audio;

  let mean = 0;
  for (const sample of audio) mean += Number.isFinite(sample) ? sample : 0;
  mean /= audio.length;

  let squareSum = 0;
  let peak = 0;
  for (const sample of audio) {
    const centered = (Number.isFinite(sample) ? sample : 0) - mean;
    squareSum += centered * centered;
    peak = Math.max(peak, Math.abs(centered));
  }
  const rms = Math.sqrt(squareSum / audio.length);
  const gain = rms > 0.0005 && peak > 0
    ? Math.min(MAX_GAIN, TARGET_RMS / rms, 0.98 / peak)
    : 1;
  const trailingSamples = Math.round(TRANSCRIPTION_SAMPLE_RATE * TRAILING_SILENCE_SECONDS);
  const prepared = new Float32Array(audio.length + trailingSamples);
  for (let index = 0; index < audio.length; index += 1) {
    const centered = (Number.isFinite(audio[index]) ? audio[index] : 0) - mean;
    prepared[index] = Math.max(-1, Math.min(1, centered * gain));
  }
  return prepared;
}

function getWorker(): Worker {
  if (worker) return worker;
  const nextWorker = new Worker(new URL('../workers/transcription.worker.ts', import.meta.url), { type: 'module' });
  worker = nextWorker;
  nextWorker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
    if (worker !== nextWorker) return;
    const id = String(event.data.id);
    const request = pending.get(id);
    if (!request) return;
    if (event.data.type === 'status') {
      request.onProgress?.({
        stage: event.data.stage as TranscriptionProgress['stage'],
        message: String(event.data.message),
        progress: typeof event.data.progress === 'number' ? event.data.progress : undefined,
        device: event.data.device === 'webgpu' || event.data.device === 'wasm' ? event.data.device : undefined,
      });
      return;
    }
    if (event.data.type === 'retry-wasm') {
      restartRequestOnWasm(id, request, String(event.data.message ?? 'Restarting the speech model on browser CPU (WASM)…'));
      return;
    }
    if (event.data.type === 'error') {
      stopWorker(new Error(String(event.data.error)));
      return;
    }
    pending.delete(id);
    request.cleanup();
    request.resolve({
      text: String(event.data.text ?? ''),
      chunks: (event.data.chunks ?? []) as TranscriptionResult['chunks'],
      engine: `Transformers.js · ${request.model}${event.data.device ? ` · ${String(event.data.device).toUpperCase()}` : ''}`,
    });
  };
  nextWorker.onerror = (event) => {
    if (worker !== nextWorker) return;
    stopWorker(new Error(event.message || 'The transcription worker stopped.'));
  };
  return nextWorker;
}

export function transcribeLocally(
  audio: Float32Array,
  options: {
    model: string;
    device: 'auto' | 'webgpu' | 'wasm';
    language?: SpeechLanguage;
    onProgress?: (progress: TranscriptionProgress) => void;
    signal?: AbortSignal;
  },
): Promise<TranscriptionResult> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(transcriptionAbortError());
      return;
    }
    const onAbort = () => {
      if (pending.has(id)) stopWorker(transcriptionAbortError());
    };
    const cleanup = () => options.signal?.removeEventListener('abort', onAbort);
    const request: PendingRequest = {
      resolve,
      reject,
      onProgress: options.onProgress,
      model: options.model,
      requestedDevice: options.device,
      preferWasm: options.device === 'auto' && preferWasmForCurrentDevice(),
      audio: prepareTranscriptionAudio(audio),
      language: options.language ?? 'en',
      hasSignal: hasSignal(audio),
      fallbackAttempted: false,
      cleanup,
    };
    pending.set(id, request);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      postTranscriptionRequest(id, request, request.preferWasm ? 'wasm' : undefined);
    } catch (error) {
      stopWorker(error instanceof Error ? error : new Error('The transcription worker could not start.'));
    }
  });
}
