import { describe, expect, it } from 'vitest';
import type { CoachFeedback } from '../types';
import {
  coachingSections,
  isNoveltySpeechVoice,
  languageLabel,
  MAX_CURATED_SPEECH_VOICES,
  normalizeSpokenCoachPreferences,
  preferredVoiceForNetworkAccess,
  previewText,
  rankSpeechVoices,
  resolveSelectedSpeechVoice,
  segmentCoachingSections,
  speechLocale,
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
    ]);
  });

  it('filters novelty voices and exposes no more than three clear alternatives', () => {
    const voices = [
      voice({ name: 'Bubbles', lang: 'en-US', voiceURI: 'saved-bubbles' }),
      voice({ name: 'Zarvox', lang: 'en-US' }),
      voice({ name: 'Samantha', lang: 'en-US' }),
      voice({ name: 'Microsoft Aria Natural', lang: 'en-US' }),
      voice({ name: 'Google US English', lang: 'en-US' }),
      voice({ name: 'English Standard One', lang: 'en-US' }),
      voice({ name: 'English Standard Two', lang: 'en-US' }),
    ];

    const ranked = rankSpeechVoices(voices, 'en', 'saved-bubbles', false);
    expect(isNoveltySpeechVoice(voices[0])).toBe(true);
    expect(ranked).toHaveLength(MAX_CURATED_SPEECH_VOICES);
    expect(ranked.map(({ name }) => name)).toEqual([
      'Microsoft Aria Natural',
      'Samantha',
      'Google US English',
    ]);
    expect(ranked.some(({ name }) => name === 'Bubbles' || name === 'Zarvox')).toBe(false);
  });

  it('uses system default when a stored voice is empty, unavailable, or filtered', () => {
    const voices = rankSpeechVoices([
      voice({ name: 'Samantha', lang: 'en-US', voiceURI: 'samantha' }),
      voice({ name: 'Bubbles', lang: 'en-US', voiceURI: 'bubbles' }),
    ], 'en', '', false);

    expect(resolveSelectedSpeechVoice(voices, '')).toBeNull();
    expect(resolveSelectedSpeechVoice(voices, 'missing')).toBeNull();
    expect(resolveSelectedSpeechVoice(voices, 'bubbles')).toBeNull();
    expect(resolveSelectedSpeechVoice(voices, 'samantha')?.name).toBe('Samantha');
    expect(resolveSelectedSpeechVoice([], '')).toBeNull();
  });

  it('uses the standard Hindi locale and accepts browser network Hindi voices', () => {
    const voices = [
      voice({ name: 'Hindi Local', lang: 'hi-IN' }),
      voice({ name: 'Browser Hindi', lang: 'hi_IN', localService: false }),
      voice({ name: 'Bangla Local', lang: 'bn-IN' }),
    ];

    expect(speechLocale('hi')).toBe('hi-IN');
    expect(languageLabel('hi')).toBe('Hindi');
    expect(rankSpeechVoices(voices, 'hi', '', false).map(({ name }) => name)).toEqual(['Hindi Local']);
    expect(rankSpeechVoices(voices, 'hi', '', true).map(({ name }) => name)).toEqual([
      'Hindi Local',
      'Browser Hindi',
    ]);
  });

  it('switches explicitly between the best network and on-device voices', () => {
    const voices = [
      voice({ name: 'Hindi Local', lang: 'hi-IN', default: true }),
      voice({ name: 'Hindi Browser Standard', lang: 'hi-IN', localService: false }),
      voice({ name: 'Hindi Browser Neural', lang: 'hi-IN', localService: false }),
    ];

    expect(preferredVoiceForNetworkAccess(voices, 'hi', true)?.name).toBe('Hindi Browser Neural');
    expect(preferredVoiceForNetworkAccess(voices, 'hi', false)?.name).toBe('Hindi Local');
  });

  it('uses Bengali connectors and respects the Bengali sentence mark', () => {
    const sections = coachingSections(feedback, 'bn');
    expect(sections[1]).toContain('আপনার প্রথম অগ্রাধিকার');
    expect(sections[2]).toContain('কেন এটি গুরুত্বপূর্ণ');
    expect(sections[3]).toContain('পরেরবার চেষ্টা করুন');
    expect(sections.every((section) => /[.!?।]$/u.test(section))).toBe(true);
  });

  it('uses Hindi connectors, preview copy, and the Devanagari sentence mark', () => {
    const sections = coachingSections(feedback, 'hi');
    expect(sections[1]).toContain('आपकी पहली प्राथमिकता');
    expect(sections[2]).toContain('यह क्यों महत्वपूर्ण है');
    expect(sections[3]).toContain('अगली बार यह आज़माएँ');
    expect(sections.every((section) => /[.!?।]$/u.test(section))).toBe(true);
    expect(previewText('hi')).toContain('कोचिंग');
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
