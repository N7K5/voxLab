import { describe, expect, it } from 'vitest';
import { ollamaCoachTestHelpers } from './ollamaCoach';

function response(field: string, original: string) {
  return JSON.stringify({
    summary: field,
    strengths: [field, field],
    improvements: Array.from({ length: 3 }, () => ({ title: field, detail: field, drill: field })),
    weaknesses: Array.from({ length: 3 }, () => ({
      title: field,
      evidence: field,
      whyItMatters: field,
      howToImprove: field,
    })),
    reframes: [{ original, issue: field, revised: field, principle: field }],
    topicStrategy: {
      coreQuestion: field,
      angles: [field, field, field],
      strongestCounterargument: field,
      nextOutline: [field, field, field, field],
    },
  });
}

describe('Ollama coaching language validation', () => {
  it('rejects English coaching mislabeled as Bengali', () => {
    const transcript = 'আমি এই প্রস্তাবের পক্ষে।';
    expect(() => ollamaCoachTestHelpers.parseContent(
      response('English coaching text', transcript),
      'test-model',
      transcript,
      'bn',
    )).toThrow(/requested Bengali coaching/u);
  });

  it('accepts Bengali coaching with an exact Bengali quotation', () => {
    const transcript = 'আমি এই প্রস্তাবের পক্ষে।';
    const feedback = ollamaCoachTestHelpers.parseContent(
      response('বাংলা কোচিং পরামর্শ', transcript),
      'test-model',
      transcript,
      'bn',
    );
    expect(feedback.language).toBe('bn');
    expect(feedback.reframes?.[0]?.original).toBe(transcript);
  });
});
