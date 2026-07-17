import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareTranscriptionAudio, transcribeLocally } from './transcribe';

const SAMPLE_RATE = 16_000;

afterEach(() => {
  vi.unstubAllGlobals();
});

function rms(values: Float32Array): number {
  let squareSum = 0;
  for (const value of values) squareSum += value * value;
  return Math.sqrt(squareSum / values.length);
}

describe('prepareTranscriptionAudio', () => {
  it('removes DC offset, lifts quiet speech, and adds a clean tail', () => {
    const input = Float32Array.from(
      { length: SAMPLE_RATE },
      (_, index) => 0.1 + 0.01 * Math.sin((2 * Math.PI * 220 * index) / SAMPLE_RATE),
    );

    const prepared = prepareTranscriptionAudio(input);
    const speech = prepared.subarray(0, input.length);
    const tail = prepared.subarray(input.length);

    expect(prepared).toHaveLength(SAMPLE_RATE + 3_200);
    expect(rms(speech)).toBeCloseTo(0.08, 2);
    expect(Math.max(...tail)).toBe(0);
    expect(Math.min(...tail)).toBe(0);
  });

  it('does not amplify silence or preserve invalid samples', () => {
    const input = Float32Array.from([Number.NaN, Number.POSITIVE_INFINITY, 0, 0]);
    const prepared = prepareTranscriptionAudio(input);

    expect(prepared.every(Number.isFinite)).toBe(true);
    expect(prepared.every((value) => value === 0)).toBe(true);
  });
});

describe('local transcription cancellation', () => {
  it('terminates an in-flight model worker when its analysis is aborted', async () => {
    let instance: HangingWorker | undefined;
    class HangingWorker {
      onmessage: ((event: MessageEvent<Record<string, unknown>>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        instance = this;
      }
    }
    vi.stubGlobal('Worker', HangingWorker);
    const controller = new AbortController();
    const transcription = transcribeLocally(Float32Array.from([0.1, -0.1]), {
      model: 'test/whisper',
      device: 'wasm',
      signal: controller.signal,
    });

    controller.abort();

    await expect(transcription).rejects.toMatchObject({ name: 'AbortError' });
    expect(instance?.terminate).toHaveBeenCalledOnce();
  });
});
