import type { CoachFeedback, SpeechLanguage } from '../types';

export interface SpeechVoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

export interface SpokenCoachPreferences {
  voiceUri: string;
  rate: number;
  pitch: number;
  allowNetworkVoices: boolean;
}

export interface SpeechSegment {
  text: string;
  pauseAfterMs: number;
}

const QUALITY_HINTS: Array<[RegExp, number]> = [
  [/\bnatural\b/i, 5_000],
  [/\bneural\b/i, 4_500],
  [/\bpremium\b/i, 4_000],
  [/\benhanced\b/i, 3_500],
  [/\bhigh quality\b/i, 3_000],
];

export function speechLocale(language: SpeechLanguage): 'en-US' | 'bn-BD' | 'hi-IN' {
  if (language === 'bn') return 'bn-BD';
  if (language === 'hi') return 'hi-IN';
  return 'en-US';
}

export function languageLabel(language: SpeechLanguage): string {
  if (language === 'bn') return 'Bangla';
  if (language === 'hi') return 'Hindi';
  return 'English';
}

export function defaultSpokenCoachPreferences(language: SpeechLanguage): SpokenCoachPreferences {
  return {
    voiceUri: '',
    rate: language === 'en' ? 0.95 : 0.9,
    pitch: 1,
    allowNetworkVoices: false,
  };
}

export function normalizeSpokenCoachPreferences(
  value: unknown,
  language: SpeechLanguage,
): SpokenCoachPreferences {
  const defaults = defaultSpokenCoachPreferences(language);
  if (!value || typeof value !== 'object') return defaults;
  const candidate = value as Partial<SpokenCoachPreferences>;
  const rate = typeof candidate.rate === 'number' && Number.isFinite(candidate.rate)
    ? Math.min(1.1, Math.max(0.8, candidate.rate))
    : defaults.rate;
  const pitch = typeof candidate.pitch === 'number' && Number.isFinite(candidate.pitch)
    ? Math.min(1.1, Math.max(0.9, candidate.pitch))
    : defaults.pitch;
  return {
    voiceUri: typeof candidate.voiceUri === 'string' && candidate.voiceUri.length <= 1_000
      ? candidate.voiceUri
      : '',
    rate,
    pitch,
    allowNetworkVoices: candidate.allowNetworkVoices === true,
  };
}

export function spokenCoachPreferencesKey(language: SpeechLanguage): string {
  return `voxlab.spokenCoach.v2.${language}`;
}

function baseLanguage(tag: string): string {
  return tag.trim().toLocaleLowerCase().split(/[-_]/)[0] ?? '';
}

function normalizedTag(tag: string): string {
  return tag.trim().replace(/_/g, '-').toLocaleLowerCase();
}

export function matchesSpeechLanguage(voice: SpeechVoiceLike, language: SpeechLanguage): boolean {
  return baseLanguage(voice.lang) === language;
}

function qualityScore(voice: SpeechVoiceLike): number {
  return QUALITY_HINTS.reduce(
    (score, [pattern, value]) => Math.max(score, pattern.test(voice.name) ? value : 0),
    0,
  );
}

export function rankSpeechVoices<T extends SpeechVoiceLike>(
  voices: readonly T[],
  language: SpeechLanguage,
  savedVoiceUri: string,
  allowNetworkVoices: boolean,
): T[] {
  const locale = normalizedTag(speechLocale(language));
  const score = (voice: T) => {
    const saved = voice.voiceURI === savedVoiceUri ? 1_000_000 : 0;
    const exactLanguage = normalizedTag(voice.lang) === locale ? 1_000 : 0;
    const defaultForLanguage = voice.default ? 500 : 0;
    const quality = qualityScore(voice);
    const localTieBreak = voice.localService ? 5 : 0;
    return saved + quality + exactLanguage + defaultForLanguage + localTieBreak;
  };

  return voices
    .filter((voice) => matchesSpeechLanguage(voice, language))
    .filter((voice) => allowNetworkVoices || voice.localService)
    .map((voice, index) => ({ voice, index, score: score(voice) }))
    .sort((left, right) => right.score - left.score
      || left.voice.name.localeCompare(right.voice.name)
      || left.index - right.index)
    .map(({ voice }) => voice);
}

export function preferredVoiceForNetworkAccess<T extends SpeechVoiceLike>(
  voices: readonly T[],
  language: SpeechLanguage,
  allowNetworkVoices: boolean,
): T | undefined {
  const ranked = rankSpeechVoices(voices, language, '', allowNetworkVoices);
  return allowNetworkVoices
    ? ranked.find((voice) => !voice.localService)
    : ranked[0];
}

