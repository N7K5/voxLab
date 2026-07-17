import { describe, expect, it } from 'vitest';
import { resampleTo16Khz } from './recorder';

describe('resampleTo16Khz', () => {
  it('preserves duration and DC level when downsampling a common microphone rate', () => {
    const input = new Float32Array(48_000).fill(0.25);
    const output = resampleTo16Khz(input, 48_000);

    expect(output).toHaveLength(16_000);
    expect(output[0]).toBeCloseTo(0.25, 6);
    expect(output.at(-1)).toBeCloseTo(0.25, 6);
  });

  it('area-averages source samples while downsampling', () => {
    const output = resampleTo16Khz(Float32Array.from([0, 0, 0, 1, 1, 1]), 48_000);
    expect(Array.from(output)).toEqual([0, 1]);
  });

  it('rejects invalid source rates instead of allocating an invalid output', () => {
    expect(() => resampleTo16Khz(new Float32Array(10), 0)).toThrow(RangeError);
    expect(() => resampleTo16Khz(new Float32Array(10), Number.NaN)).toThrow(RangeError);
  });
});
