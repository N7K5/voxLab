import { describe, expect, it } from 'vitest';
import { analyzeAudio, calculateClippingRatio } from './audioAnalysis';

const SAMPLE_RATE = 16_000;

function sine(seconds: number, frequency = 200, amplitude = 0.2): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * SAMPLE_RATE) },
    (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE),
  );
}

function join(...parts: Float32Array[]): Float32Array {
  const output = new Float32Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

describe('analyzeAudio', () => {
  it('reports silence without inventing a loud volume or pitch', async () => {
    const metrics = await analyzeAudio(new Float32Array(SAMPLE_RATE));

    expect(metrics.voicedSeconds).toBe(0);
    expect(metrics.silenceRatio).toBe(1);
    expect(metrics.initialSilenceSeconds).toBeCloseTo(1, 3);
    expect(metrics.averageVolumeDb).toBe(-100);
    expect(metrics.averagePitchHz).toBeNull();
    expect(metrics.pitchVariationSemitones).toBeNull();
  });

  it('finds an internal pause and a stable voiced pitch', async () => {
    const input = join(sine(1), new Float32Array(SAMPLE_RATE / 2), sine(1));
    const metrics = await analyzeAudio(input);

    expect(metrics.pauseCount).toBe(1);
    expect(metrics.pauses[0].duration).toBeCloseTo(0.5, 1);
    expect(metrics.voicedSeconds).toBeGreaterThan(1.8);
    expect(metrics.averagePitchHz).toBeGreaterThan(190);
    expect(metrics.averagePitchHz).toBeLessThan(210);
  });

  it('measures clipping on the original samples', () => {
    expect(calculateClippingRatio(Float32Array.from([0, 0.98, -1, 0.5]))).toBeCloseTo(0.5);
  });
});
