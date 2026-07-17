import { describe, expect, it } from 'vitest';
import type { AudioMetrics, TextMetrics, Topic } from '../types';
import { ollamaChatEndpoint } from './ollamaCoach';
import { calculateScores } from './scoring';
import { analyzeText } from './textAnalysis';

const audio: AudioMetrics = {
  recordedDurationSeconds: 60,
  speakingSpanSeconds: 10,
  voicedSeconds: 8,
  silenceRatio: 0.2,
  initialSilenceSeconds: 25,
  trailingSilenceSeconds: 25,
  pauseCount: 1,
  longPauseCount: 0,
  averagePauseSeconds: 0.5,
  longestPauseSeconds: 0.5,
  pauses: [{ start: 4, end: 4.5, duration: 0.5 }],
  averageVolumeDb: -20,
  volumeVariation: 4,
  clippingRatio: 0,
  averagePitchHz: 180,
  pitchVariationSemitones: 1.5,
};

const topic: Topic = {
  id: 'test',
  prompt: 'Schools should teach financial literacy',
  difficulty: 'easy',
  category: 'Education',
};

describe('analysis helpers', () => {
  it('uses the measured speaking span for pause-inclusive pace', () => {
    const transcript = Array.from({ length: 60 }, () => 'education').join(' ');
    expect(analyzeText(transcript, topic, 'for', audio).wordsPerMinute).toBeCloseTo(360);
  });

  it('does not award vocal delivery points when no voice was measured', () => {
    const text: TextMetrics = {
      wordCount: 0,
      wordsPerMinute: 0,
      uniqueWordRatio: 0,
      fillerCount: 0,
      fillersPerMinute: 0,
      repeatedPhraseCount: 0,
      transitionCount: 0,
      topicKeywordCoverage: 0,
      stanceSignal: 'unclear',
      hasOpening: false,
      hasConclusion: false,
      sentenceCount: 0,
    };
    expect(calculateScores({ ...audio, voicedSeconds: 0, speakingSpanSeconds: 0 }, text).delivery).toBe(0);
  });

  it('accepts Ollama host, API-base, and full chat endpoint forms', () => {
    expect(ollamaChatEndpoint('http://localhost:11434')).toBe('http://localhost:11434/api/chat');
    expect(ollamaChatEndpoint('http://localhost:11434/api/')).toBe('http://localhost:11434/api/chat');
    expect(ollamaChatEndpoint('http://localhost:11434/api/chat')).toBe('http://localhost:11434/api/chat');
  });
});
