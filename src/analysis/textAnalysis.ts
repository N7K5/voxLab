import type { AudioMetrics, Stance, TextMetrics, Topic } from '../types';

const STOP_WORDS = new Set('a an and are as at be because been but by can do does for from had has have he her his i if in into is it its may more most my no not of on or our she should so than that the their them there they this to up us was we were what when where which who will with would you your'.split(' '));
const TRANSITIONS = ['first', 'second', 'third', 'however', 'therefore', 'because', 'for example', 'for instance', 'in addition', 'on the other hand', 'as a result', 'furthermore', 'finally'];
const REASONING_MARKERS = ['because', 'since', 'therefore', 'as a result', 'this means', 'which means', 'leads to', 'results in', 'the reason', 'due to', 'consequently'];
const EXAMPLE_MARKERS = ['for example', 'for instance', 'such as', 'consider', 'imagine', 'take the case', 'evidence', 'research', 'study', 'data shows'];
const OPENINGS = ['i believe', 'i think', 'my position', 'today i', 'the question', 'there are', 'let me'];
const CONCLUSIONS = ['in conclusion', 'to conclude', 'to sum up', 'ultimately', 'for these reasons', 'that is why', 'overall'];
const FILLERS = ['you know', 'i mean', 'sort of', 'kind of', 'basically', 'actually', 'literally', 'um', 'uh', 'erm', 'like'];

function tokenize(text: string): string[] {
  return text.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [];
}

function countPhrases(text: string, phrases: string[]): number {
  const normalized = ` ${text.toLocaleLowerCase().replace(/[^\p{L}\p{N}'’]+/gu, ' ')} `;
  return phrases.reduce((total, phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return total + (normalized.match(new RegExp(`\\b${escaped}\\b`, 'g'))?.length ?? 0);
  }, 0);
}

function repeatedBigrams(words: string[]): number {
  const counts = new Map<string, number>();
  for (let index = 0; index < words.length - 1; index += 1) {
    if (STOP_WORDS.has(words[index]) && STOP_WORDS.has(words[index + 1])) continue;
    const phrase = `${words[index]} ${words[index + 1]}`;
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function phraseVariety(text: string, phrases: string[]): number {
  return phrases.reduce((total, phrase) => total + (countPhrases(text, [phrase]) > 0 ? 1 : 0), 0);
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.sqrt(values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length);
}

function keywordRoot(word: string): string {
  if (word.length > 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 6 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function analyzeText(transcript: string, topic: Topic, stance: Stance, audio: AudioMetrics): TextMetrics {
  const words = tokenize(transcript);
  const contentWords = words.filter((word) => !STOP_WORDS.has(word) && word.length > 2);
  const unique = new Set(contentWords);
  const topicKeywords = tokenize(topic.prompt).filter((word) => !STOP_WORDS.has(word) && word.length > 2);
  const rootedTopicKeywords = new Set(topicKeywords.map(keywordRoot));
  const used = new Set(words.map(keywordRoot));
  const keywordHits = new Set([...rootedTopicKeywords].filter((word) => used.has(word))).size;
  // Speaking span includes internal pauses but excludes lead-in/trailing silence. Fall back to
  // the recording duration only when voice activity could not establish a usable span.
  const paceDuration = audio.speakingSpanSeconds >= 1
    ? audio.speakingSpanSeconds
    : Math.max(audio.recordedDurationSeconds, 1);
  const speakingMinutes = paceDuration / 60;
  const lower = transcript.toLocaleLowerCase();
  const negativeSignals = countPhrases(lower, ['should not', "shouldn't", 'must not', 'harm', 'risk', 'disadvantage', 'oppose', 'disagree', 'worse', 'ban', 'prohibit']);
  const affirmativeText = lower.replace(/\b(?:should|must)\s+not\b|\bshouldn't\b/g, ' ');
  const positiveSignals = countPhrases(affirmativeText, ['should', 'must', 'benefit', 'advantage', 'support', 'agree', 'better', 'important']);
  const aligned = stance === 'for' ? positiveSignals > negativeSignals : negativeSignals > positiveSignals;
  const mixed = positiveSignals > 0 && negativeSignals > 0 && Math.abs(positiveSignals - negativeSignals) <= 1;
  const sentences = transcript.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
  const sentenceLengths = sentences.map((sentence) => tokenize(sentence).length).filter(Boolean);
  const openingSlice = words.slice(0, 22).join(' ');
  const conclusionSlice = words.slice(-28).join(' ');
  const fillerCount = countPhrases(lower, FILLERS);

  return {
    wordCount: words.length,
    wordsPerMinute: words.length / speakingMinutes,
    uniqueWordRatio: contentWords.length ? unique.size / contentWords.length : 0,
    contentWordRatio: words.length ? contentWords.length / words.length : 0,
    fillerCount,
    fillersPerMinute: fillerCount / speakingMinutes,
    repeatedPhraseCount: repeatedBigrams(words),
    transitionCount: countPhrases(lower, TRANSITIONS),
    transitionVariety: phraseVariety(lower, TRANSITIONS),
    reasoningMarkerCount: countPhrases(lower, REASONING_MARKERS),
    exampleMarkerCount: countPhrases(lower, EXAMPLE_MARKERS),
    topicKeywordCoverage: rootedTopicKeywords.size ? keywordHits / rootedTopicKeywords.size : 0,
    stanceSignal: words.length < 12 ? 'unclear' : mixed ? 'mixed' : aligned ? 'aligned' : 'unclear',
    hasOpening: OPENINGS.some((phrase) => openingSlice.includes(phrase)),
    hasConclusion: CONCLUSIONS.some((phrase) => conclusionSlice.includes(phrase)),
    sentenceCount: sentences.length || (words.length ? 1 : 0),
    averageSentenceWords: sentenceLengths.length ? sentenceLengths.reduce((total, length) => total + length, 0) / sentenceLengths.length : 0,
    sentenceLengthVariation: standardDeviation(sentenceLengths),
  };
}

export const textTestHelpers = { tokenize, countPhrases, repeatedBigrams, keywordRoot };
