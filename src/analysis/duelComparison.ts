import type { AnalysisReport, DuelComparison, ScoreBreakdown, Stance } from '../types';

const categoryLabels: Record<Exclude<keyof ScoreBreakdown, 'overall'>, string> = {
  pacing: 'pacing',
  fluency: 'fluency',
  vocabulary: 'vocabulary',
  delivery: 'delivery',
  structure: 'structure',
  relevance: 'relevance',
};

const categoryKeys = Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>;

interface DuelSpeakerInput {
  attemptId: string;
  name: string;
  stance: Stance;
  report: AnalysisReport;
}

export function compareDuel(
  duelId: string,
  speaker1: DuelSpeakerInput,
  speaker2: DuelSpeakerInput,
): Omit<DuelComparison, 'currentSpeaker'> {
  const firstScore = speaker1.report.scores.overall;
  const secondScore = speaker2.report.scores.overall;
  const rawMargin = Math.abs(firstScore - secondScore);
  const winner: DuelComparison['winner'] = rawMargin <= 2
    ? 'tie'
    : firstScore > secondScore ? 1 : 2;

  const differences = categoryKeys
    .map((key) => ({
      key,
      label: categoryLabels[key],
      difference: speaker1.report.scores[key] - speaker2.report.scores[key],
    }))
    .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference));

  const swingFactors = differences.slice(0, 3).map(({ label, difference }) => {
    if (Math.abs(difference) <= 2) return `${label[0].toUpperCase()}${label.slice(1)} was effectively even.`;
    const leader = difference > 0 ? speaker1.name : speaker2.name;
    return `${leader} led ${label} by ${Math.abs(difference)} points.`;
  });

  const verdict = winner === 'tie'
    ? `A close draw: only ${rawMargin} point${rawMargin === 1 ? '' : 's'} separated the two speeches.`
    : `${winner === 1 ? speaker1.name : speaker2.name} won this round by ${rawMargin} points on the shared rubric.`;

  return {
    duelId,
    speaker1: {
      attemptId: speaker1.attemptId,
      name: speaker1.name,
      stance: speaker1.stance,
      scores: speaker1.report.scores,
    },
    speaker2: {
      attemptId: speaker2.attemptId,
      name: speaker2.name,
      stance: speaker2.stance,
      scores: speaker2.report.scores,
    },
    winner,
    margin: rawMargin,
    verdict,
    swingFactors,
  };
}
