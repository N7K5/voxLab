import { describe, expect, it } from 'vitest';
import type { AudioMetrics, Topic } from '../types';
import { browserFeedback, calculateScores } from './scoring';
import { analyzeText, textTestHelpers } from './textAnalysis';

const audio: AudioMetrics = {
  recordedDurationSeconds: 35,
  speakingSpanSeconds: 30,
  voicedSeconds: 26,
  silenceRatio: 0.18,
  initialSilenceSeconds: 1,
  trailingSilenceSeconds: 1,
  pauseCount: 3,
  longPauseCount: 0,
  averagePauseSeconds: 0.5,
  longestPauseSeconds: 0.7,
  pauses: [],
  averageVolumeDb: -20,
  volumeVariation: 5,
  clippingRatio: 0,
  averagePitchHz: 175,
  pitchVariationSemitones: 2.5,
};

const topic: Topic = {
  id: 'bn-test',
  prompt: 'স্কুলে আর্থিক শিক্ষা বাধ্যতামূলক হওয়া উচিত।',
  difficulty: 'easy',
  category: 'শিক্ষা',
  language: 'bn',
};

describe('Bengali text analysis', () => {
  it('keeps Bengali combining marks inside words and recognizes the danda as a sentence boundary', () => {
    expect(textTestHelpers.tokenize('বাংলা শিক্ষা প্রযুক্তি', 'bn')).toEqual(['বাংলা', 'শিক্ষা', 'প্রযুক্তি']);

    const metrics = analyzeText(
      'আমি এই প্রস্তাবের পক্ষে। স্কুলে আর্থিক শিক্ষা থাকা উচিত। পরিশেষে, এটি শিক্ষার্থীদের কাজে লাগবে।',
      topic,
      'for',
      audio,
    );
    expect(metrics.sentenceCount).toBe(3);
    expect(metrics.wordCount).toBeGreaterThan(12);
  });

  it('extracts Bengali fillers, transitions, reasoning, examples, openings, and conclusions', () => {
    const transcript = 'আমি এই প্রস্তাবের পক্ষে। প্রথমত, স্কুলে আর্থিক শিক্ষা বাধ্যতামূলক হওয়া উচিত কারণ এটি শিক্ষার্থীদের বাজেট করতে শেখায়। উম, উদাহরণস্বরূপ, তারা আয় ও ব্যয়ের হিসাব বুঝতে পারে। তাই এই শিক্ষা ভবিষ্যতের সমস্যা কমায়। পরিশেষে, স্কুলে আর্থিক শিক্ষা থাকা জরুরি।';
    const metrics = analyzeText(transcript, topic, 'for', audio);

    expect(metrics.fillerCount).toBe(1);
    expect(metrics.transitionVariety).toBeGreaterThanOrEqual(4);
    expect(metrics.reasoningMarkerCount).toBeGreaterThanOrEqual(2);
    expect(metrics.exampleMarkerCount).toBeGreaterThanOrEqual(1);
    expect(metrics.topicKeywordCoverage).toBeGreaterThan(0.6);
    expect(metrics.hasOpening).toBe(true);
    expect(metrics.hasConclusion).toBe(true);
    expect(metrics.stanceSignal).toBe('aligned');
  });

  it('marks an explicit Bengali opposite-side speech as opposed to the assigned side', () => {
    const transcript = 'আমি এই প্রস্তাবের বিপক্ষে। স্কুলে আর্থিক শিক্ষা বাধ্যতামূলক হওয়া উচিত নয়, কারণ সব শিক্ষার্থীর একই প্রয়োজন নেই। প্রথমত, স্কুলের সময় ইতিমধ্যে সীমিত। উদাহরণস্বরূপ, নতুন বিষয় যোগ করলে বিজ্ঞান শেখার সময় কমবে। তাই আর্থিক শিক্ষা বাধ্যতামূলক করা ঠিক নয়। পরিশেষে, পরিবার চাইলে আলাদাভাবে এই শিক্ষা দিতে পারে।';

    const opposed = analyzeText(transcript, topic, 'for', audio);
    const scores = calculateScores(audio, opposed);
    const feedback = browserFeedback(scores, audio, opposed, { transcript, topic, stance: 'for' });
    expect(opposed.stanceSignal).toBe('opposed');
    expect(scores.relevance).toBeLessThanOrEqual(28);
    expect(scores.overall).toBeLessThanOrEqual(45);
    expect(feedback.language).toBe('bn');
    expect(feedback.summary).toMatch(/[\u0980-\u09ff]/u);
    expect(feedback.reframes?.[0]?.original).toBeTruthy();
    expect(transcript).toContain(feedback.reframes?.[0]?.original ?? 'not found');
    expect(analyzeText(transcript, topic, 'against', audio).stanceSignal).toBe('aligned');
  });

  it('does not invert explicit opposition when the Bengali motion is negative', () => {
    const negativeTopic: Topic = {
      id: 'bn-negative',
      prompt: 'স্কুলে মোবাইল ফোন নিষিদ্ধ করা উচিত।',
      difficulty: 'medium',
      category: 'শিক্ষা',
      language: 'bn',
    };
    const transcript = 'আমি এই প্রস্তাবের বিপক্ষে। স্কুলে মোবাইল ফোন নিষিদ্ধ করা উচিত নয়, কারণ জরুরি সময়ে যোগাযোগ দরকার। শিক্ষকেরা স্পষ্ট নিয়ম তৈরি করতে পারেন। উদাহরণস্বরূপ, ক্লাসের সময় ফোন বন্ধ রাখা যায়। পরিশেষে, সম্পূর্ণ নিষেধাজ্ঞার বদলে নিয়ন্ত্রিত ব্যবহার ভালো।';

    expect(analyzeText(transcript, negativeTopic, 'against', audio).stanceSignal).toBe('aligned');
  });
});
