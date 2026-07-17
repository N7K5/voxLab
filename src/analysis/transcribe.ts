export interface TranscriptionProgress {
  stage: 'model' | 'transcription';
  message: string;
  progress?: number;
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
}

let worker: Worker | null = null;
const pending = new Map<string, PendingRequest>();
const TRANSCRIPTION_SAMPLE_RATE = 16_000;
const TRAILING_SILENCE_SECONDS = 0.2;
const TARGET_RMS = 0.08;
const MAX_GAIN = 12;

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
  worker = new Worker(new URL('../workers/transcription.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
    const id = String(event.data.id);
    const request = pending.get(id);
    if (!request) return;
    if (event.data.type === 'status') {
      request.onProgress?.({
        stage: event.data.stage as TranscriptionProgress['stage'],
        message: String(event.data.message),
        progress: typeof event.data.progress === 'number' ? event.data.progress : undefined,
      });
      return;
    }
    pending.delete(id);
    if (event.data.type === 'error') {
      request.reject(new Error(String(event.data.error)));
      return;
    }
    request.resolve({
      text: String(event.data.text ?? ''),
      chunks: (event.data.chunks ?? []) as TranscriptionResult['chunks'],
      engine: `Transformers.js · ${request.model}${event.data.device ? ` · ${String(event.data.device).toUpperCase()}` : ''}`,
    });
  };
  worker.onerror = (event) => {
    for (const request of pending.values()) request.reject(new Error(event.message || 'The transcription worker stopped.'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function transcribeLocally(
  audio: Float32Array,
  options: {
    model: string;
    device: 'auto' | 'webgpu' | 'wasm';
    language?: SpeechLanguage;
    onProgress?: (progress: TranscriptionProgress) => void;
  },
): Promise<TranscriptionResult> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress: options.onProgress, model: options.model });
    const transferable = prepareTranscriptionAudio(audio);
    getWorker().postMessage({
      type: 'transcribe',
      id,
      audio: transferable,
      model: options.model,
      device: options.device,
      language: options.language ?? 'en',
      hasSignal: hasSignal(audio),
    }, [transferable.buffer]);
  });
}
import type { SpeechLanguage } from '../types';