function terminal(text: string, language: SpeechLanguage): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned || /[.!?।]$/u.test(cleaned)) return cleaned;
  return `${cleaned}${language === 'en' ? '.' : '।'}`;
}

export function coachingSections(feedback: CoachFeedback, language: SpeechLanguage): string[] {
  const weakness = feedback.weaknesses?.[0];
  const improvement = feedback.improvements[0];
  const sections = [terminal(feedback.summary, language)];

  if (weakness) {
    const firstPriority = language === 'bn'
      ? `আপনার প্রথম অগ্রাধিকার: ${weakness.title}`
      : language === 'hi'
        ? `आपकी पहली प्राथमिकता: ${weakness.title}`
        : `Your first priority: ${weakness.title}`;
    const whyItMatters = language === 'bn'
      ? `কেন এটি গুরুত্বপূর্ণ: ${weakness.whyItMatters}`
      : language === 'hi'
        ? `यह क्यों महत्वपूर्ण है: ${weakness.whyItMatters}`
        : `Why this matters: ${weakness.whyItMatters}`;
    const nextTime = language === 'bn'
      ? `পরেরবার চেষ্টা করুন: ${weakness.howToImprove}`
      : language === 'hi'
        ? `अगली बार यह आज़माएँ: ${weakness.howToImprove}`
        : `Next time, try this: ${weakness.howToImprove}`;
    sections.push(terminal(firstPriority, language));
    sections.push(terminal(whyItMatters, language));
    sections.push(terminal(nextTime, language));
  } else if (improvement) {
    sections.push(terminal(
      language === 'bn'
        ? `আপনার প্রথম অগ্রাধিকার: ${improvement.title}`
        : language === 'hi'
          ? `आपकी पहली प्राथमिकता: ${improvement.title}`
          : `Your first priority: ${improvement.title}`,
      language,
    ));
    sections.push(terminal(improvement.detail, language));
    sections.push(terminal(
      language === 'bn'
        ? `এবার এটি চেষ্টা করুন: ${improvement.drill}`
        : language === 'hi'
          ? `अब यह आज़माएँ: ${improvement.drill}`
          : `Try this: ${improvement.drill}`,
      language,
    ));
  } else {
    sections.push(language === 'bn'
      ? 'একটি দুর্বলতা বেছে নিন, তারপর একটি পরিবর্তনসহ বক্তব্যটি আবার বলুন।'
      : language === 'hi'
        ? 'एक मापी गई कमज़ोरी चुनें, फिर एक जानबूझकर बदलाव के साथ भाषण दोहराएँ।'
        : 'Choose one measured weakness, then repeat the speech with one deliberate change.');
  }

  return sections.filter(Boolean);
}

function sentences(text: string, language: SpeechLanguage): string[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(speechLocale(language), { granularity: 'sentence' });
    const segmented = Array.from(segmenter.segment(text), ({ segment }) => segment.trim()).filter(Boolean);
    if (segmented.length) return segmented;
  }
  return text.match(/[^.!?।]+[.!?।]*/gu)?.map((part) => part.trim()).filter(Boolean) ?? [text];
}

function splitLongText(text: string, maximumCharacters: number): string[] {
  if (text.length <= maximumCharacters) return [text];
  const words = text.split(/\s+/u).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maximumCharacters) {
      current = `${current} ${word}`;
    } else {
      chunks.push(current);
      current = word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function segmentCoachingSections(
  sections: readonly string[],
  language: SpeechLanguage,
  maximumCharacters = 210,
): SpeechSegment[] {
  const pieces = sections.flatMap((section) => sentences(section, language))
    .flatMap((sentence) => splitLongText(sentence, maximumCharacters));
  const grouped: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (!current) current = piece;
    else if (`${current} ${piece}`.length <= maximumCharacters) current = `${current} ${piece}`;
    else {
      grouped.push(current);
      current = piece;
    }
  }
  if (current) grouped.push(current);
  const result = grouped.map((text) => ({ text, pauseAfterMs: 220 }));
  if (result.length) result[result.length - 1].pauseAfterMs = 0;
  return result;
}

export function previewText(language: SpeechLanguage): string {
  if (language === 'bn') {
    return 'এটি আপনার কোচিং কণ্ঠস্বর। স্পষ্টভাবে বলুন, তারপর মূল কথার পরে একটু বিরতি দিন।';
  }
  if (language === 'hi') {
    return 'यह आपकी कोचिंग की आवाज़ है। साफ़ बोलें, फिर मुख्य बात के बाद थोड़ा रुकें।';
  }
  return 'This is your coaching voice. Speak clearly, then let the key point breathe.';
}
