import type { AudioMetrics, CoachFeedback, ScoreBreakdown, TextMetrics } from '../types';

function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function calculateScores(audio: AudioMetrics, text: TextMetrics): ScoreBreakdown {
  const paceDistance = text.wordsPerMinute < 120
    ? 120 - text.wordsPerMinute
    : Math.max(0, text.wordsPerMinute - 175);
  const pacing = clampScore(100 - paceDistance * 0.85);
  const fluency = clampScore(100 - text.fillersPerMinute * 5 - audio.longPauseCount * 7 - Math.max(0, audio.silenceRatio - 0.32) * 80);
  const expectedDiversity = text.wordCount < 45 ? 0.7 : text.wordCount < 90 ? 0.58 : 0.5;
  const vocabulary = clampScore(72 + (text.uniqueWordRatio - expectedDiversity) * 90 + Math.min(15, text.transitionCount * 3) - text.repeatedPhraseCount * 2);
  const pitchVariation = audio.pitchVariationSemitones ?? 0;
  const volumeScore = audio.averageVolumeDb < -42 ? 55 : audio.averageVolumeDb > -8 ? 70 : 92;
  const delivery = audio.voicedSeconds < 0.25
    ? 0
    : clampScore(
      volumeScore
      + (audio.pitchVariationSemitones === null ? -12 : Math.min(10, pitchVariation * 3))
      - Math.max(0, audio.clippingRatio - 0.001) * 700,
    );
  const structure = clampScore(38 + (text.hasOpening ? 22 : 0) + (text.hasConclusion ? 22 : 0) + Math.min(18, text.transitionCount * 4));
  const relevance = clampScore(35 + text.topicKeywordCoverage * 55 + (text.stanceSignal === 'aligned' ? 10 : text.stanceSignal === 'mixed' ? 4 : 0));
  const overall = clampScore(
    pacing * 0.16 + fluency * 0.19 + vocabulary * 0.14 + delivery * 0.16 + structure * 0.18 + relevance * 0.17,
  );
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
    return `${label} was one of the strongest areas in this attempt (${score}/100).`;
  });

  const improvements = categories.slice(-3).reverse().map(({ key, label }) => {
    if (key === 'pacing') {
      const direction = text.wordsPerMinute < 120 ? 'quicker' : 'slower';
      return { title: `${label}: find the conversational zone`, detail: `Your measured pace was ${Math.round(text.wordsPerMinute)} WPM. Aim for roughly 120–175 WPM, adjusting for emphasis.`, drill: `Repeat the answer once ${direction}, placing a deliberate breath after each main claim.` };
    }
    if (key === 'fluency') return { title: `${label}: replace hesitation with intent`, detail: `The recording contained ${text.fillerCount} fillers and ${audio.pauseCount} pauses over 0.3 seconds.`, drill: 'Speak for 30 seconds using silent one-beat pauses whenever a filler is about to appear.' };
    if (key === 'structure') return { title: `${label}: make the route visible`, detail: `Opening signpost: ${text.hasOpening ? 'present' : 'missing'}. Conclusion signpost: ${text.hasConclusion ? 'present' : 'missing'}.`, drill: 'Use PREP: state your Point, give a Reason, add an Example, then restate the Point.' };
    if (key === 'relevance') return { title: `${label}: tie each claim back`, detail: `The transcript used ${Math.round(text.topicKeywordCoverage * 100)}% of the topic’s key terms and the stance was ${text.stanceSignal}.`, drill: 'Begin each supporting point with: “This matters to the motion because…”' };
    if (key === 'vocabulary') return { title: `${label}: trade repetition for precision`, detail: `Vocabulary diversity was ${Math.round(text.uniqueWordRatio * 100)}%, with ${text.repeatedPhraseCount} repeated phrase${text.repeatedPhraseCount === 1 ? '' : 's'}.`, drill: 'Pick three vague words from the transcript and replace each with a concrete noun or active verb.' };
    return { title: `${label}: add purposeful variation`, detail: `Pitch variation was ${audio.pitchVariationSemitones?.toFixed(1) ?? 'not measurable'} semitones and average level was ${audio.averageVolumeDb.toFixed(1)} dBFS.`, drill: 'Underline three key words, then repeat the answer while changing pitch or loudness only on those words.' };
  });

  const summary = scores.overall >= 82
    ? 'A convincing attempt with a clear base. The next gain will come from polishing the weakest single habit.'
    : scores.overall >= 65
      ? 'A solid foundation: your message came through, and a few targeted delivery changes can make it much sharper.'
      : 'The core idea is there. Focus on one simple structure and a steady conversational rhythm before adding complexity.';
  return { summary, strengths, improvements, provider: 'browser' };
}
