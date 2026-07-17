import type {
  AudioMetrics,
  CoachFeedback,
  CoachingWeakness,
  ScoreBreakdown,
  SentenceReframe,
  Stance,
  TextMetrics,
  Topic,
  TopicStrategy,
} from '../types';

function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

function languageEvidenceCeiling(wordCount: number): number {
  if (wordCount <= 0) return 0;
  if (wordCount < 12) return 28;
  if (wordCount < 25) return 48;
  if (wordCount < 45) return 68;
  if (wordCount < 65) return 82;
  if (wordCount < 90) return 91;
  return 97;
}

function voiceEvidenceCeiling(voicedSeconds: number): number {
  if (voicedSeconds < 0.25) return 0;
  if (voicedSeconds < 3) return 25;
  if (voicedSeconds < 8) return 42;
  if (voicedSeconds < 15) return 60;
  if (voicedSeconds < 25) return 78;
  if (voicedSeconds < 35) return 90;
  return 97;
}

export function calculateScores(audio: AudioMetrics, text: TextMetrics): ScoreBreakdown {
  const languageCeiling = languageEvidenceCeiling(text.wordCount);
  const voiceCeiling = voiceEvidenceCeiling(audio.voicedSeconds);
  const usesIndicPaceRange = text.language === 'bn' || text.language === 'hi';
  const paceFloor = usesIndicPaceRange ? 100 : 120;
  const paceCeiling = usesIndicPaceRange ? 160 : 175;
  const paceDistance = text.wordsPerMinute < paceFloor
    ? paceFloor - text.wordsPerMinute
    : Math.max(0, text.wordsPerMinute - paceCeiling);
  const rawPacing = 92 - paceDistance * (text.wordsPerMinute < paceFloor ? 0.8 : 0.68);
  const pacing = Math.min(voiceCeiling, clampScore(rawPacing));
  const speakingMinutes = Math.max(audio.speakingSpanSeconds / 60, 1 / 60);
  const pauseRate = audio.pauseCount / speakingMinutes;
  const longPauseRate = audio.longPauseCount / speakingMinutes;
  const rawFluency = 91
    - text.fillersPerMinute * 5.8
    - longPauseRate * 2.4
    - Math.max(0, pauseRate - 10) * 1.1
    - Math.max(0, audio.silenceRatio - 0.22) * 72
    - Math.max(0, audio.averagePauseSeconds - 0.85) * 5
    - text.repeatedPhraseCount * 1.4;
  const fluency = Math.min(voiceCeiling, clampScore(rawFluency));
  const rawVocabulary = 32
    + text.uniqueWordRatio * 38
    + text.contentWordRatio * 20
    + Math.min(8, text.transitionVariety * 1.6)
    - text.repeatedPhraseCount * 2.8
    - Math.max(0, text.fillersPerMinute - 2) * 1.2;
  const vocabulary = Math.min(languageCeiling, clampScore(rawVocabulary));
  const pitchVariation = audio.pitchVariationSemitones ?? 0;
  const volumeScore = audio.averageVolumeDb < -48
    ? 25
    : audio.averageVolumeDb > -5
      ? 38
      : Math.max(46, 74 - Math.abs(audio.averageVolumeDb + 22) * 1.1);
  const pitchContribution = audio.pitchVariationSemitones === null
    ? -9
    : Math.min(10, pitchVariation * 2.2) - Math.max(0, pitchVariation - 7) * 1.4;
  const delivery = audio.voicedSeconds < 0.25
    ? 0
    : Math.min(voiceCeiling, clampScore(
      volumeScore
      + pitchContribution
      + Math.min(8, audio.volumeVariation * 0.9)
      - Math.max(0, audio.clippingRatio - 0.001) * 900,
    ));
  const sentenceDevelopment = (text.sentenceCount >= 3 ? 5 : 0)
    + (text.averageSentenceWords >= 7 && text.averageSentenceWords <= 30 ? 5 : 0);
  const rawStructure = 18
    + (text.hasOpening ? 14 : 0)
    + (text.hasConclusion ? 14 : 0)
    + Math.min(16, text.transitionVariety * 4)
    + Math.min(18, text.reasoningMarkerCount * 4.5)
    + Math.min(14, text.exampleMarkerCount * 7)
    + sentenceDevelopment;
  const structure = Math.min(languageCeiling, clampScore(rawStructure));
  const rawRelevance = 22
    + text.topicKeywordCoverage * 42
    + (text.stanceSignal === 'aligned' ? 16 : text.stanceSignal === 'mixed' ? 5 : text.stanceSignal === 'opposed' ? -24 : 0)
    + Math.min(10, text.reasoningMarkerCount * 3);
  const relevance = Math.min(languageCeiling, text.stanceSignal === 'opposed' ? 28 : 100, clampScore(rawRelevance));
  const evidenceCeiling = Math.round(languageCeiling * 0.55 + voiceCeiling * 0.45);
  const weighted = pacing * 0.13
    + fluency * 0.18
    + vocabulary * 0.14
    + delivery * 0.14
    + structure * 0.22
    + relevance * 0.19;
  const stanceCeiling = text.stanceSignal === 'opposed' ? 45 : text.stanceSignal === 'mixed' ? 76 : 100;
  const overall = Math.min(evidenceCeiling, stanceCeiling, clampScore(weighted - 2));
  return { overall, pacing, fluency, vocabulary, delivery, structure, relevance };
}

const labels: Record<Exclude<keyof ScoreBreakdown, 'overall'>, string> = {
  pacing: 'Pacing',
  fluency: 'Fluency',
  vocabulary: 'Vocabulary',
  delivery: 'Vocal delivery',
  structure: 'Structure',
  relevance: 'Relevance',
};

type ScoreCategory = keyof typeof labels;

function sortedCategories(scores: ScoreBreakdown): Array<{ key: ScoreCategory; score: number }> {
  return (Object.keys(labels) as ScoreCategory[])
    .map((key) => ({ key, score: scores[key] }))
    .sort((left, right) => right.score - left.score);
}

