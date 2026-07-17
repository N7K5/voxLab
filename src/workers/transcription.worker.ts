import { env, pipeline } from '@huggingface/transformers';
import { chooseTranscriptionDevice, isWebGpuAdapter, type WebGpuAdapterLike } from '../lib/transcriptionDevice';
import { transcriptionModelDtype } from '../lib/transcriptionModel';
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
  forceDevice?: Exclude<DeviceChoice, 'auto'>;
  preferWasm?: boolean;
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
let loadedRequestDevice: DeviceChoice | '' = '';

class RestartOnWasmError extends Error {
  constructor(reason: unknown) {
    super(reason instanceof Error ? reason.message : 'Browser GPU transcription failed.');
    this.name = 'RestartOnWasmError';
  }
}

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
  loadedRequestDevice = '';
}

async function loadForDevice(
  message: TranscribeMessage,
  device: Exclude<DeviceChoice, 'auto'>,
): Promise<SpeechPipeline> {
  const key = `${message.model}:${device}`;
  if (transcriber && loadedKey === key) {
    loadedRequestDevice = message.device;
    return transcriber;
  }

  await disposeTranscriber();
  post(message.id, { type: 'status', stage: 'model', device, message: `Loading local speech model (${device.toUpperCase()})…`, progress: 0 });
  const loaded = await pipeline('automatic-speech-recognition', message.model, {
    device,
    dtype: transcriptionModelDtype(message.model, device),
    progress_callback: (progress: { status?: string; progress?: number; file?: string }) => {
      post(message.id, {
        type: 'status',
        stage: 'model',
        message: progress.status === 'progress'
          ? `Loading ${progress.file ?? 'model data'} (browser cache or network)…`
          : 'Preparing local speech model…',
        progress: typeof progress.progress === 'number' ? progress.progress : undefined,
      });
    },
  });
  transcriber = loaded as unknown as SpeechPipeline;
  loadedKey = key;
  loadedDevice = device;
  loadedRequestDevice = message.device;
  return transcriber;
}

function requestWebGpuAdapter(): Promise<unknown | null> {
  const webgpu = (env.backends.onnx as {
    webgpu?: { adapter?: unknown; powerPreference?: 'low-power' | 'high-performance' };
  }).webgpu;
  const configured = webgpu?.adapter;
  if (isWebGpuAdapter(configured)) return Promise.resolve(configured);
  const gpu = (globalThis.navigator as unknown as {
    gpu?: { requestAdapter: (options?: { powerPreference?: 'low-power' | 'high-performance' }) => Promise<unknown | null> };
  }).gpu;
  return gpu?.requestAdapter(webgpu?.powerPreference ? { powerPreference: webgpu.powerPreference } : undefined)
    ?? Promise.resolve(null);
}

function reuseWebGpuAdapter(adapter: WebGpuAdapterLike): void {
  const onnx = env.backends.onnx as {
    webgpu?: { adapter?: WebGpuAdapterLike; powerPreference?: 'low-power' | 'high-performance' };
  };
  if (isWebGpuAdapter(onnx.webgpu?.adapter)) return;
  onnx.webgpu ??= {};
  onnx.webgpu.adapter = adapter;
}

async function loadTranscriber(message: TranscribeMessage): Promise<SpeechPipeline> {
  if (
    transcriber
    && loadedDevice
    && loadedRequestDevice === message.device
    && loadedKey === `${message.model}:${loadedDevice}`
  ) {
    return transcriber;
  }

  const forcedDevice = message.forceDevice ?? (message.device === 'auto' && message.preferWasm ? 'wasm' : undefined);
  const choice = forcedDevice
    ? { device: forcedDevice }
    : await chooseTranscriptionDevice(message.device, message.model, requestWebGpuAdapter);
  if (choice.device === 'wasm' && message.device !== 'wasm') {
    post(message.id, {
      type: 'status',
      stage: 'model',
      device: 'wasm',
      message: message.forceDevice === 'wasm'
        ? message.preferWasm
          ? 'Auto selected browser CPU (WASM) for this mobile or limited-memory device…'
          : 'Continuing in a clean browser CPU (WASM) worker…'
        : 'Using browser CPU (WASM); no GPU model will be loaded…',
    });
  }

  try {
    if ('adapter' in choice && choice.adapter) reuseWebGpuAdapter(choice.adapter);
    return await loadForDevice(message, choice.device);
  } catch (error) {
    if (choice.device === 'webgpu') throw new RestartOnWasmError(error);
    throw error;
  }
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
    if (output.text.trim() || loadedDevice !== 'webgpu' || !message.hasSignal) {
      return output;
    }
  } catch (error) {
    if (loadedDevice !== 'webgpu') throw error;
    throw new RestartOnWasmError(error);
  }

  throw new RestartOnWasmError('Browser GPU transcription returned no words for speech-level audio.');
}

self.onmessage = async (event: MessageEvent<TranscribeMessage>) => {
  const message = event.data;
  if (message.type !== 'transcribe') return;
  try {
    if (!isSpeechLanguage(message.language)) throw new Error('The selected practice language is not supported.');
    if (message.language !== 'en' && isEnglishOnlyWhisper(message.model)) {
      throw new Error('This Whisper model only understands English. Choose a multilingual model for the selected language.');
    }
    const speechPipeline = await loadTranscriber(message);
    post(message.id, { type: 'status', stage: 'transcription', device: loadedDevice, message: 'Turning speech into text locally…' });
    const output = await transcribeWithDeviceFallback(message, speechPipeline);
    post(message.id, {
      type: 'result',
      text: output.text.trim(),
      chunks: output.chunks ?? [],
      device: loadedDevice,
    });
  } catch (error) {
    if (error instanceof RestartOnWasmError) {
      post(message.id, {
        type: 'retry-wasm',
        error: error.message,
        message: 'Restarting the speech model on browser CPU (WASM)…',
      });
      return;
    }
    post(message.id, {
      type: 'error',
      error: error instanceof Error ? error.message : 'Local transcription failed.',
    });
  }
};
