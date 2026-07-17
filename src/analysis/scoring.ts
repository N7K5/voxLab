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
  const paceDistance = text.wordsPerMinute < 120
    ? 120 - text.wordsPerMinute
    : Math.max(0, text.wordsPerMinute - 170);
  const rawPacing = 92 - paceDistance * (text.wordsPerMinute < 120 ? 0.8 : 0.68);
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

function weaknessFor(
  key: keyof typeof labels,
  audio: AudioMetrics,
  text: TextMetrics,
): CoachingWeakness {
  if (key === 'pacing') return {
    title: 'The pace reduced control',
    evidence: `The measured pace was ${Math.round(text.wordsPerMinute)} WPM; the coaching range for this exercise is roughly 120–175 WPM.`,
    whyItMatters: text.wordsPerMinute < 120
      ? 'A consistently slow pace can make the reasoning feel less connected, even when the ideas are sound.'
      : 'A consistently fast pace gives listeners less time to separate claims, reasons, and examples.',
    howToImprove: 'Mark one breath after every main claim. Repeat the speech while keeping those breaths, then check whether the pace moves toward the target range.',
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
  const sentences = normalized.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  if (sentences.length >= 2) return sentences;
  const words = normalized.split(' ');
  if (words.length <= 24) return [normalized];
  const chunks: string[] = [];
  for (let index = 0; index < words.length && chunks.length < 3; index += 24) {
    chunks.push(words.slice(index, index + 24).join(' '));
  }
  return chunks;
}

function reframe(original: string, stance: Stance): SentenceReframe {
  const fillerPattern = /\b(?:um+|uh+|you know|i (?:think|feel|guess)|maybe|basically|actually|kind of|sort of)\b[,.]?\s*/gi;
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

  const withoutEnd = original.replace(/[.!?]+$/, '');
  return {
    original,
    issue: 'The thought can be made more useful by explicitly connecting it to the motion.',
    revised: `${withoutEnd}. This ${stance === 'for' ? 'supports' : 'challenges'} the motion because [name the concrete consequence].`,
    principle: 'Do not make the listener infer relevance: state the consequence and link it to your side.',
  };
}

function buildReframes(transcript: string, stance: Stance): SentenceReframe[] {
  const fillerPattern = /\b(?:um+|uh+|you know|i (?:think|feel|guess)|maybe|basically|actually|kind of|sort of)\b/i;
  return transcriptExcerpts(transcript)
    .sort((left, right) => Number(fillerPattern.test(right)) - Number(fillerPattern.test(left)) || right.split(' ').length - left.split(' ').length)
    .slice(0, 2)
    .map((sentence) => reframe(sentence, stance));
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

export function browserFeedback(
  scores: ScoreBreakdown,
  audio: AudioMetrics,
  text: TextMetrics,
  context?: { transcript: string; topic: Topic; stance: Stance },
): CoachFeedback {
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
      const direction = text.wordsPerMinute < 120 ? 'quicker' : 'slower';
      return { title: `${label}: find the conversational zone`, detail: `Your measured pace was ${Math.round(text.wordsPerMinute)} WPM. Aim for roughly 120–175 WPM, adjusting for emphasis.`, drill: `Repeat the answer once ${direction}, placing a deliberate breath after each main claim.` };
    }
    if (key === 'fluency') return { title: `${label}: replace hesitation with intent`, detail: `The recording contained ${text.fillerCount} fillers and ${audio.pauseCount} pauses over 0.3 seconds.`, drill: 'Speak for 30 seconds using silent one-beat pauses whenever a filler is about to appear.' };
    if (key === 'structure') return { title: `${label}: make the route visible`, detail: `Opening: ${text.hasOpening ? 'present' : 'missing'}; conclusion: ${text.hasConclusion ? 'present' : 'missing'}; reasoning links: ${text.reasoningMarkerCount}; example cues: ${text.exampleMarkerCount}.`, drill: 'Use PREP: state your Point, give a Reason, add an Example, then restate the Point.' };
    if (key === 'relevance') return { title: `${label}: tie each claim back`, detail: `The transcript used ${Math.round(text.topicKeywordCoverage * 100)}% of the topic’s key terms and the stance match was ${text.stanceSignal}.${text.stanceSignal === 'opposed' ? ' The speech appears to argue the opposite of the assigned side.' : ''}`, drill: 'Begin with an explicit position, then end each supporting point with: “This matters to my side because…”' };
    if (key === 'vocabulary') return { title: `${label}: trade repetition for precision`, detail: `Lexical variety was ${Math.round(text.uniqueWordRatio * 100)}%, content-word density was ${Math.round(text.contentWordRatio * 100)}%, and ${text.repeatedPhraseCount} phrase${text.repeatedPhraseCount === 1 ? ' was' : 's were'} repeated.`, drill: 'Pick three vague words from the transcript and replace each with a concrete noun or active verb.' };
    return { title: `${label}: add purposeful variation`, detail: `Pitch variation was ${audio.pitchVariationSemitones?.toFixed(1) ?? 'not measurable'} semitones and average level was ${audio.averageVolumeDb.toFixed(1)} dBFS.`, drill: 'Underline three key words, then repeat the answer while changing pitch or loudness only on those words.' };
  });

  const summary = text.stanceSignal === 'opposed'
    ? 'The delivery contained usable evidence, but the transcript appears to argue the opposite of the assigned side. That contradiction caps the score: in a timed round, stance compliance comes before polish.'
    : scores.overall >= 86
    ? 'A genuinely strong attempt with clear evidence across both argument and delivery. The next gain will come from polishing the weakest single habit.'
    : scores.overall >= 70
      ? 'A capable attempt with a solid base. The stricter rubric still found specific gaps that keep it from the strongest band.'
      : 'The core idea is there, but the evidence is not consistent yet. Focus on one clear structure and a steady conversational rhythm before adding complexity.';
  const weakestKeys = categories.slice(-3).reverse().map(({ key }) => key);
  return {
    summary,
    strengths,
    improvements,
    weaknesses: weakestKeys.map((key) => weaknessFor(key, audio, text)),
    reframes: context ? buildReframes(context.transcript, context.stance) : [],
    topicStrategy: context ? buildTopicStrategy(context.topic, context.stance) : undefined,
    provider: 'browser',
  };
}
