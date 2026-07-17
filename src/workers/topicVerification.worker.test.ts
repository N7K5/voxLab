import { describe, expect, it } from 'vitest';
import { buildTopicSuitabilityLabels, resolveTopicSuitability } from './topicVerification.worker';

describe('topic verification worker helpers', () => {
  it('provides localized suitability labels', () => {
    expect(buildTopicSuitabilityLabels('en')[0].verdict).toBe('suitable');
    expect(buildTopicSuitabilityLabels('bn')[0].text).toMatch(/\p{Script=Bengali}/u);
    expect(buildTopicSuitabilityLabels('hi')[0].text).toMatch(/\p{Script=Devanagari}/u);
  });

  it('accepts only a decisive suitable result', () => {
    const labels = buildTopicSuitabilityLabels('en');
    expect(resolveTopicSuitability({
      labels: [labels[0].text, labels[1].text, labels[2].text, labels[3].text],
      scores: [0.62, 0.18, 0.12, 0.08],
    }, labels).accepted).toBe(true);
    expect(resolveTopicSuitability({
      labels: [labels[0].text, labels[1].text, labels[2].text, labels[3].text],
      scores: [0.41, 0.29, 0.2, 0.1],
    }, labels).accepted).toBe(false);
    expect(resolveTopicSuitability({
      labels: [labels[0].text, labels[1].text, labels[2].text, labels[3].text],
      scores: [0.48, 0.43, 0.05, 0.04],
    }, labels).accepted).toBe(false);
  });

  it('enforces both the confidence floor and winning margin at their boundaries', () => {
    const labels = buildTopicSuitabilityLabels('en');
    const orderedLabels = labels.map(({ text }) => text);
    expect(resolveTopicSuitability({ labels: orderedLabels, scores: [0.55, 0.4, 0.03, 0.02] }, labels).accepted)
      .toBe(true);
    expect(resolveTopicSuitability({ labels: orderedLabels, scores: [0.549, 0.3, 0.1, 0.051] }, labels).accepted)
      .toBe(false);
    expect(resolveTopicSuitability({ labels: orderedLabels, scores: [0.7, 0.58, 0.1, 0.02] }, labels).accepted)
      .toBe(true);
    expect(resolveTopicSuitability({ labels: orderedLabels, scores: [0.69, 0.58, 0.1, 0.03] }, labels).accepted)
      .toBe(false);
  });

  it('fails closed for unknown labels and non-finite confidence', () => {
    const labels = buildTopicSuitabilityLabels('en');
    expect(resolveTopicSuitability({ labels: ['unexpected label'], scores: [0.99] }, labels))
      .toMatchObject({ accepted: false, verdict: 'not_a_motion' });
    expect(resolveTopicSuitability({ labels: [labels[0].text], scores: [Number.NaN] }, labels).accepted)
      .toBe(false);
  });

  it('rejects a decisive unsuitable label', () => {
    const labels = buildTopicSuitabilityLabels('hi');
    const result = resolveTopicSuitability({
      labels: [labels[1].text, labels[0].text, labels[2].text, labels[3].text],
      scores: [0.72, 0.15, 0.08, 0.05],
    }, labels);
    expect(result).toMatchObject({ accepted: false, verdict: 'too_narrow' });
  });
});
