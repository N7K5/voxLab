import { describe, expect, it } from 'vitest';
import { buildStanceHypotheses, resolveSemanticPosition } from './stance.worker';

describe('multilingual semantic stance worker', () => {
  it('builds Bengali hypotheses around the exact motion', () => {
    const hypotheses = buildStanceHypotheses('বিদ্যালয় পরে শুরু হওয়া উচিত', 'bn');

    expect(hypotheses.map(({ position }) => position)).toEqual(['support', 'oppose', 'unclear']);
    expect(hypotheses.every(({ text }) => text.includes('বিদ্যালয় পরে শুরু হওয়া উচিত'))).toBe(true);
    expect(hypotheses[0].text).toContain('পক্ষে');
    expect(hypotheses[1].text).toContain('বিপক্ষে');
  });

  it('builds Hindi hypotheses around the exact motion', () => {
    const hypotheses = buildStanceHypotheses('विद्यालय देर से शुरू होने चाहिए', 'hi');

    expect(hypotheses.every(({ text }) => text.includes('विद्यालय देर से शुरू होने चाहिए'))).toBe(true);
    expect(hypotheses[0].text).toContain('समर्थन');
    expect(hypotheses[1].text).toContain('विरोध');
  });

  it('maps reordered model labels by exact hypothesis instead of English prefixes', () => {
    const hypotheses = buildStanceHypotheses('সবার জন্য বিশ্ববিদ্যালয় বিনামূল্যে হওয়া উচিত', 'bn');
    const result = resolveSemanticPosition({
      labels: [hypotheses[1].text, hypotheses[0].text, hypotheses[2].text],
      scores: [0.72, 0.43, 0.1],
    }, hypotheses);

    expect(result).toEqual({ position: 'oppose', confidence: 0.72 });
  });

  it('returns unclear when the top score or margin is not decisive', () => {
    const hypotheses = buildStanceHypotheses('Schools should start later', 'en');

    expect(resolveSemanticPosition({
      labels: [hypotheses[0].text, hypotheses[1].text, hypotheses[2].text],
      scores: [0.59, 0.2, 0.1],
    }, hypotheses)).toEqual({ position: 'unclear' });
    expect(resolveSemanticPosition({
      labels: [hypotheses[0].text, hypotheses[1].text, hypotheses[2].text],
      scores: [0.7, 0.58, 0.1],
    }, hypotheses)).toEqual({ position: 'unclear' });
    expect(resolveSemanticPosition({
      labels: [hypotheses[0].text, hypotheses[1].text, hypotheses[2].text],
      scores: [0.67, 0.3, 0.03],
    }, hypotheses)).toEqual({ position: 'unclear' });
  });

  it('does not expose confidence when the model selects the unclear hypothesis', () => {
    const hypotheses = buildStanceHypotheses('Schools should start later', 'en');
    const result = resolveSemanticPosition({
      labels: [hypotheses[2].text, hypotheses[0].text, hypotheses[1].text],
      scores: [0.82, 0.1, 0.08],
    }, hypotheses);

    expect(result).toEqual({ position: 'unclear' });
  });
});
