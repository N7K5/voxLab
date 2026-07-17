import { describe, expect, it } from 'vitest';
import type { AudioMetrics, ScoreBreakdown, TextMetrics, Topic } from '../types';
import { browserFeedback, browserHistorySummary, calculateScores } from './scoring';

const audio: AudioMetrics = {
  recordedDurationSeconds: 60,
  speakingSpanSeconds: 52,
  voicedSeconds: 40,
  silenceRatio: 0.2,
  initialSilenceSeconds: 1,
  trailingSilenceSeconds: 1,
  pauseCount: 4,
  longPauseCount: 1,
  averagePauseSeconds: 0.55,
  longestPauseSeconds: 1.1,
  pauses: [],
  averageVolumeDb: -20,
  volumeVariation: 4.5,
  clippingRatio: 0,
  averagePitchHz: 175,
  pitchVariationSemitones: 2.4,
};

const metrics: TextMetrics = {
  language: 'hi',
  wordCount: 95,
  wordsPerMinute: 105,
  uniqueWordRatio: 0.61,
  contentWordRatio: 0.5,
  fillerCount: 2,
  fillersPerMinute: 2.3,
  repeatedPhraseCount: 1,
  transitionCount: 4,
  transitionVariety: 3,
  reasoningMarkerCount: 2,
  exampleMarkerCount: 1,
  topicKeywordCoverage: 0.55,
  stanceSignal: 'aligned',
  hasOpening: true,
  hasConclusion: false,
  sentenceCount: 6,
  averageSentenceWords: 15,
  sentenceLengthVariation: 3,
};

const scores: ScoreBreakdown = {
  overall: 62,
  pacing: 80,
  fluency: 68,
  vocabulary: 72,
  delivery: 74,
  structure: 41,
  relevance: 65,
};

const topic: Topic = {
  id: 'hi-test',
  prompt: 'विद्यालयों को देर से शुरू होना चाहिए।',
  difficulty: 'easy',
  category: 'शिक्षा',
  language: 'hi',
};

describe('Hindi browser scoring and coaching', () => {
  it('uses the Hindi 100–160 WPM coaching range', () => {
    const hindi = calculateScores(audio, metrics);
    const english = calculateScores(audio, { ...metrics, language: 'en' });

    expect(hindi.pacing).toBeGreaterThan(english.pacing);
    expect(hindi.pacing).toBeGreaterThanOrEqual(90);
  });

  it('writes a metric-specific Hindi history summary', () => {
    const summary = browserHistorySummary(scores, audio, metrics, 'hi');

    expect(summary).toMatch(/[\u0900-\u097f]/u);
    expect(summary).toContain('संरचना');
    expect(summary).toContain('2');
    expect(summary).toContain('1');
    expect(summary).not.toContain('The core idea is there');
  });

  it('returns localized weaknesses, drills, topic strategy, and grounded cleanup', () => {
    const transcript = 'मैं इस प्रस्ताव के पक्ष में हूँ। उम, विद्यालय विद्यालय देर से शुरू होने चाहिए क्योंकि छात्रों को पर्याप्त नींद चाहिए।';
    const feedback = browserFeedback(scores, audio, metrics, { transcript, topic, stance: 'for' });

    expect(feedback.provider).toBe('browser');
    expect(feedback.language).toBe('hi');
    expect(feedback.summary).toMatch(/[\u0900-\u097f]/u);
    expect(feedback.weaknesses).toHaveLength(3);
    expect(feedback.improvements).toHaveLength(3);
    expect(feedback.weaknesses?.every((weakness) => /[\u0900-\u097f]/u.test(weakness.evidence))).toBe(true);
    expect(feedback.topicStrategy?.angles).toHaveLength(3);
    expect(feedback.topicStrategy?.nextOutline).toHaveLength(4);
    expect(feedback.reframes).toHaveLength(1);
    expect(transcript).toContain(feedback.reframes?.[0]?.original ?? 'missing');
    expect(feedback.reframes?.[0]?.revised).not.toContain('उम');
  });

  it('does not invent a semantic rewrite when no safe cleanup is available', () => {
    const transcript = 'मैं इस प्रस्ताव के पक्ष में हूँ क्योंकि पर्याप्त नींद से छात्र कक्षा में बेहतर ध्यान दे सकते हैं।';
    const feedback = browserFeedback(scores, audio, metrics, { transcript, topic, stance: 'for' });

    expect(feedback.reframes).toEqual([]);
  });

  it('safely collapses an immediately repeated Hindi word', () => {
    const transcript = 'विद्यालय विद्यालय देर से शुरू होने चाहिए क्योंकि छात्रों को पर्याप्त नींद चाहिए।';
    const feedback = browserFeedback(scores, audio, metrics, { transcript, topic, stance: 'for' });

    expect(feedback.reframes).toHaveLength(1);
    expect(feedback.reframes?.[0]?.original).toBe(transcript);
    expect(feedback.reframes?.[0]?.revised).toContain('विद्यालय देर से');
    expect(feedback.reframes?.[0]?.revised).not.toContain('विद्यालय विद्यालय');
  });

  it('does not collapse word prefixes or remove meaningful Hindi words', () => {
    const prefix = 'स्कूल स्कूली शिक्षा को बेहतर बना सकता है।';
    const meaningful = 'इसका मतलब शिक्षा सभी विद्यार्थियों के लिए ज़रूरी है।';

    expect(browserFeedback(scores, audio, metrics, { transcript: prefix, topic, stance: 'for' }).reframes).toEqual([]);
    expect(browserFeedback(scores, audio, metrics, { transcript: meaningful, topic, stance: 'for' }).reframes).toEqual([]);
  });

  it('describes an opposite-side result in Hindi with measured evidence', () => {
    const opposed = { ...metrics, stanceSignal: 'opposed' as const, topicKeywordCoverage: 0.42 };
    const summary = browserHistorySummary({ ...scores, overall: 45, relevance: 28 }, audio, opposed, 'hi');

    expect(summary).toContain('विपरीत');
    expect(summary).toContain('42%');
    expect(summary).toContain('स्कोर सीमित');
  });
});
