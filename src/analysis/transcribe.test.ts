import { describe, expect, it } from 'vitest';
import { prepareTranscriptionAudio } from './transcribe';

const SAMPLE_RATE = 16_000;

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
