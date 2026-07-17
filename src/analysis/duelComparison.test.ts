import { describe, expect, it } from 'vitest';
import type { AnalysisReport, ScoreBreakdown } from '../types';
import { compareDuel } from './duelComparison';

function report(scores: ScoreBreakdown): AnalysisReport {
  return {
    audio: {} as AnalysisReport['audio'],
    text: {} as AnalysisReport['text'],
    scores,
    feedback: { summary: '', strengths: [], improvements: [], provider: 'browser' },
    transcriptionEngine: 'test',
  };
}

const first = { overall: 72, pacing: 70, fluency: 68, vocabulary: 74, delivery: 69, structure: 78, relevance: 76 };

describe('duel comparison', () => {
  it('selects a winner and explains the largest measured gaps', () => {
    const result = compareDuel(
      'duel-1',
      { attemptId: 'a', name: 'Alex', stance: 'for', report: report(first) },
      { attemptId: 'b', name: 'Blair', stance: 'against', report: report({ overall: 65, pacing: 72, fluency: 61, vocabulary: 70, delivery: 67, structure: 62, relevance: 64 }) },
    );
    expect(result.winner).toBe(1);
    expect(result.margin).toBe(7);
    expect(result.swingFactors[0]).toContain('Alex');
    expect(result.swingFactors[0]).toContain('structure');
  });

  it('calls differences of two points or less a draw', () => {
    const result = compareDuel(
      'duel-2',
      { attemptId: 'a', name: 'Alex', stance: 'for', report: report(first) },
      { attemptId: 'b', name: 'Blair', stance: 'against', report: report({ ...first, overall: 70 }) },
    );
    expect(result.winner).toBe('tie');
  });
});
