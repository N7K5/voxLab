import type { AudioMetrics, PauseEvent } from '../types';

const FRAME_SECONDS = 0.02;
const MIN_PAUSE_SECONDS = 0.3;
const LONG_PAUSE_SECONDS = 1.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(clamp(ratio, 0, 1) * (sorted.length - 1))];
}

function rms(input: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let index = start; index < end; index += 1) sum += input[index] ** 2;
  return Math.sqrt(sum / Math.max(1, end - start));
}

export function calculateClippingRatio(input: Float32Array, threshold = 0.98): number {
  if (!input.length) return 0;
  let clipped = 0;
  for (const sample of input) if (Math.abs(sample) >= threshold) clipped += 1;
  return clipped / input.length;
}

function estimatePitch(input: Float32Array, start: number, sampleRate: number): number | null {
  const windowSize = Math.min(Math.floor(sampleRate * 0.04), input.length - start);
  if (windowSize < 320) return null;
  const minLag = Math.floor(sampleRate / 450);
  const maxLag = Math.min(Math.floor(sampleRate / 70), windowSize - 2);
  let localMean = 0;
  for (let index = 0; index < windowSize; index += 1) localMean += input[start + index];
  localMean /= windowSize;

  let bestLag = 0;
  let bestCorrelation = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let numerator = 0;
    let energyA = 0;
    let energyB = 0;
    const count = windowSize - lag;
    for (let index = 0; index < count; index += 2) {
      const a = input[start + index] - localMean;
      const b = input[start + index + lag] - localMean;
      numerator += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const correlation = numerator / Math.sqrt(energyA * energyB + 1e-12);
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }
  return bestCorrelation >= 0.62 && bestLag ? sampleRate / bestLag : null;
}

export async function analyzeAudio(input: Float32Array, sampleRate = 16_000): Promise<AudioMetrics> {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError('The audio sample rate must be positive.');
  const frameSize = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
  const frameRms: number[] = [];
  const frameStarts: number[] = [];
  const frameEnds: number[] = [];
  for (let start = 0; start < input.length; start += frameSize) {
    const end = Math.min(input.length, start + frameSize);
    frameStarts.push(start);
    frameEnds.push(end);
    frameRms.push(rms(input, start, end));
  }

  const noiseFloor = percentile(frameRms, 0.2);
  const highLevel = percentile(frameRms, 0.9);
  const threshold = clamp(Math.max(0.006, noiseFloor * 2.7, highLevel * 0.08), 0.006, 0.035);
  const rawVoiced = frameRms.map((value) => value >= threshold);

  // Fill very short gaps, then discard isolated clicks.
  const voiced = [...rawVoiced];
  for (let index = 1; index < voiced.length - 1; index += 1) {
    if (!voiced[index] && voiced[index - 1] && voiced[index + 1]) voiced[index] = true;
  }
  for (let index = 0; index < voiced.length; index += 1) {
    if (!voiced[index]) continue;
    let end = index;
    while (end < voiced.length && voiced[end]) end += 1;
    if ((end - index) * FRAME_SECONDS < 0.08) voiced.fill(false, index, end);
    index = end;
  }

  const firstVoiced = voiced.indexOf(true);
  const lastVoiced = voiced.lastIndexOf(true);
  const totalDuration = input.length / sampleRate;
  const initialSilence = firstVoiced < 0 ? totalDuration : frameStarts[firstVoiced] / sampleRate;
  const trailingSilence = lastVoiced < 0 ? 0 : Math.max(0, totalDuration - frameEnds[lastVoiced] / sampleRate);
  const voicedSeconds = voiced.reduce(
    (total, isVoiced, index) => total + (isVoiced ? (frameEnds[index] - frameStarts[index]) / sampleRate : 0),
    0,
  );
  const speakingSpan = firstVoiced < 0
    ? 0
    : Math.max(0, (frameEnds[lastVoiced] - frameStarts[firstVoiced]) / sampleRate);

  const pauses: PauseEvent[] = [];
  if (firstVoiced >= 0) {
    let index = firstVoiced;
    while (index <= lastVoiced) {
      if (voiced[index]) {
        index += 1;
        continue;
      }
      const start = index;
      while (index <= lastVoiced && !voiced[index]) index += 1;
      const pauseStart = frameStarts[start] / sampleRate;
      const pauseEnd = frameEnds[index - 1] / sampleRate;
      const duration = pauseEnd - pauseStart;
      if (duration >= MIN_PAUSE_SECONDS) {
        pauses.push({ start: pauseStart, end: pauseEnd, duration });
      }
    }
  }

  const voicedDb = frameRms
    .filter((_, index) => voiced[index])
    .map((value) => 20 * Math.log10(Math.max(value, 1e-7)));
  const pitches: number[] = [];
  const pitchStep = Math.round(sampleRate * 0.1);
  for (let start = 0, counter = 0; start < input.length; start += pitchStep, counter += 1) {
    const voiceFrame = Math.floor(start / frameSize);
    const pitchWindowEnd = Math.min(voiced.length, Math.ceil((start + sampleRate * 0.04) / frameSize));
    const pitchWindow = voiced.slice(voiceFrame, pitchWindowEnd);
    const voicedShare = pitchWindow.length ? pitchWindow.filter(Boolean).length / pitchWindow.length : 0;
    if (voicedShare >= 0.75) {
      const pitch = estimatePitch(input, start, sampleRate);
      if (pitch) pitches.push(pitch);
    }
    if (counter > 0 && counter % 80 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const initialMedianPitch = percentile(pitches, 0.5);
  // Autocorrelation can occasionally choose an octave harmonic. Remove only those large
  // outliers while preserving the normal expressive range of speech.
  const stablePitches = initialMedianPitch
    ? pitches.filter((pitch) => Math.abs(12 * Math.log2(pitch / initialMedianPitch)) <= 10)
    : [];
  const medianPitch = percentile(stablePitches, 0.5);
  const pitchSemitones = medianPitch
    ? stablePitches.map((pitch) => 12 * Math.log2(pitch / medianPitch))
    : [];

  return {
    recordedDurationSeconds: totalDuration,
    speakingSpanSeconds: speakingSpan,
    voicedSeconds,
    silenceRatio: speakingSpan ? clamp((speakingSpan - voicedSeconds) / speakingSpan, 0, 1) : 1,
    initialSilenceSeconds: initialSilence,
    trailingSilenceSeconds: trailingSilence,
    pauseCount: pauses.length,
    longPauseCount: pauses.filter((pause) => pause.duration >= LONG_PAUSE_SECONDS).length,
    averagePauseSeconds: mean(pauses.map((pause) => pause.duration)),
    longestPauseSeconds: pauses.length ? Math.max(...pauses.map((pause) => pause.duration)) : 0,
    pauses,
    averageVolumeDb: voicedDb.length ? mean(voicedDb) : -100,
    volumeVariation: standardDeviation(voicedDb),
    clippingRatio: calculateClippingRatio(input),
    averagePitchHz: stablePitches.length ? mean(stablePitches) : null,
    pitchVariationSemitones: stablePitches.length >= 3 ? standardDeviation(pitchSemitones) : null,
  };
}
