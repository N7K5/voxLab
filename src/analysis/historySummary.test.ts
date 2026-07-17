import { describe, expect, it } from 'vitest';
import type { AudioMetrics, ScoreBreakdown, TextMetrics } from '../types';
import { browserHistorySummary } from './scoring';

const audio: AudioMetrics = {
  recordedDurationSeconds: 60,
  speakingSpanSeconds: 45,
  voicedSeconds: 38,
  silenceRatio: 0.2,
  initialSilenceSeconds: 1,
  trailingSilenceSeconds: 1,
  pauseCount: 4,
  longPauseCount: 1,
  averagePauseSeconds: 0.6,
  longestPauseSeconds: 1.1,
  pauses: [],
  averageVolumeDb: -20,
  volumeVariation: 5,
  clippingRatio: 0,
  averagePitchHz: 170,
  pitchVariationSemitones: 2.5,
};

const text: TextMetrics = {
  language: 'en',
  wordCount: 90,
  wordsPerMinute: 120,
  uniqueWordRatio: 0.64,
  contentWordRatio: 0.5,
  fillerCount: 2,
  fillersPerMinute: 2.5,
  repeatedPhraseCount: 1,
  transitionCount: 3,
  transitionVariety: 2,
  reasoningMarkerCount: 2,
  exampleMarkerCount: 1,
  topicKeywordCoverage: 0.5,
  stanceSignal: 'aligned',
  hasOpening: true,
  hasConclusion: false,
  sentenceCount: 5,
  averageSentenceWords: 18,
  sentenceLengthVariation: 3,
};

const baseScores: ScoreBreakdown = {
  overall: 64,
  pacing: 78,
  fluency: 72,
  vocabulary: 70,
  delivery: 69,
  structure: 66,
  relevance: 75,
};

describe('browser history summary', () => {
  it('uses the actual weakest category instead of a score-band template', () => {
    const pacing = browserHistorySummary({ ...baseScores, pacing: 35, structure: 72 }, audio, { ...text, wordsPerMinute: 205 });
    const structure = browserHistorySummary({ ...baseScores, pacing: 80, structure: 31 }, audio, { ...text, reasoningMarkerCount: 0, exampleMarkerCount: 0 });

    expect(pacing).toContain('205 WPM');
    expect(structure).toContain('0 reasoning');
    expect(pacing).not.toBe(structure);
    expect(pacing).not.toContain('The core idea is there');
  });

  it('calls out an opposed assigned side explicitly', () => {
    const summary = browserHistorySummary(baseScores, audio, { ...text, stanceSignal: 'opposed' });
    expect(summary).toContain('opposite assigned side');
  });
});
