import type { AudioMetrics, CoachFeedback, ScoreBreakdown, TextMetrics } from '../types';

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
    + (text.stanceSignal === 'aligned' ? 16 : text.stanceSignal === 'mixed' ? 7 : 0)
    + Math.min(10, text.reasoningMarkerCount * 3);
  const relevance = Math.min(languageCeiling, clampScore(rawRelevance));
  const evidenceCeiling = Math.round(languageCeiling * 0.55 + voiceCeiling * 0.45);
  const weighted = pacing * 0.13
    + fluency * 0.18
    + vocabulary * 0.14
    + delivery * 0.14
    + structure * 0.22
    + relevance * 0.19;
  const overall = Math.min(evidenceCeiling, clampScore(weighted - 2));
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

export function browserFeedback(scores: ScoreBreakdown, audio: AudioMetrics, text: TextMetrics): CoachFeedback {
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
    if (key === 'relevance') return `${label}: topic-term coverage was ${Math.round(text.topicKeywordCoverage * 100)}%, with the stance signal measured as ${text.stanceSignal}.`;
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
    if (key === 'relevance') return { title: `${label}: tie each claim back`, detail: `The transcript used ${Math.round(text.topicKeywordCoverage * 100)}% of the topic’s key terms and the stance was ${text.stanceSignal}.`, drill: 'Begin each supporting point with: “This matters to the motion because…”' };
    if (key === 'vocabulary') return { title: `${label}: trade repetition for precision`, detail: `Lexical variety was ${Math.round(text.uniqueWordRatio * 100)}%, content-word density was ${Math.round(text.contentWordRatio * 100)}%, and ${text.repeatedPhraseCount} phrase${text.repeatedPhraseCount === 1 ? ' was' : 's were'} repeated.`, drill: 'Pick three vague words from the transcript and replace each with a concrete noun or active verb.' };
    return { title: `${label}: add purposeful variation`, detail: `Pitch variation was ${audio.pitchVariationSemitones?.toFixed(1) ?? 'not measurable'} semitones and average level was ${audio.averageVolumeDb.toFixed(1)} dBFS.`, drill: 'Underline three key words, then repeat the answer while changing pitch or loudness only on those words.' };
  });

  const summary = scores.overall >= 86
    ? 'A genuinely strong attempt with clear evidence across both argument and delivery. The next gain will come from polishing the weakest single habit.'
    : scores.overall >= 70
      ? 'A capable attempt with a solid base. The stricter rubric still found specific gaps that keep it from the strongest band.'
      : 'The core idea is there, but the evidence is not consistent yet. Focus on one clear structure and a steady conversational rhythm before adding complexity.';
  return { summary, strengths, improvements, provider: 'browser' };
}
