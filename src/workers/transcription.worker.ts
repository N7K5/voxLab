import { env, pipeline } from '@huggingface/transformers';
import { isSpeechLanguage, whisperLanguageName } from '../lib/speechLanguages';
import type { SpeechLanguage } from '../types';

env.allowLocalModels = false;
env.useBrowserCache = true;

type DeviceChoice = 'auto' | 'webgpu' | 'wasm';

interface TranscribeMessage {
  type: 'transcribe';
  id: string;
  audio: Float32Array;
  model: string;
  device: DeviceChoice;
  language: SpeechLanguage;
  hasSignal: boolean;
}

interface TranscriptionOutput {
  text: string;
  chunks?: Array<{ text: string; timestamp: [number, number | null] }>;
}

type SpeechPipeline = {
  (audio: Float32Array, options: Record<string, unknown>): Promise<TranscriptionOutput>;
  dispose?: () => Promise<void> | void;
};

let loadedKey = '';
let transcriber: SpeechPipeline | null = null;
let loadedDevice: Exclude<DeviceChoice, 'auto'> | '' = '';

function post(id: string, payload: Record<string, unknown>): void {
  self.postMessage({ id, ...payload });
}

async function disposeTranscriber(): Promise<void> {
  try {
    await transcriber?.dispose?.();
  } catch {
    // A failed cleanup should not prevent the user from loading another model.
  }
  transcriber = null;
  loadedKey = '';
  loadedDevice = '';
}

async function loadForDevice(
  message: TranscribeMessage,
  device: Exclude<DeviceChoice, 'auto'>,
): Promise<SpeechPipeline> {
  const key = `${message.model}:${device}`;
  if (transcriber && loadedKey === key) return transcriber;

  await disposeTranscriber();
  post(message.id, { type: 'status', stage: 'model', message: `Loading local speech model (${device.toUpperCase()})…`, progress: 0 });
  const loaded = await pipeline('automatic-speech-recognition', message.model, {
    device,
    dtype: device === 'webgpu'
      ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
      : 'q8',
    progress_callback: (progress: { status?: string; progress?: number; file?: string }) => {
      post(message.id, {
        type: 'status',
        stage: 'model',
        message: progress.status === 'progress' ? `Downloading ${progress.file ?? 'model data'}…` : 'Preparing local speech model…',
        progress: typeof progress.progress === 'number' ? progress.progress : undefined,
      });
    },
  });
  transcriber = loaded as unknown as SpeechPipeline;
  loadedKey = key;
  loadedDevice = device;
  return transcriber;
}

async function loadTranscriber(message: TranscribeMessage): Promise<SpeechPipeline> {
  const supportsWebGpu = 'gpu' in navigator;
  if (message.device !== 'auto') return loadForDevice(message, message.device);
  if (transcriber && loadedDevice && loadedKey === `${message.model}:${loadedDevice}`) return transcriber;
  if (supportsWebGpu) {
    try {
      return await loadForDevice(message, 'webgpu');
    } catch {
      post(message.id, {
        type: 'status',
        stage: 'model',
        message: 'WebGPU could not load this model; falling back to browser CPU (WASM)…',
      });
    }
  }
  return loadForDevice(message, 'wasm');
}

function isEnglishOnlyWhisper(model: string): boolean {
  const name = model.split('/').at(-1)?.toLocaleLowerCase() ?? '';
  return name.endsWith('.en') || name.includes('.en-');
}

function transcriptionOptions(message: TranscribeMessage): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  const durationSeconds = message.audio.length / 16_000;
  if (durationSeconds > 29) {
    // Chunk long recordings without timestamp-token generation. VoxLab only needs the
    // text, and avoiding timestamp decoding removes a fragile path for short utterances.
    options.chunk_length_s = 28;
    options.stride_length_s = 4;
  }
  if (/whisper/i.test(message.model) && !isEnglishOnlyWhisper(message.model)) {
    options.language = whisperLanguageName(message.language);
    options.task = 'transcribe';
  }
  return options;
}

async function transcribeWithDeviceFallback(
  message: TranscribeMessage,
  speechPipeline: SpeechPipeline,
): Promise<TranscriptionOutput> {
  const options = transcriptionOptions(message);
  try {
    const output = await speechPipeline(message.audio, options);
    if (output.text.trim() || message.device !== 'auto' || loadedDevice !== 'webgpu' || !message.hasSignal) {
      return output;
    }
  } catch (error) {
    if (message.device !== 'auto' || loadedDevice !== 'webgpu') throw error;
  }

  post(message.id, {
    type: 'status',
    stage: 'model',
    message: 'Browser GPU transcription was inconclusive; retrying on browser CPU…',
  });
  const fallbackPipeline = await loadForDevice(message, 'wasm');
  post(message.id, { type: 'status', stage: 'transcription', message: 'Retrying local transcription…' });
  return fallbackPipeline(message.audio, options);
}

self.onmessage = async (event: MessageEvent<TranscribeMessage>) => {
  const message = event.data;
  if (message.type !== 'transcribe') return;
  try {
    if (!isSpeechLanguage(message.language)) throw new Error('The selected practice language is not supported.');
    if (message.language !== 'en' && isEnglishOnlyWhisper(message.model)) {
      throw new Error('This Whisper model only understands English. Choose a multilingual model for Bengali.');
    }
    const speechPipeline = await loadTranscriber(message);
    post(message.id, { type: 'status', stage: 'transcription', message: 'Turning speech into text locally…' });
    const output = await transcribeWithDeviceFallback(message, speechPipeline);
    post(message.id, {
      type: 'result',
      text: output.text.trim(),
      chunks: output.chunks ?? [],
      device: loadedDevice,
    });
  } catch (error) {
    post(message.id, {
      type: 'error',
      error: error instanceof Error ? error.message : 'Local transcription failed.',
    });
  }
};
