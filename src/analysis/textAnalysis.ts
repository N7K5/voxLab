import type { AudioMetrics, SpeechLanguage, Stance, TextMetrics, Topic } from '../types';

interface LanguageAnalysisProfile {
  locale: SpeechLanguage;
  stopWords: ReadonlySet<string>;
  transitions: readonly string[];
  reasoningMarkers: readonly string[];
  exampleMarkers: readonly string[];
  openings: readonly string[];
  conclusions: readonly string[];
  fillers: readonly string[];
  explicitSupport: readonly string[];
  explicitOpposition: readonly string[];
  positiveSignals: readonly string[];
  negativeSignals: readonly string[];
  negatedAffirmatives: readonly string[];
  negativeMotionMarkers: readonly string[];
}

const ENGLISH_PROFILE: LanguageAnalysisProfile = {
  locale: 'en',
  stopWords: new Set('a an and are as at be because been but by can do does for from had has have he her his i if in into is it its may more most my no not of on or our she should so than that the their them there they this to up us was we were what when where which who will with would you your'.split(' ')),
  transitions: ['first', 'second', 'third', 'however', 'therefore', 'because', 'for example', 'for instance', 'in addition', 'on the other hand', 'as a result', 'furthermore', 'finally'],
  reasoningMarkers: ['because', 'since', 'therefore', 'as a result', 'this means', 'which means', 'leads to', 'results in', 'the reason', 'due to', 'consequently'],
  exampleMarkers: ['for example', 'for instance', 'such as', 'consider', 'imagine', 'take the case', 'evidence', 'research', 'study', 'data shows'],
  openings: ['i believe', 'i think', 'my position', 'today i', 'the question', 'there are', 'let me'],
  conclusions: ['in conclusion', 'to conclude', 'to sum up', 'ultimately', 'for these reasons', 'that is why', 'overall'],
  fillers: ['you know', 'i mean', 'sort of', 'kind of', 'basically', 'actually', 'literally', 'um', 'uh', 'erm', 'like'],
  explicitSupport: ['i support', 'i agree', 'i am for', "i'm for", 'we should accept', 'this is a good idea'],
  explicitOpposition: ['i oppose', 'i disagree', 'i am against', "i'm against", 'we should reject', 'this is a bad idea'],
  positiveSignals: ['should', 'must', 'benefit', 'advantage', 'support', 'agree', 'better', 'important', 'good idea'],
  negativeSignals: ['should not', "shouldn't", 'must not', 'cannot support', 'harm', 'risk', 'disadvantage', 'oppose', 'disagree', 'worse', 'ban', 'prohibit'],
  negatedAffirmatives: ['should not', "shouldn't", 'must not'],
  negativeMotionMarkers: ['should not', 'should never', 'must not', 'be banned', 'be prohibited', 'be restricted', 'avoid', 'more harm than good'],
};