function englishEvidenceSummary(scores: ScoreBreakdown, audio: AudioMetrics, text: TextMetrics): string {
  if (text.stanceSignal === 'opposed') {
    return `The transcript appears to argue the opposite assigned side (${Math.round(text.topicKeywordCoverage * 100)}% topic-term coverage), so relevance and the overall score were capped. Restate the assigned position before the first reason.`;
  }
  const categories = sortedCategories(scores);
  const strongest = categories[0];
  const weakest = categories.at(-1) ?? categories[0];
  const evidence: Record<ScoreCategory, string> = {
    pacing: text.wordsPerMinute < 120
      ? `${Math.round(text.wordsPerMinute)} WPM sat below the 120–175 coaching range`
      : text.wordsPerMinute > 175
        ? `${Math.round(text.wordsPerMinute)} WPM sat above the 120–175 coaching range`
        : `${Math.round(text.wordsPerMinute)} WPM was measured, but the amount of voiced evidence limited the pacing score`,
    fluency: `${text.fillerCount} filler${text.fillerCount === 1 ? '' : 's'} and ${audio.longPauseCount} long pause${audio.longPauseCount === 1 ? '' : 's'} interrupted the flow`,
    vocabulary: `${Math.round(text.uniqueWordRatio * 100)}% lexical variety and ${text.repeatedPhraseCount} repeated phrase${text.repeatedPhraseCount === 1 ? '' : 's'} limited precision`,
    delivery: `${audio.volumeVariation.toFixed(1)} dB of volume variation and ${audio.pitchVariationSemitones?.toFixed(1) ?? 'unmeasurable'} semitones of pitch movement gave key words too little separation`,
    structure: `${text.reasoningMarkerCount} reasoning link${text.reasoningMarkerCount === 1 ? '' : 's'} and ${text.exampleMarkerCount} example cue${text.exampleMarkerCount === 1 ? '' : 's'} left the route underdeveloped`,
    relevance: `${Math.round(text.topicKeywordCoverage * 100)}% topic-term coverage and a ${text.stanceSignal} stance signal made the motion link the main gap`,
  };
  return `${labels[strongest.key]} was the strongest measured area (${strongest.score}/100). The clearest next priority is ${labels[weakest.key].toLocaleLowerCase()}: ${evidence[weakest.key]}.`;
}

function weaknessFor(
  key: keyof typeof labels,
  audio: AudioMetrics,
  text: TextMetrics,
): CoachingWeakness {
  if (key === 'pacing') return {
    title: text.wordsPerMinute >= 120 && text.wordsPerMinute <= 175 ? 'Pacing needs a longer sample' : 'The pace reduced control',
    evidence: `The measured pace was ${Math.round(text.wordsPerMinute)} WPM; the coaching range for this exercise is roughly 120–175 WPM.`,
    whyItMatters: text.wordsPerMinute < 120
      ? 'A consistently slow pace can make the reasoning feel less connected, even when the ideas are sound.'
      : text.wordsPerMinute > 175
        ? 'A consistently fast pace gives listeners less time to separate claims, reasons, and examples.'
        : 'The measured rate is in range, but a short voiced sample can still limit how confidently pacing is assessed.',
    howToImprove: text.wordsPerMinute >= 120 && text.wordsPerMinute <= 175
      ? 'Keep this rate through a longer take, with one deliberate breath after each main claim.'
      : 'Mark one breath after every main claim. Repeat the speech while keeping those breaths, then check whether the pace moves toward the target range.',
  };
  if (key === 'fluency') return {
    title: 'Hesitation interrupted the line of thought',
    evidence: `The take contained ${text.fillerCount} filler${text.fillerCount === 1 ? '' : 's'}, ${audio.pauseCount} pause${audio.pauseCount === 1 ? '' : 's'}, and ${audio.longPauseCount} long pause${audio.longPauseCount === 1 ? '' : 's'}.`,
    whyItMatters: 'Frequent fillers or unplanned pauses make the audience work harder to identify which words carry the argument.',
    howToImprove: 'Do a 30-second retry and replace every approaching filler with one silent beat. Keep the beat; remove the filler.',
  };
  if (key === 'vocabulary') return {
    title: 'Word choice could carry more precision',
    evidence: `Lexical variety was ${Math.round(text.uniqueWordRatio * 100)}%, content-word density was ${Math.round(text.contentWordRatio * 100)}%, with ${text.repeatedPhraseCount} repeated phrase${text.repeatedPhraseCount === 1 ? '' : 's'}.`,
    whyItMatters: 'Concrete nouns and active verbs make a position easier to picture and harder to misinterpret.',
    howToImprove: 'Find three vague or repeated words in the transcript. Replace each with a specific actor, action, or consequence before the next take.',
  };
  if (key === 'delivery') return {
    title: 'Vocal emphasis was not doing enough work',
    evidence: `Average level was ${audio.averageVolumeDb.toFixed(1)} dBFS, volume variation was ${audio.volumeVariation.toFixed(1)} dB, and pitch variation was ${audio.pitchVariationSemitones?.toFixed(1) ?? 'not reliably measurable'} semitones.`,
    whyItMatters: 'When every phrase receives similar emphasis, the audience has fewer cues about the claim, contrast, and conclusion.',
    howToImprove: 'Underline one key word in each section. Change pitch or loudness only on those words and keep the surrounding delivery steady.',
  };
  if (key === 'structure') return {
    title: 'The argument route was not explicit enough',
    evidence: `Opening: ${text.hasOpening ? 'detected' : 'not detected'}; conclusion: ${text.hasConclusion ? 'detected' : 'not detected'}; reasoning links: ${text.reasoningMarkerCount}; example cues: ${text.exampleMarkerCount}.`,
    whyItMatters: 'Listeners should be able to tell where the claim ends, why it is true, and which example proves it.',
    howToImprove: 'Outline four short lines before recording: Point, Reason, Example, Point again. Speak one line at a time without adding a fifth section.',
  };
  return {
    title: 'Claims needed a tighter link to the motion',
    evidence: `Topic-term coverage was ${Math.round(text.topicKeywordCoverage * 100)}%, and the measured stance signal was ${text.stanceSignal}.`,
    whyItMatters: 'A reasonable point does not advance the case unless its consequence is explicitly connected to this motion and this side.',
    howToImprove: 'After each reason, add one sentence beginning “This matters to the motion because…” and name the concrete consequence.',
  };
}

function transcriptExcerpts(transcript: string): string[] {
  const normalized = transcript.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?।]+[.!?।]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  if (sentences.length >= 2) return sentences;
  const words = normalized.split(' ');
  if (words.length <= 24) return [normalized];
  const chunks: string[] = [];
  for (let index = 0; index < words.length && chunks.length < 3; index += 24) {
    chunks.push(words.slice(index, index + 24).join(' '));
  }
  return chunks;
}

