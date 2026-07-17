import { describe, expect, it } from 'vitest';
import type { CoachFeedback } from '../types';
import {
  coachingSections,
  normalizeSpokenCoachPreferences,
  rankSpeechVoices,
  segmentCoachingSections,
  type SpeechVoiceLike,
} from './spokenCoach';

function voice(overrides: Partial<SpeechVoiceLike> & Pick<SpeechVoiceLike, 'name' | 'lang'>): SpeechVoiceLike {
  return {
    voiceURI: overrides.name,
    localService: true,
    default: false,
    ...overrides,
  };
}

const feedback: CoachFeedback = {
  summary: 'Your position was clear, but the pace made the reasoning difficult to follow.',
  strengths: [],
  improvements: [],
  weaknesses: [{
    title: 'Slow the pace',
    evidence: 'The measured pace was 195 words per minute.',
    whyItMatters: 'Listeners need time to separate the claims.',
    howToImprove: 'Pause once after every main claim.',
  }],
  provider: 'browser',
};

describe('spoken coaching helpers', () => {
  it('only returns matching local voices unless network access is enabled', () => {
    const voices = [
      voice({ name: 'English Local', lang: 'en-US' }),
      voice({ name: 'Bangla Local', lang: 'bn-BD' }),
      voice({ name: 'Bangla Network', lang: 'bn-BD', localService: false }),
    ];
    expect(rankSpeechVoices(voices, 'bn', '', false).map(({ name }) => name)).toEqual(['Bangla Local']);
    expect(rankSpeechVoices(voices, 'bn', '', true).map(({ name }) => name)).toEqual([
      'Bangla Local',
      'Bangla Network',
    ]);
  });

  it('keeps a saved voice first and otherwise prefers natural-quality hints', () => {
    const voices = [
      voice({ name: 'Saved British', lang: 'en-GB', voiceURI: 'saved' }),
      voice({ name: 'US Standard', lang: 'en-US' }),
      voice({ name: 'US Natural', lang: 'en-US' }),
      voice({ name: 'US Default', lang: 'en-US', default: true }),
      voice({ name: 'British Default', lang: 'en-GB', default: true }),
    ];
    expect(rankSpeechVoices(voices, 'en', 'saved', false).map(({ name }) => name)).toEqual([
      'Saved British',
      'US Natural',
      'US Default',
      'US Standard',
      'British Default',
    ]);
  });

  it('uses Bengali connectors and respects the Bengali sentence mark', () => {
    const sections = coachingSections(feedback, 'bn');
    expect(sections[1]).toContain('আপনার প্রথম অগ্রাধিকার');
    expect(sections[2]).toContain('কেন এটি গুরুত্বপূর্ণ');
    expect(sections[3]).toContain('পরেরবার চেষ্টা করুন');
    expect(sections.every((section) => /[.!?।]$/u.test(section))).toBe(true);
  });

  it('groups long coaching into natural, bounded speech chunks', () => {
    const segments = segmentCoachingSections(coachingSections(feedback, 'en'), 'en', 70);
    expect(segments.length).toBeGreaterThanOrEqual(4);
    expect(segments.every(({ text }) => text.length <= 70)).toBe(true);
    expect(segments.at(-1)?.pauseAfterMs).toBe(0);
    expect(segments.some(({ pauseAfterMs }) => pauseAfterMs === 220)).toBe(true);
  });

  it('clamps persisted prosody and keeps network access opt-in', () => {
    expect(normalizeSpokenCoachPreferences({ rate: 9, pitch: -1, allowNetworkVoices: 'yes' }, 'bn')).toEqual({
      voiceUri: '',
      rate: 1.1,
      pitch: 0.9,
      allowNetworkVoices: false,
    });
  });
});