const BENGALI_PROFILE: LanguageAnalysisProfile = {
  locale: 'bn',
  stopWords: new Set('আমি আমরা তুমি তোমরা আপনি আপনার সে তারা এই ওই একটি এবং আর অথবা বা কিন্তু যে যা যদি তবে জন্য থেকে দ্বারা সঙ্গে মধ্যে উপর নিচে আছে ছিল হবে হয় হয় হতে করা করে করেন করি করব পারে পারেন উচিত না নয় নয় কি কী কেন কে কার তাদের আমাদের তার এর এটা এটি সেই তাই খুব আরও বেশি কম'.split(' ')),
  transitions: ['প্রথমত', 'দ্বিতীয়ত', 'তৃতীয়ত', 'তবে', 'অন্যদিকে', 'তাই', 'ফলে', 'উদাহরণস্বরূপ', 'উদাহরণ হিসেবে', 'এছাড়া', 'সুতরাং', 'অতএব', 'পরিশেষে', 'সবশেষে'],
  reasoningMarkers: ['কারণ', 'যেহেতু', 'তাই', 'ফলে', 'এর মানে', 'যার ফলে', 'এই কারণে', 'সুতরাং', 'অতএব'],
  exampleMarkers: ['উদাহরণস্বরূপ', 'উদাহরণ হিসেবে', 'যেমন', 'ধরা যাক', 'ভাবুন', 'প্রমাণ', 'গবেষণা', 'সমীক্ষা', 'তথ্য'],
  openings: ['আমি বিশ্বাস করি', 'আমি মনে করি', 'আমার অবস্থান', 'আজ আমি', 'প্রশ্নটি', 'আমি এই প্রস্তাবের', 'আমি প্রস্তাবটির'],
  conclusions: ['পরিশেষে', 'উপসংহারে', 'শেষ কথা', 'সব মিলিয়ে', 'এই কারণগুলোতে', 'সুতরাং', 'অতএব'],
  fillers: ['উম', 'উহ', 'এ্যা', 'মানে', 'আসলে', 'মূলত', 'বলতে গেলে', 'কি যেন'],
  explicitSupport: ['আমি এই প্রস্তাবের পক্ষে', 'আমি প্রস্তাবটির পক্ষে', 'আমি এই প্রস্তাব সমর্থন করি', 'আমি প্রস্তাবটি সমর্থন করি', 'আমি একমত', 'আমাদের এই প্রস্তাব গ্রহণ করা উচিত', 'এটি একটি ভালো ধারণা'],
  explicitOpposition: ['আমি এই প্রস্তাবের বিপক্ষে', 'আমি প্রস্তাবটির বিপক্ষে', 'আমি এই প্রস্তাবের বিরোধিতা করি', 'আমি প্রস্তাবটির বিরোধিতা করি', 'আমি একমত নই', 'আমি একমত নয়', 'আমাদের এই প্রস্তাব প্রত্যাখ্যান করা উচিত', 'এটি একটি খারাপ ধারণা'],
  positiveSignals: ['উচিত', 'অবশ্যই', 'উপকার', 'সুবিধা', 'লাভ', 'সমর্থন', 'একমত', 'পক্ষে', 'ভালো', 'উন্নতি', 'গুরুত্বপূর্ণ'],
  negativeSignals: ['উচিত নয়', 'উচিত নয়', 'সমর্থন করতে পারি না', 'ক্ষতি', 'ঝুঁকি', 'অসুবিধা', 'বিরোধিতা', 'বিপক্ষে', 'একমত নই', 'একমত নয়', 'খারাপ', 'নিষিদ্ধ', 'প্রত্যাখ্যান'],
  negatedAffirmatives: ['উচিত নয়', 'উচিত নয়', 'অবশ্যই নয়', 'অবশ্যই নয়', 'একমত নই', 'একমত নয়'],
  negativeMotionMarkers: ['উচিত নয়', 'উচিত নয়', 'কখনো উচিত নয়', 'কখনো উচিত নয়', 'নিষিদ্ধ করা উচিত', 'নিষিদ্ধ হওয়া উচিত', 'নিষিদ্ধ হওয়া উচিত', 'সীমিত করা উচিত', 'এড়ানো উচিত', 'এড়িয়ে চলা উচিত', 'লাভের চেয়ে ক্ষতি বেশি', 'লাভের চেয়ে ক্ষতি বেশি'],
};

const LANGUAGE_PROFILES: Record<SpeechLanguage, LanguageAnalysisProfile> = {
  en: ENGLISH_PROFILE,
  bn: BENGALI_PROFILE,
};

function tokenize(text: string, locale: SpeechLanguage = 'en'): string[] {
  return text.toLocaleLowerCase(locale).match(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)?/gu) ?? [];
}

function normalizedText(text: string, locale: SpeechLanguage): string {
  return tokenize(text, locale).join(' ');
}

function countPhrases(text: string, phrases: readonly string[], locale: SpeechLanguage = 'en'): number {
  const haystack = ` ${normalizedText(text, locale)} `;
  return phrases.reduce((total, phrase) => {
    const normalizedPhrase = normalizedText(phrase, locale);
    if (!normalizedPhrase) return total;
    const needle = ` ${normalizedPhrase} `;
    let count = 0;
    let offset = 0;
    while (offset < haystack.length) {
      const index = haystack.indexOf(needle, offset);
      if (index < 0) break;
      count += 1;
      offset = index + needle.length;
    }
    return total + count;
  }, 0);
}

function withoutPhrases(text: string, phrases: readonly string[], locale: SpeechLanguage): string {
  let normalized = ` ${normalizedText(text, locale)} `;
  for (const phrase of phrases) {
    const needle = ` ${normalizedText(phrase, locale)} `;
    if (needle.trim()) normalized = normalized.split(needle).join(' ');
  }
  return normalized;
}