function reframe(original: string, stance: Stance, topic: Topic): SentenceReframe | null {
  const fillerPattern = /\b(?:um+|uh+|erm+)\b[,.]?\s*/gi;
  const cleaned = original.replace(fillerPattern, '').replace(/\s{2,}/g, ' ').trim();
  if (cleaned && cleaned.toLocaleLowerCase() !== original.toLocaleLowerCase()) {
    const revised = `${cleaned.charAt(0).toLocaleUpperCase()}${cleaned.slice(1)}`;
    return {
      original,
      issue: 'Hedges or filler language delay the substantive claim.',
      revised,
      principle: 'Lead with the claim. Use uncertainty only when the uncertainty itself is relevant.',
    };
  }

  const collapsed = original.replace(/\b([\p{L}\p{M}]+)(?:[,\s]+\1(?![\p{L}\p{M}\p{N}]))+/giu, '$1').replace(/\s{2,}/g, ' ').trim();
  if (collapsed !== original) return {
    original,
    issue: 'An immediately repeated word makes the claim sound unfinished.',
    revised: collapsed,
    principle: 'Say the key word once, pause, and move directly to the reason or consequence.',
  };

  // Browser coaching can safely remove observable verbal clutter, but it cannot
  // infer a speaker's intended replacement argument. Ollama coaching handles true
  // semantic rewrites; omit the stock template when there is no grounded edit.
  void stance;
  void topic;
  return null;
}

