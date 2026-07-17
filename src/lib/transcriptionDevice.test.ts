import { describe, expect, it, vi } from 'vitest';
import { chooseTranscriptionDevice, shouldPreferWasmForDevice } from './transcriptionDevice';

const MODEL = 'onnx-community/whisper-tiny.en';
const ADAPTER = {
  features: {},
  limits: {},
  requestDevice: async () => ({}),
};

describe('transcription device selection', () => {
  it('never probes WebGPU when WASM / CPU is selected', async () => {
    const requestAdapter = vi.fn(async () => ADAPTER);

    await expect(chooseTranscriptionDevice('wasm', MODEL, requestAdapter)).resolves.toEqual({ device: 'wasm' });
    expect(requestAdapter).not.toHaveBeenCalled();
  });

  it('keeps Auto on WASM for models that should not use WebGPU', async () => {
    const requestAdapter = vi.fn(async () => ADAPTER);

    await expect(chooseTranscriptionDevice('auto', 'distil-whisper/distil-small.en', requestAdapter)).resolves.toEqual({ device: 'wasm' });
    expect(requestAdapter).not.toHaveBeenCalled();
  });

  it('uses WASM without loading a GPU pipeline when no adapter is returned', async () => {
    const requestAdapter = vi.fn(async () => null);

    await expect(chooseTranscriptionDevice('auto', MODEL, requestAdapter)).resolves.toEqual({ device: 'wasm' });
    expect(requestAdapter).toHaveBeenCalledOnce();
  });

  it('uses a validated adapter when WebGPU is available', async () => {
    await expect(chooseTranscriptionDevice('auto', MODEL, async () => ADAPTER)).resolves.toEqual({
      device: 'webgpu',
      adapter: ADAPTER,
    });
  });

  it('falls back when adapter probing rejects or times out', async () => {
    await expect(chooseTranscriptionDevice('auto', MODEL, async () => {
      throw new Error('adapter unavailable');
    })).resolves.toEqual({ device: 'wasm' });
    await expect(chooseTranscriptionDevice('webgpu', MODEL, () => new Promise(() => undefined), 1)).resolves.toEqual({ device: 'wasm' });
  });
});

describe('automatic mobile safeguards', () => {
  it('prefers WASM on mobile and low-memory devices', () => {
    expect(shouldPreferWasmForDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' })).toBe(true);
    expect(shouldPreferWasmForDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Mobile)' })).toBe(true);
    expect(shouldPreferWasmForDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(shouldPreferWasmForDevice({ userAgent: 'Desktop browser', deviceMemory: 4 })).toBe(true);
  });

  it('allows Auto to probe WebGPU on a desktop with more memory', () => {
    expect(shouldPreferWasmForDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', deviceMemory: 8 })).toBe(false);
  });
});