function repeatedBigrams(words: string[], stopWords: ReadonlySet<string> = ENGLISH_PROFILE.stopWords): number {
  const counts = new Map<string, number>();
  for (let index = 0; index < words.length - 1; index += 1) {
    if (stopWords.has(words[index]) && stopWords.has(words[index + 1])) continue;
    const phrase = `${words[index]} ${words[index + 1]}`;
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function phraseVariety(text: string, phrases: readonly string[], locale: SpeechLanguage): number {
  return phrases.reduce((total, phrase) => total + (countPhrases(text, [phrase], locale) > 0 ? 1 : 0), 0);
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.sqrt(values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length);
}

function keywordRoot(word: string, language: SpeechLanguage = 'en'): string {
  if (language === 'bn') return word;
  if (word.length > 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 6 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function analyzeText(transcript: string, topic: Topic, stance: Stance, audio: AudioMetrics): TextMetrics {
  const language = topic.language ?? 'en';
  const profile = LANGUAGE_PROFILES[language] ?? ENGLISH_PROFILE;
  const words = tokenize(transcript, profile.locale);
  const contentWords = words.filter((word) => !profile.stopWords.has(word) && word.length > 2);
  const unique = new Set(contentWords);
  const topicKeywords = tokenize(topic.prompt, profile.locale).filter((word) => !profile.stopWords.has(word) && word.length > 2);
  const rootedTopicKeywords = new Set(topicKeywords.map((word) => keywordRoot(word, language)));
  const used = new Set(words.map((word) => keywordRoot(word, language)));
  const keywordHits = new Set([...rootedTopicKeywords].filter((word) => used.has(word))).size;
  // Speaking span includes internal pauses but excludes lead-in/trailing silence. Fall back to
  // the recording duration only when voice activity could not establish a usable span.
  const paceDuration = audio.speakingSpanSeconds >= 1
    ? audio.speakingSpanSeconds
    : Math.max(audio.recordedDurationSeconds, 1);
  const speakingMinutes = paceDuration / 60;
  const lower = transcript.toLocaleLowerCase(profile.locale);
  const explicitSupport = countPhrases(lower, profile.explicitSupport, profile.locale);
  const explicitOpposition = countPhrases(lower, profile.explicitOpposition, profile.locale);
  const negativeSignals = countPhrases(lower, profile.negativeSignals, profile.locale) + explicitOpposition * 2;
  const affirmativeText = withoutPhrases(lower, profile.negatedAffirmatives, profile.locale);
  const positiveSignals = countPhrases(affirmativeText, profile.positiveSignals, profile.locale) + explicitSupport * 2;
  const motionIsNegative = countPhrases(topic.prompt, profile.negativeMotionMarkers, profile.locale) > 0;
  // Generic positive/negative language maps reasonably to affirmative motions, but it
  // becomes ambiguous for motions that already contain a negation. For those motions,
  // the fast path only makes a decisive call from an explicit support/opposition statement.
  const supportsMotion = motionIsNegative ? explicitSupport * 3 : positiveSignals;
  const opposesMotion = motionIsNegative ? explicitOpposition * 3 : negativeSignals;
  const expectedSignals = stance === 'for' ? supportsMotion : opposesMotion;
  const contrarySignals = stance === 'for' ? opposesMotion : supportsMotion;
  const mixed = expectedSignals > 0 && contrarySignals > 0 && Math.abs(expectedSignals - contrarySignals) <= 1;
  const aligned = expectedSignals >= 2 && expectedSignals >= contrarySignals + 2;
  const opposed = contrarySignals >= 2 && contrarySignals >= expectedSignals + 2;
  const stanceSignal = words.length < 12 || keywordHits === 0 ? 'unclear' : mixed ? 'mixed' : aligned ? 'aligned' : opposed ? 'opposed' : 'unclear';
  const sentences = transcript.split(/[.!?।]+/u).map((part) => part.trim()).filter(Boolean);
  const sentenceLengths = sentences.map((sentence) => tokenize(sentence, profile.locale).length).filter(Boolean);
  const openingSlice = words.slice(0, 22).join(' ');
  const conclusionSlice = words.slice(-28).join(' ');
  const fillerCount = countPhrases(lower, profile.fillers, profile.locale);

  return {
    language,
    wordCount: words.length,
    wordsPerMinute: words.length / speakingMinutes,
    uniqueWordRatio: contentWords.length ? unique.size / contentWords.length : 0,
    contentWordRatio: words.length ? contentWords.length / words.length : 0,
    fillerCount,
    fillersPerMinute: fillerCount / speakingMinutes,
    repeatedPhraseCount: repeatedBigrams(words, profile.stopWords),
    transitionCount: countPhrases(lower, profile.transitions, profile.locale),
    transitionVariety: phraseVariety(lower, profile.transitions, profile.locale),
    reasoningMarkerCount: countPhrases(lower, profile.reasoningMarkers, profile.locale),
    exampleMarkerCount: countPhrases(lower, profile.exampleMarkers, profile.locale),
    topicKeywordCoverage: rootedTopicKeywords.size ? keywordHits / rootedTopicKeywords.size : 0,
    stanceSignal,
    stanceConfidence: stanceSignal === 'unclear' ? undefined : Math.min(0.95, 0.55 + Math.abs(expectedSignals - contrarySignals) * 0.08),
    stanceEngine: language === 'bn' ? 'Fast Bengali phrase signals' : 'Fast phrase signals',
    hasOpening: profile.openings.some((phrase) => countPhrases(openingSlice, [phrase], profile.locale) > 0),
    hasConclusion: profile.conclusions.some((phrase) => countPhrases(conclusionSlice, [phrase], profile.locale) > 0),
    sentenceCount: sentences.length || (words.length ? 1 : 0),
    averageSentenceWords: sentenceLengths.length ? sentenceLengths.reduce((total, length) => total + length, 0) / sentenceLengths.length : 0,
    sentenceLengthVariation: standardDeviation(sentenceLengths),
  };
}

export const textTestHelpers = { tokenize, countPhrases, repeatedBigrams, keywordRoot };