function buildReframes(transcript: string, stance: Stance, topic: Topic): SentenceReframe[] {
  const fillerPattern = /\b(?:um+|uh+|erm+)\b/i;
  const seen = new Set<string>();
  return transcriptExcerpts(transcript)
    .filter((sentence) => {
      const key = sentence.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => Number(fillerPattern.test(right)) - Number(fillerPattern.test(left)) || right.split(' ').length - left.split(' ').length)
    .map((sentence) => reframe(sentence, stance, topic))
    .filter((item): item is SentenceReframe => Boolean(item))
    .slice(0, 2);
}

function buildTopicStrategy(topic: Topic, stance: Stance): TopicStrategy {
  const side = stance === 'for' ? 'accepting' : 'rejecting';
  return {
    coreQuestion: `What changes in the real world if we commit to ${side} the motion “${topic.prompt}”?`,
    angles: [
      `People: who benefits, who carries the cost, and how large is the effect?`,
      `Mechanism: what step-by-step chain makes your ${stance} position produce that effect?`,
      'Trade-off: why is your benefit more important, likely, or lasting than the strongest cost?',
    ],
    strongestCounterargument: `A strong opponent will challenge your causal link and argue that the trade-offs outweigh the benefit you claim. State that case fairly before answering it.`,
    nextOutline: [
      `Position — “I am ${stance} this motion because…”`,
      'Reason — name one mechanism, not a list of loosely related benefits.',
      'Example — show one actor, action, and consequence.',
      'Rebuttal and close — answer the strongest objection, then return to the motion.',
    ],
  };
}

const bengaliLabels: Record<keyof typeof labels, string> = {
  pacing: 'বলার গতি',
  fluency: 'সাবলীলতা',
  vocabulary: 'শব্দচয়ন',
  delivery: 'কণ্ঠের উপস্থাপনা',
  structure: 'কাঠামো',
  relevance: 'বিষয়ের প্রাসঙ্গিকতা',
};

function bengaliStanceSignal(signal: TextMetrics['stanceSignal']): string {
  if (signal === 'aligned') return 'নির্ধারিত পক্ষের সঙ্গে সামঞ্জস্যপূর্ণ';
  if (signal === 'opposed') return 'নির্ধারিত পক্ষের বিপরীত';
  if (signal === 'mixed') return 'মিশ্র';
  return 'অস্পষ্ট';
}

function bengaliEvidenceSummary(scores: ScoreBreakdown, audio: AudioMetrics, text: TextMetrics): string {
  if (text.stanceSignal === 'opposed') {
    return `ট্রান্সক্রিপ্টটি নির্ধারিত পক্ষের বিপরীতে যুক্তি দিচ্ছে বলে মনে হয়েছে; বিষয়ের মূল শব্দের ব্যবহার ছিল ${Math.round(text.topicKeywordCoverage * 100)}%। তাই প্রাসঙ্গিকতা ও মোট স্কোর সীমিত হয়েছে।`;
  }
  const categories = sortedCategories(scores);
  const strongest = categories[0];
  const weakest = categories.at(-1) ?? categories[0];
  const evidence: Record<ScoreCategory, string> = {
    pacing: text.wordsPerMinute < 100
      ? `মিনিটে ${Math.round(text.wordsPerMinute)}টি শব্দ ১০০–১৬০ লক্ষ্যসীমার নিচে ছিল`
      : text.wordsPerMinute > 160
        ? `মিনিটে ${Math.round(text.wordsPerMinute)}টি শব্দ ১০০–১৬০ লক্ষ্যসীমার ওপরে ছিল`
        : `মিনিটে ${Math.round(text.wordsPerMinute)}টি শব্দ ধরা পড়েছে, তবে কণ্ঠের প্রমাণ কম হওয়ায় গতির স্কোর সীমিত হয়েছে`,
    fluency: `${text.fillerCount}টি ভরাট শব্দ ও ${audio.longPauseCount}টি দীর্ঘ বিরতি প্রবাহে বাধা দিয়েছে`,
    vocabulary: `${Math.round(text.uniqueWordRatio * 100)}% শব্দবৈচিত্র্য এবং ${text.repeatedPhraseCount}টি পুনরাবৃত্ত বাক্যাংশ নির্দিষ্টতা কমিয়েছে`,
    delivery: `${audio.volumeVariation.toFixed(1)} dB শব্দমাত্রার পরিবর্তন এবং ${audio.pitchVariationSemitones?.toFixed(1) ?? 'পরিমাপ করা যায়নি'} সেমিটোন স্বরভঙ্গি মূল শব্দগুলোকে যথেষ্ট আলাদা করেনি`,
    structure: `${text.reasoningMarkerCount}টি কারণের সংযোগ ও ${text.exampleMarkerCount}টি উদাহরণের সংকেত যুক্তির পথ অসম্পূর্ণ রেখেছে`,
    relevance: `${Math.round(text.topicKeywordCoverage * 100)}% বিষয়-শব্দের ব্যবহার এবং ${bengaliStanceSignal(text.stanceSignal)} অবস্থান-সংকেত প্রস্তাবের সঙ্গে যোগসূত্রকে প্রধান ঘাটতি করেছে`,
  };
  return `${bengaliLabels[strongest.key]} ছিল তুলনামূলকভাবে সবচেয়ে শক্তিশালী (${strongest.score}/100)। পরের প্রধান কাজ ${bengaliLabels[weakest.key]}: ${evidence[weakest.key]}।`;
}

const hindiLabels: Record<keyof typeof labels, string> = {
  pacing: 'बोलने की गति',
  fluency: 'प्रवाह',
  vocabulary: 'शब्द चयन',
  delivery: 'स्वर प्रस्तुति',
  structure: 'संरचना',
  relevance: 'विषय से प्रासंगिकता',
};

function hindiStanceSignal(signal: TextMetrics['stanceSignal']): string {
  if (signal === 'aligned') return 'निर्धारित पक्ष के अनुरूप';
  if (signal === 'opposed') return 'निर्धारित पक्ष के विपरीत';
  if (signal === 'mixed') return 'मिश्रित';
  return 'अस्पष्ट';
}

function hindiEvidenceSummary(scores: ScoreBreakdown, audio: AudioMetrics, text: TextMetrics): string {
  if (text.stanceSignal === 'opposed') {
    return `ट्रांसक्रिप्ट निर्धारित पक्ष के विपरीत तर्क देता दिखाई दिया; विषय के मुख्य शब्दों का कवरेज ${Math.round(text.topicKeywordCoverage * 100)}% था। इसलिए प्रासंगिकता और कुल स्कोर सीमित किए गए। अगली बार पहले वाक्य में निर्धारित पक्ष स्पष्ट करें।`;
  }
  const categories = sortedCategories(scores);
  const strongest = categories[0];
  const weakest = categories.at(-1) ?? categories[0];
  const evidence: Record<ScoreCategory, string> = {
    pacing: text.wordsPerMinute < 100
      ? `${Math.round(text.wordsPerMinute)} शब्द प्रति मिनट की गति 100–160 की लक्ष्य-सीमा से कम थी`
      : text.wordsPerMinute > 160
        ? `${Math.round(text.wordsPerMinute)} शब्द प्रति मिनट की गति 100–160 की लक्ष्य-सीमा से अधिक थी`
        : `${Math.round(text.wordsPerMinute)} शब्द प्रति मिनट मापे गए, लेकिन आवाज़ के सीमित प्रमाण के कारण गति का स्कोर सीमित रहा`,
    fluency: `${text.fillerCount} भराव शब्द और ${audio.longPauseCount} लंबे विरामों ने विचारों का प्रवाह तोड़ा`,
    vocabulary: `${Math.round(text.uniqueWordRatio * 100)}% शब्द-विविधता और ${text.repeatedPhraseCount} दोहराए गए वाक्यांशों ने सटीकता सीमित की`,
    delivery: `${audio.volumeVariation.toFixed(1)} dB आवाज़ के बदलाव और ${audio.pitchVariationSemitones?.toFixed(1) ?? 'न मापे जा सके'} सेमीटोन पिच बदलाव ने मुख्य शब्दों को पर्याप्त अलग नहीं किया`,
    structure: `${text.reasoningMarkerCount} कारण-संबंध और ${text.exampleMarkerCount} उदाहरण-संकेतों के कारण तर्क का रास्ता अधूरा रहा`,
    relevance: `${Math.round(text.topicKeywordCoverage * 100)}% विषय-शब्द कवरेज और ${hindiStanceSignal(text.stanceSignal)} रुख ने प्रस्ताव से संबंध को मुख्य कमी बनाया`,
  };
  return `${hindiLabels[strongest.key]} सबसे मजबूत मापा गया क्षेत्र था (${strongest.score}/100)। अगली प्राथमिकता ${hindiLabels[weakest.key]} है: ${evidence[weakest.key]}।`;
}

export function browserHistorySummary(
  scores: ScoreBreakdown,
  audio: AudioMetrics,
  text: TextMetrics,
  language = text.language ?? 'en',
): string {
  if (language === 'bn') return bengaliEvidenceSummary(scores, audio, text);
  if (language === 'hi') return hindiEvidenceSummary(scores, audio, text);
  return englishEvidenceSummary(scores, audio, text);
}

function bengaliWeakness(
  key: keyof typeof labels,
  audio: AudioMetrics,
  text: TextMetrics,
): CoachingWeakness {
  if (key === 'pacing') return {
    title: text.wordsPerMinute >= 100 && text.wordsPerMinute <= 160 ? 'গতি যাচাইয়ে আরও দীর্ঘ নমুনা দরকার' : 'বলার গতি নিয়ন্ত্রণ কমিয়েছে',
    evidence: `পরিমাপ করা গতি ছিল মিনিটে ${Math.round(text.wordsPerMinute)}টি শব্দ; এই বাংলা অনুশীলনের প্রাথমিক লক্ষ্য প্রায় ১০০–১৬০ শব্দ।`,
    whyItMatters: text.wordsPerMinute < 100
      ? 'খুব ধীর গতি যুক্তির অংশগুলোর সংযোগ দুর্বল করে দিতে পারে।'
      : text.wordsPerMinute > 160
        ? 'খুব দ্রুত বললে শ্রোতা দাবি, কারণ ও উদাহরণ আলাদা করার সময় পান না।'
        : 'মাপা গতি লক্ষ্যসীমায় আছে, তবে অল্প সময়ের কণ্ঠ থেকে গতির স্থিরতা নিশ্চিতভাবে বিচার করা কঠিন।',
    howToImprove: text.wordsPerMinute >= 100 && text.wordsPerMinute <= 160
      ? 'এই গতি একটি দীর্ঘ বক্তব্যেও ধরে রাখুন এবং প্রতিটি মূল দাবির পরে একটি পরিকল্পিত শ্বাস নিন।'
      : 'প্রতিটি মূল দাবির পরে একটি শ্বাসের চিহ্ন দিন। একই বক্তব্য আবার বলুন এবং সেই বিরতিগুলো বজায় রাখুন।',
  };
  if (key === 'fluency') return {
    title: 'দ্বিধা বক্তব্যের প্রবাহ ভেঙেছে',
    evidence: `এই বক্তব্যে ${text.fillerCount}টি ভরাট শব্দ, ${audio.pauseCount}টি বিরতি এবং ${audio.longPauseCount}টি দীর্ঘ বিরতি ধরা পড়েছে।`,
    whyItMatters: 'ঘন ঘন ভরাট শব্দ বা অপরিকল্পিত বিরতিতে মূল যুক্তি অনুসরণ করা কঠিন হয়।',
    howToImprove: '৩০ সেকেন্ড আবার বলুন। ভরাট শব্দ আসার আগে সেটির বদলে এক মুহূর্ত নীরব থাকুন।',
  };
  if (key === 'vocabulary') return {
    title: 'শব্দচয়ন আরও নির্দিষ্ট হতে পারে',
    evidence: `শব্দের বৈচিত্র্য ছিল ${Math.round(text.uniqueWordRatio * 100)}%, তথ্যবহুল শব্দের অনুপাত ${Math.round(text.contentWordRatio * 100)}%, এবং ${text.repeatedPhraseCount}টি বাক্যাংশ পুনরাবৃত্ত হয়েছে।`,
    whyItMatters: 'নির্দিষ্ট বিশেষ্য ও সক্রিয় ক্রিয়া অবস্থানটিকে স্পষ্ট এবং মনে রাখার মতো করে।',
    howToImprove: 'ট্রান্সক্রিপ্ট থেকে তিনটি অস্পষ্ট বা পুনরাবৃত্ত শব্দ খুঁজে প্রতিটির বদলে নির্দিষ্ট ব্যক্তি, কাজ বা ফলাফল লিখুন।',
  };
  if (key === 'delivery') return {
    title: 'কণ্ঠের জোর মূল কথাকে যথেষ্ট আলাদা করেনি',
    evidence: `গড় শব্দমাত্রা ছিল ${audio.averageVolumeDb.toFixed(1)} dBFS, শব্দমাত্রার পরিবর্তন ${audio.volumeVariation.toFixed(1)} dB, এবং স্বরের পরিবর্তন ${audio.pitchVariationSemitones?.toFixed(1) ?? 'নির্ভরযোগ্যভাবে মাপা যায়নি'} সেমিটোন।`,
    whyItMatters: 'সব বাক্য একই ভঙ্গিতে বললে দাবি, বৈপরীত্য ও উপসংহার কোথায় তা বোঝার সংকেত কমে যায়।',
    howToImprove: 'প্রতিটি অংশে একটি গুরুত্বপূর্ণ শব্দ দাগ দিন। শুধু সেই শব্দে স্বর বা জোর বদলান।',
  };
  if (key === 'structure') return {
    title: 'যুক্তির পথ আরও স্পষ্ট হওয়া দরকার',
    evidence: `সূচনা: ${text.hasOpening ? 'ধরা পড়েছে' : 'ধরা পড়েনি'}; উপসংহার: ${text.hasConclusion ? 'ধরা পড়েছে' : 'ধরা পড়েনি'}; কারণের সংযোগ: ${text.reasoningMarkerCount}; উদাহরণের সংকেত: ${text.exampleMarkerCount}।`,
    whyItMatters: 'শ্রোতার বোঝা উচিত দাবি কোথায় শেষ হচ্ছে, কেন সেটি সত্য এবং কোন উদাহরণ সেটি প্রমাণ করে।',
    howToImprove: 'রেকর্ড করার আগে চারটি ছোট লাইন লিখুন: বক্তব্য, কারণ, উদাহরণ, আবার বক্তব্য। একবারে একটি লাইন বলুন।',
  };
  return {
    title: 'দাবিগুলোকে বিষয়ের সঙ্গে আরও শক্তভাবে যুক্ত করা দরকার',
    evidence: `বিষয়ের মূল শব্দের ব্যবহার ছিল ${Math.round(text.topicKeywordCoverage * 100)}%, এবং অবস্থানের সংকেত ছিল ${bengaliStanceSignal(text.stanceSignal)}।`,
    whyItMatters: 'একটি ভালো কথা তখনই যুক্তিকে এগিয়ে নেয়, যখন তার ফলাফল এই বিষয় ও নির্ধারিত পক্ষের সঙ্গে স্পষ্টভাবে যুক্ত হয়।',
    howToImprove: 'প্রতিটি কারণের পরে বলুন, “এটি এই প্রস্তাবের জন্য গুরুত্বপূর্ণ, কারণ…” তারপর নির্দিষ্ট ফলাফলটি বলুন।',
  };
}

function buildBengaliReframes(transcript: string, stance: Stance): SentenceReframe[] {
  const fillerPattern = /(?:^|\s)(?:উম+|উহ+|এ্যা)(?=[,，.!?।\s]|$)[,，]?\s*/gu;
  const seen = new Set<string>();
  return transcriptExcerpts(transcript).filter((original) => {
    const key = original.replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((original): SentenceReframe | null => {
    const cleaned = original.replace(fillerPattern, ' ').replace(/\s{2,}/g, ' ').replace(/\s+([,，.!?।])/gu, '$1').trim();
    if (cleaned && /\p{L}/u.test(cleaned) && cleaned !== original) return {
      original,
      issue: 'ভরাট শব্দটি মূল দাবিতে পৌঁছাতে দেরি করিয়েছে।',
      revised: cleaned,
      principle: 'সরাসরি দাবি দিয়ে শুরু করুন; প্রয়োজন না হলে দ্বিধার ভাষা বাদ দিন।',
    };
    const collapsed = original.replace(/([\p{Script=Bengali}\p{M}]+)(?:[,\s]+\1(?![\p{L}\p{M}\p{N}]))+/gu, '$1').replace(/\s{2,}/g, ' ').trim();
    if (collapsed !== original) return {
      original,
      issue: 'একই শব্দ পরপর বলায় দাবিটি অসম্পূর্ণ শোনায়।',
      revised: collapsed,
      principle: 'মূল শব্দটি একবার বলুন, এক মুহূর্ত থামুন, তারপর সরাসরি কারণ বা ফলাফল বলুন।',
    };
    void stance;
    return null;
  }).filter((item): item is SentenceReframe => Boolean(item)).slice(0, 2);
}

function buildBengaliTopicStrategy(topic: Topic, stance: Stance): TopicStrategy {
  return {
    coreQuestion: `“${topic.prompt}” প্রস্তাবটি ${stance === 'for' ? 'গ্রহণ' : 'প্রত্যাখ্যান'} করলে বাস্তবে কী বদলাবে?`,
    angles: [
      'মানুষ: কারা উপকৃত হবে, কারা খরচ বহন করবে এবং প্রভাব কতটা বড়?',
      `কার্যপদ্ধতি: কোন ধাপে ধাপে প্রক্রিয়ায় আপনার ${stance === 'for' ? 'পক্ষের' : 'বিপক্ষের'} অবস্থান সেই ফল তৈরি করবে?`,
      'বিনিময়: আপনার সুবিধাটি কেন সবচেয়ে বড় অসুবিধার চেয়ে বেশি গুরুত্বপূর্ণ, সম্ভাব্য বা দীর্ঘস্থায়ী?',
    ],
    strongestCounterargument: 'শক্তিশালী প্রতিপক্ষ আপনার কারণ ও ফলাফলের সংযোগ নিয়ে প্রশ্ন করবে এবং বলবে যে ক্ষতি সুবিধার চেয়ে বেশি। উত্তর দেওয়ার আগে সেই আপত্তিটি ন্যায্যভাবে তুলে ধরুন।',
    nextOutline: [
      `অবস্থান — “আমি এই প্রস্তাবের ${stance === 'for' ? 'পক্ষে' : 'বিপক্ষে'}, কারণ…”`,
      'কারণ — অনেক সুবিধার তালিকা নয়, একটি স্পষ্ট কার্যপদ্ধতি বলুন।',
      'উদাহরণ — একজন ব্যক্তি, একটি কাজ এবং একটি ফলাফল দেখান।',
      'খণ্ডন ও সমাপ্তি — সবচেয়ে শক্তিশালী আপত্তির উত্তর দিয়ে আবার প্রস্তাবে ফিরুন।',
    ],
  };
}

function browserFeedbackBengali(
  scores: ScoreBreakdown,
  audio: AudioMetrics,
  text: TextMetrics,
  context: { transcript: string; topic: Topic; stance: Stance },
): CoachFeedback {
  const categories = (Object.keys(bengaliLabels) as Array<keyof typeof bengaliLabels>)
    .map((key) => ({ key, score: scores[key], label: bengaliLabels[key] }))
    .sort((left, right) => right.score - left.score);
  const strengths = categories.slice(0, 2).map(({ label, score }) => `${label} তুলনামূলকভাবে শক্তিশালী ছিল (${score}/100)।`);
  const weaknesses = categories.slice(-3).reverse().map(({ key }) => bengaliWeakness(key, audio, text));
  const improvements = weaknesses.map((weakness) => ({
    title: weakness.title,
    detail: `${weakness.evidence} ${weakness.whyItMatters}`,
    drill: weakness.howToImprove,
  }));
  const summary = bengaliEvidenceSummary(scores, audio, text);
  return {
    summary,
    strengths,
    improvements,
    weaknesses,
    reframes: buildBengaliReframes(context.transcript, context.stance),
    topicStrategy: buildBengaliTopicStrategy(context.topic, context.stance),
    provider: 'browser',
    language: 'bn',
  };
}

function hindiWeakness(
  key: keyof typeof labels,
  audio: AudioMetrics,
  text: TextMetrics,
): CoachingWeakness {
  if (key === 'pacing') return {
    title: text.wordsPerMinute >= 100 && text.wordsPerMinute <= 160 ? 'गति जाँचने के लिए लंबा नमूना चाहिए' : 'बोलने की गति ने नियंत्रण घटाया',
    evidence: `मापी गई गति ${Math.round(text.wordsPerMinute)} शब्द प्रति मिनट थी; इस हिंदी अभ्यास के लिए शुरुआती लक्ष्य लगभग 100–160 शब्द प्रति मिनट है।`,
    whyItMatters: text.wordsPerMinute < 100
      ? 'बहुत धीमी गति तर्क के हिस्सों के बीच का संबंध कमजोर कर सकती है।'
      : text.wordsPerMinute > 160
        ? 'बहुत तेज़ गति में श्रोता को दावे, कारण और उदाहरण अलग-अलग समझने का समय कम मिलता है।'
        : 'मापी गई गति लक्ष्य-सीमा में है, लेकिन कम बोले गए समय से इसकी स्थिरता का भरोसेमंद आकलन सीमित हो सकता है।',
    howToImprove: text.wordsPerMinute >= 100 && text.wordsPerMinute <= 160
      ? 'यही गति लंबे प्रयास में बनाए रखें और हर मुख्य दावे के बाद एक नियोजित साँस लें।'
      : 'हर मुख्य दावे के बाद साँस लेने का एक निशान लगाएँ। वही भाषण दोबारा बोलें और उन विरामों को बनाए रखें।',
  };
  if (key === 'fluency') return {
    title: 'झिझक ने विचारों का प्रवाह तोड़ा',
    evidence: `इस प्रयास में ${text.fillerCount} भराव शब्द, ${audio.pauseCount} विराम और ${audio.longPauseCount} लंबे विराम पाए गए।`,
    whyItMatters: 'बार-बार भराव शब्द या अनियोजित विराम आने पर श्रोता के लिए मुख्य तर्क पहचानना कठिन हो जाता है।',
    howToImprove: '30 सेकंड का दोबारा प्रयास करें। भराव शब्द आने से पहले उसकी जगह एक शांत क्षण रखें।',
  };
  if (key === 'vocabulary') return {
    title: 'शब्द चयन अधिक सटीक हो सकता है',
    evidence: `शब्द-विविधता ${Math.round(text.uniqueWordRatio * 100)}%, विषय-वस्तु वाले शब्दों का अनुपात ${Math.round(text.contentWordRatio * 100)}%, और दोहराए गए वाक्यांश ${text.repeatedPhraseCount} थे।`,
    whyItMatters: 'ठोस संज्ञाएँ और सक्रिय क्रियाएँ आपके पक्ष को अधिक स्पष्ट और याद रखने योग्य बनाती हैं।',
    howToImprove: 'ट्रांसक्रिप्ट में तीन अस्पष्ट या दोहराए गए शब्द खोजें। हर शब्द की जगह कोई विशिष्ट व्यक्ति, क्रिया या परिणाम लिखें।',
  };
  if (key === 'delivery') return {
    title: 'स्वर के ज़ोर ने मुख्य बातों को पर्याप्त अलग नहीं किया',
    evidence: `औसत आवाज़ ${audio.averageVolumeDb.toFixed(1)} dBFS, आवाज़ का बदलाव ${audio.volumeVariation.toFixed(1)} dB, और पिच का बदलाव ${audio.pitchVariationSemitones?.toFixed(1) ?? 'विश्वसनीय रूप से नहीं मापा जा सका'} सेमीटोन था।`,
    whyItMatters: 'हर वाक्य एक ही ढंग से बोलने पर दावा, विरोध और निष्कर्ष पहचानने के संकेत कम हो जाते हैं।',
    howToImprove: 'हर हिस्से में एक मुख्य शब्द रेखांकित करें। केवल उसी शब्द पर पिच या आवाज़ का ज़ोर बदलें।',
  };
  if (key === 'structure') return {
    title: 'तर्क का रास्ता अधिक स्पष्ट होना चाहिए',
    evidence: `शुरुआत: ${text.hasOpening ? 'मिली' : 'नहीं मिली'}; निष्कर्ष: ${text.hasConclusion ? 'मिला' : 'नहीं मिला'}; कारण-संबंध: ${text.reasoningMarkerCount}; उदाहरण-संकेत: ${text.exampleMarkerCount}।`,
    whyItMatters: 'श्रोता को साफ़ समझ आना चाहिए कि दावा कहाँ है, वह क्यों सही है और कौन-सा उदाहरण उसे साबित करता है।',
    howToImprove: 'रिकॉर्ड करने से पहले चार छोटी पंक्तियाँ लिखें: दावा, कारण, उदाहरण और फिर दावा। एक बार में एक पंक्ति बोलें।',
  };
  return {
    title: 'दावों को प्रस्ताव से अधिक स्पष्ट रूप से जोड़ना चाहिए',
    evidence: `विषय के मुख्य शब्दों का कवरेज ${Math.round(text.topicKeywordCoverage * 100)}% था और रुख ${hindiStanceSignal(text.stanceSignal)} था।`,
    whyItMatters: 'कोई बात तभी तर्क को आगे बढ़ाती है जब उसका परिणाम इस प्रस्ताव और निर्धारित पक्ष से साफ़ जुड़ा हो।',
    howToImprove: 'हर कारण के बाद कहें, “यह इस प्रस्ताव के लिए महत्वपूर्ण है, क्योंकि…” और फिर ठोस परिणाम बताएँ।',
  };
}

function buildHindiReframes(transcript: string): SentenceReframe[] {
  const fillerPattern = /(?:^|\s)(?:उम+|उह+|अम्+)(?=[,，.\s।!?]|$)[,，]?\s*/gu;
  const seen = new Set<string>();
  return transcriptExcerpts(transcript).filter((original) => {
    const key = original.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((original): SentenceReframe | null => {
    const cleaned = original.replace(fillerPattern, ' ').replace(/\s{2,}/g, ' ').replace(/\s+([,，.!?।])/gu, '$1').trim();
    if (cleaned && /\p{L}/u.test(cleaned) && cleaned !== original) return {
      original,
      issue: 'भराव शब्द के कारण मुख्य दावे तक पहुँचने में देर हुई।',
      revised: cleaned,
      principle: 'सीधे दावे से शुरू करें; जब अनिश्चितता ज़रूरी न हो, तो झिझक वाले शब्द हटाएँ।',
    };
    const collapsed = original.replace(/([\p{Script=Devanagari}\p{M}]+)(?:[,\s]+\1(?![\p{L}\p{M}\p{N}]))+/gu, '$1').replace(/\s{2,}/g, ' ').trim();
    if (collapsed !== original) return {
      original,
      issue: 'एक ही शब्द तुरंत दोहराने से दावा अधूरा सुनाई देता है।',
      revised: collapsed,
      principle: 'मुख्य शब्द एक बार कहें, एक क्षण रुकें, फिर सीधे कारण या परिणाम पर जाएँ।',
    };
    return null;
  }).filter((item): item is SentenceReframe => Boolean(item)).slice(0, 2);
}

function buildHindiTopicStrategy(topic: Topic, stance: Stance): TopicStrategy {
  const side = stance === 'for' ? 'पक्ष' : 'विपक्ष';
  return {
    coreQuestion: `“${topic.prompt}” प्रस्ताव को ${stance === 'for' ? 'स्वीकार' : 'अस्वीकार'} करने पर वास्तविक दुनिया में क्या बदलेगा?`,
    angles: [
      'लोग: किसे लाभ होगा, लागत कौन उठाएगा और प्रभाव कितना बड़ा होगा?',
      `प्रक्रिया: किन क्रमिक चरणों से आपका ${side} वह परिणाम पैदा करेगा?`,
      'समझौता: आपका लाभ सबसे बड़ी हानि से अधिक महत्वपूर्ण, संभावित या टिकाऊ क्यों है?',
    ],
    strongestCounterargument: 'एक मजबूत विरोधी आपके कारण और परिणाम के संबंध पर सवाल उठाएगा और कहेगा कि हानि आपके बताए लाभ से बड़ी है। उत्तर देने से पहले उस आपत्ति को निष्पक्ष रूप से रखें।',
    nextOutline: [
      `स्थिति — “मैं इस प्रस्ताव के ${side} में हूँ, क्योंकि…”`,
      'कारण — कई ढीले लाभ गिनाने के बजाय एक स्पष्ट प्रक्रिया बताएँ।',
      'उदाहरण — एक व्यक्ति, एक क्रिया और एक परिणाम दिखाएँ।',
      'खंडन और निष्कर्ष — सबसे मजबूत आपत्ति का उत्तर देकर फिर प्रस्ताव पर लौटें।',
    ],
  };
}

function browserFeedbackHindi(
  scores: ScoreBreakdown,
  audio: AudioMetrics,
  text: TextMetrics,
  context: { transcript: string; topic: Topic; stance: Stance },
): CoachFeedback {
  const categories = (Object.keys(hindiLabels) as Array<keyof typeof hindiLabels>)
    .map((key) => ({ key, score: scores[key], label: hindiLabels[key] }))
    .sort((left, right) => right.score - left.score);
  const strengths = categories.slice(0, 2).map(({ label, score }) => `${label} अपेक्षाकृत मजबूत क्षेत्र था (${score}/100)।`);
  const weaknesses = categories.slice(-3).reverse().map(({ key }) => hindiWeakness(key, audio, text));
  const improvements = weaknesses.map((weakness) => ({
    title: weakness.title,
    detail: `${weakness.evidence} ${weakness.whyItMatters}`,
    drill: weakness.howToImprove,
  }));
  return {
    summary: hindiEvidenceSummary(scores, audio, text),
    strengths,
    improvements,
    weaknesses,
    reframes: buildHindiReframes(context.transcript),
    topicStrategy: buildHindiTopicStrategy(context.topic, context.stance),
    provider: 'browser',
    language: 'hi',
  };
}

export function browserFeedback(
  scores: ScoreBreakdown,
  audio: AudioMetrics,
  text: TextMetrics,
  context?: { transcript: string; topic: Topic; stance: Stance },
): CoachFeedback {
  if (context?.topic.language === 'bn') return browserFeedbackBengali(scores, audio, text, context);
  if (context?.topic.language === 'hi') return browserFeedbackHindi(scores, audio, text, context);
  const categories = (Object.keys(labels) as Array<keyof typeof labels>)
    .map((key) => ({ key, score: scores[key], label: labels[key] }))
    .sort((a, b) => b.score - a.score);
  const strengths = categories.slice(0, 2).map(({ key, label, score }) => {
    if (key === 'pacing') return `${label}: ${Math.round(text.wordsPerMinute)} words per minute gave the answer a workable rhythm.`;
    if (key === 'fluency') return `${label}: ${text.fillerCount} filler${text.fillerCount === 1 ? '' : 's'} and ${audio.longPauseCount} long pause${audio.longPauseCount === 1 ? '' : 's'} kept the delivery relatively clean.`;
    if (key === 'delivery') {
      return audio.pitchVariationSemitones === null
        ? `${label}: the average recorded level was ${audio.averageVolumeDb.toFixed(1)} dBFS; pitch variation was not reliably measurable.`
        : `${label}: measurable volume and pitch movement produced a ${score >= 75 ? 'varied' : 'steady'} vocal profile.`;
    }
    if (key === 'structure') return `${label}: ${text.reasoningMarkerCount} reasoning link${text.reasoningMarkerCount === 1 ? '' : 's'}, ${text.exampleMarkerCount} example cue${text.exampleMarkerCount === 1 ? '' : 's'}, and ${text.transitionVariety} distinct transition${text.transitionVariety === 1 ? '' : 's'} supported the route through the answer.`;
    if (key === 'relevance') return `${label}: topic-term coverage was ${Math.round(text.topicKeywordCoverage * 100)}%, with the stance match measured as ${text.stanceSignal}.`;
    if (key === 'vocabulary') return `${label}: ${Math.round(text.uniqueWordRatio * 100)}% lexical variety and ${Math.round(text.contentWordRatio * 100)}% content-word density made this a relative strength.`;
    return `${label} was one of the strongest areas in this attempt (${score}/100).`;
  });

  const improvements = categories.slice(-3).reverse().map(({ key, label }) => {
    if (key === 'pacing') {
      const inRange = text.wordsPerMinute >= 120 && text.wordsPerMinute <= 175;
      const direction = text.wordsPerMinute < 120 ? 'quicker' : 'slower';
      return { title: `${label}: ${inRange ? 'sustain the measured rhythm' : 'find the conversational zone'}`, detail: `Your measured pace was ${Math.round(text.wordsPerMinute)} WPM. Aim for roughly 120–175 WPM, adjusting for emphasis.${inRange ? ' This rate is in range; limited voiced evidence can still cap the score.' : ''}`, drill: inRange ? 'Keep the same rate through a longer answer, placing a deliberate breath after each main claim.' : `Repeat the answer once ${direction}, placing a deliberate breath after each main claim.` };
    }
    if (key === 'fluency') return { title: `${label}: replace hesitation with intent`, detail: `The recording contained ${text.fillerCount} fillers and ${audio.pauseCount} pauses over 0.3 seconds.`, drill: 'Speak for 30 seconds using silent one-beat pauses whenever a filler is about to appear.' };
    if (key === 'structure') return { title: `${label}: make the route visible`, detail: `Opening: ${text.hasOpening ? 'present' : 'missing'}; conclusion: ${text.hasConclusion ? 'present' : 'missing'}; reasoning links: ${text.reasoningMarkerCount}; example cues: ${text.exampleMarkerCount}.`, drill: 'Use PREP: state your Point, give a Reason, add an Example, then restate the Point.' };
    if (key === 'relevance') return { title: `${label}: tie each claim back`, detail: `The transcript used ${Math.round(text.topicKeywordCoverage * 100)}% of the topic’s key terms and the stance match was ${text.stanceSignal}.${text.stanceSignal === 'opposed' ? ' The speech appears to argue the opposite of the assigned side.' : ''}`, drill: 'Begin with an explicit position, then end each supporting point with: “This matters to my side because…”' };
    if (key === 'vocabulary') return { title: `${label}: trade repetition for precision`, detail: `Lexical variety was ${Math.round(text.uniqueWordRatio * 100)}%, content-word density was ${Math.round(text.contentWordRatio * 100)}%, and ${text.repeatedPhraseCount} phrase${text.repeatedPhraseCount === 1 ? ' was' : 's were'} repeated.`, drill: 'Pick three vague words from the transcript and replace each with a concrete noun or active verb.' };
    return { title: `${label}: add purposeful variation`, detail: `Pitch variation was ${audio.pitchVariationSemitones?.toFixed(1) ?? 'not measurable'} semitones and average level was ${audio.averageVolumeDb.toFixed(1)} dBFS.`, drill: 'Underline three key words, then repeat the answer while changing pitch or loudness only on those words.' };
  });

  const summary = englishEvidenceSummary(scores, audio, text);
  const weakestKeys = categories.slice(-3).reverse().map(({ key }) => key);
  return {
    summary,
    strengths,
    improvements,
    weaknesses: weakestKeys.map((key) => weaknessFor(key, audio, text)),
    reframes: context ? buildReframes(context.transcript, context.stance, context.topic) : [],
    topicStrategy: context ? buildTopicStrategy(context.topic, context.stance) : undefined,
    provider: 'browser',
    language: 'en',
  };
}
