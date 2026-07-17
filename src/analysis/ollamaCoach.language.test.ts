import { describe, expect, it } from 'vitest';
import { ollamaCoachTestHelpers } from './ollamaCoach';

function response(
  field: string,
  original: string,
  reframes = [{ original, issue: field, revised: field, principle: field }],
) {
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
    reframes,
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

  it('requests Hindi JSON while preserving exact transcript quotations', () => {
    const instruction = ollamaCoachTestHelpers.coachingLanguageInstruction('hi');

    expect(instruction).toContain('Hindi');
    expect(instruction).toContain('Devanagari');
    expect(instruction).toContain('copied exactly');
    expect(instruction).toContain('do not translate');
  });

  it('rejects English coaching mislabeled as Hindi', () => {
    const transcript = 'मैं इस प्रस्ताव के पक्ष में हूँ।';
    expect(() => ollamaCoachTestHelpers.parseContent(
      response('English coaching text', transcript),
      'test-model',
      transcript,
      'hi',
    )).toThrow(/requested Hindi coaching/u);
  });

  it('accepts Hindi coaching with an exact Hindi quotation', () => {
    const transcript = 'मैं इस प्रस्ताव के पक्ष में हूँ।';
    const feedback = ollamaCoachTestHelpers.parseContent(
      response('हिंदी भाषण सुधार सलाह', transcript),
      'test-model',
      transcript,
      'hi',
    );

    expect(feedback.language).toBe('hi');
    expect(feedback.reframes?.[0]?.original).toBe(transcript);
  });

  it('rejects duplicate sentence-workshop quotations', () => {
    const transcript = 'I support this motion because later school starts improve sleep.';
    const original = 'later school starts improve sleep';
    expect(() => ollamaCoachTestHelpers.parseContent(
      response('Useful coaching detail', original, [
        { original, issue: 'The link is vague.', revised: 'Later starts improve attention by protecting sleep.', principle: 'Name the mechanism.' },
        { original, issue: 'The claim needs evidence.', revised: 'More sleep helps students sustain attention.', principle: 'Add a consequence.' },
      ]),
      'test-model',
      transcript,
      'en',
    )).toThrow(/duplicate quotations/u);
  });

  it('rejects a reframe that leaves the original wording unchanged', () => {
    const transcript = 'I support this motion because students need enough sleep.';
    const original = 'students need enough sleep';
    expect(() => ollamaCoachTestHelpers.parseContent(
      response('Useful coaching detail', original, [
        { original, issue: 'The reason is broad.', revised: `  ${original.toUpperCase()}  `, principle: 'Make the consequence specific.' },
      ]),
      'test-model',
      transcript,
      'en',
    )).toThrow(/did not change/u);
  });

  it('keeps exact-quote grounding for generated reframes', () => {
    const transcript = 'I support this motion because students need enough sleep.';
    expect(() => ollamaCoachTestHelpers.parseContent(
      response('Useful coaching detail', 'teachers need more time'),
      'test-model',
      transcript,
      'en',
    )).toThrow(/not in the transcript/u);
  });

  it('requires a literal transcript quotation rather than a normalized approximation', () => {
    const transcript = 'I support this motion because students need enough sleep.';
    expect(() => ollamaCoachTestHelpers.parseContent(
      response('Useful coaching detail', 'STUDENTS NEED ENOUGH SLEEP'),
      'test-model',
      transcript,
      'en',
    )).toThrow(/not in the transcript/u);
  });

  it('rejects Latin-dominant fields with only a token Hindi suffix', () => {
    const transcript = 'मैं इस प्रस्ताव के पक्ष में हूँ।';
    expect(() => ollamaCoachTestHelpers.parseContent(
      response('Improve pacing and structure अब', transcript),
      'test-model',
      transcript,
      'hi',
    )).toThrow(/requested Hindi coaching/u);
  });

  it('rejects punctuation-only sentence changes', () => {
    const transcript = 'Students need enough sleep.';
    const original = 'Students need enough sleep.';
    expect(() => ollamaCoachTestHelpers.parseContent(
      response('Useful coaching detail', original, [
        { original, issue: 'The sentence needs work.', revised: 'Students need enough sleep!', principle: 'Make a meaningful edit.' },
      ]),
      'test-model',
      transcript,
      'en',
    )).toThrow(/did not change/u);
  });
});
