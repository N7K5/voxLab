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
      contentWordRatio: 0,
      fillerCount: 0,
      fillersPerMinute: 0,
      repeatedPhraseCount: 0,
      transitionCount: 0,
      transitionVariety: 0,
      reasoningMarkerCount: 0,
      exampleMarkerCount: 0,
      topicKeywordCoverage: 0,
      stanceSignal: 'unclear',
      hasOpening: false,
      hasConclusion: false,
      sentenceCount: 0,
      averageSentenceWords: 0,
      sentenceLengthVariation: 0,
    };
    expect(calculateScores({ ...audio, voicedSeconds: 0, speakingSpanSeconds: 0 }, text).delivery).toBe(0);
  });

  it('extracts reasoning, examples, transition variety, and sentence rhythm', () => {
    const transcript = 'I believe schools should teach financial literacy. First, students need it because money choices affect daily life. For example, a budget can prevent avoidable debt. Therefore, the subject belongs in school. In conclusion, practical finance should be part of education.';
    const metrics = analyzeText(transcript, topic, 'for', { ...audio, speakingSpanSeconds: 24, voicedSeconds: 20 });
    expect(metrics.reasoningMarkerCount).toBeGreaterThanOrEqual(2);
    expect(metrics.exampleMarkerCount).toBeGreaterThanOrEqual(1);
    expect(metrics.transitionVariety).toBeGreaterThanOrEqual(3);
    expect(metrics.averageSentenceWords).toBeGreaterThan(5);
    expect(metrics.topicKeywordCoverage).toBeGreaterThan(0.4);
  });

  it('keeps an average speech in the developing range', () => {
    const averageText: TextMetrics = {
      wordCount: 85,
      wordsPerMinute: 130,
      uniqueWordRatio: 0.61,
      contentWordRatio: 0.48,
      fillerCount: 3,
      fillersPerMinute: 4,
      repeatedPhraseCount: 2,
      transitionCount: 4,
      transitionVariety: 3,
      reasoningMarkerCount: 2,
      exampleMarkerCount: 1,
      topicKeywordCoverage: 0.4,
      stanceSignal: 'aligned',
      hasOpening: true,
      hasConclusion: false,
      sentenceCount: 5,
      averageSentenceWords: 17,
      sentenceLengthVariation: 3.5,
    };
    const scores = calculateScores({
      ...audio,
      speakingSpanSeconds: 45,
      voicedSeconds: 34,
      silenceRatio: 0.28,
      pauseCount: 6,
      longPauseCount: 2,
      averagePauseSeconds: 0.8,
      averageVolumeDb: -20,
      volumeVariation: 4,
      pitchVariationSemitones: 1.7,
    }, averageText);
    expect(scores.overall).toBeGreaterThanOrEqual(55);
    expect(scores.overall).toBeLessThanOrEqual(72);
  });

  it('reserves the strongest band for sustained evidence', () => {
    const strongText: TextMetrics = {
      wordCount: 115,
      wordsPerMinute: 145,
      uniqueWordRatio: 0.72,
      contentWordRatio: 0.55,
      fillerCount: 0,
      fillersPerMinute: 0.5,
      repeatedPhraseCount: 0,
      transitionCount: 7,
      transitionVariety: 5,
      reasoningMarkerCount: 4,
      exampleMarkerCount: 2,
      topicKeywordCoverage: 0.75,
      stanceSignal: 'aligned',
      hasOpening: true,
      hasConclusion: true,
      sentenceCount: 7,
      averageSentenceWords: 16,
      sentenceLengthVariation: 4,
    };
    const scores = calculateScores({
      ...audio,
      speakingSpanSeconds: 50,
      voicedSeconds: 42,
      silenceRatio: 0.16,
      pauseCount: 5,
      longPauseCount: 0,
      averagePauseSeconds: 0.65,
      averageVolumeDb: -20,
      volumeVariation: 8,
      pitchVariationSemitones: 4,
    }, strongText);
    expect(scores.overall).toBeGreaterThanOrEqual(82);
    expect(scores.overall).toBeLessThan(92);
  });

  it('caps polished but very short answers because evidence is limited', () => {
    const shortText: TextMetrics = {
      wordCount: 15,
      wordsPerMinute: 145,
      uniqueWordRatio: 0.9,
      contentWordRatio: 0.65,
      fillerCount: 0,
      fillersPerMinute: 0,
      repeatedPhraseCount: 0,
      transitionCount: 3,
      transitionVariety: 3,
      reasoningMarkerCount: 2,
      exampleMarkerCount: 1,
      topicKeywordCoverage: 1,
      stanceSignal: 'aligned',
      hasOpening: true,
      hasConclusion: true,
      sentenceCount: 3,
      averageSentenceWords: 5,
      sentenceLengthVariation: 1,
    };
    const scores = calculateScores({ ...audio, speakingSpanSeconds: 6.2, voicedSeconds: 5 }, shortText);
    expect(scores.overall).toBeLessThanOrEqual(45);
  });

  it('accepts Ollama host, API-base, and full chat endpoint forms', () => {
    expect(ollamaChatEndpoint('http://localhost:11434')).toBe('http://localhost:11434/api/chat');
    expect(ollamaChatEndpoint('http://localhost:11434/api/')).toBe('http://localhost:11434/api/chat');
    expect(ollamaChatEndpoint('http://localhost:11434/api/chat')).toBe('http://localhost:11434/api/chat');
  });
});
