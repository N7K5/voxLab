import type { AudioMetrics, CoachFeedback, ScoreBreakdown, Stance, TextMetrics, Topic, UserSettings } from '../types';

const feedbackSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 },
    improvements: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          drill: { type: 'string' },
        },
        required: ['title', 'detail', 'drill'],
      },
    },
    weaknesses: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          evidence: { type: 'string' },
          whyItMatters: { type: 'string' },
          howToImprove: { type: 'string' },
        },
        required: ['title', 'evidence', 'whyItMatters', 'howToImprove'],
      },
    },
    reframes: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          original: { type: 'string' },
          issue: { type: 'string' },
          revised: { type: 'string' },
          principle: { type: 'string' },
        },
        required: ['original', 'issue', 'revised', 'principle'],
      },
    },
    topicStrategy: {
      type: 'object',
      additionalProperties: false,
      properties: {
        coreQuestion: { type: 'string' },
        angles: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
        strongestCounterargument: { type: 'string' },
        nextOutline: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
      },
      required: ['coreQuestion', 'angles', 'strongestCounterargument', 'nextOutline'],
    },
  },
  required: ['summary', 'strengths', 'improvements', 'weaknesses', 'reframes', 'topicStrategy'],
};

function buildPrompt(input: {
  topic: Topic;
  stance: Stance;
  transcript: string;
  audio: AudioMetrics;
  text: TextMetrics;
  scores: ScoreBreakdown;
}): string {
  const languageInstruction = coachingLanguageInstruction(input.topic.language);
  return `You are a rigorous but encouraging public-speaking coach.
The speaker had to argue ${input.stance.toUpperCase()} this motion: "${input.topic.prompt}"

Output language:
${languageInstruction}

Transcript:
${input.transcript.slice(0, 12_000)}

Measured analytics (these are authoritative):
${JSON.stringify({ audio: input.audio, language: input.text, scores: input.scores })}

Return the requested JSON only. Give exactly three prioritized improvements and exactly three weaknesses. For every weakness, separate the observed evidence, why it matters to a listener, and how to improve it. Include one or two reframes whose "original" text is copied exactly from the transcript, then give a tighter version without changing the speaker's position. Build a topic strategy with three reasoning angles and a four-step next outline.

Base every observation on the transcript or supplied analytics. Do not invent timestamps, quotations, facial cues, confidence, emotion, identity, or acoustic facts. Do not diagnose the speaker. Distinguish a deliberate rhetorical pause from a hesitation when the evidence is ambiguous. Keep the summary under 55 words and each individual field concise.`;
}

function stringField(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value.trim();
}

function coachingLanguageInstruction(language: Topic['language']): string {
  if (language === 'bn') {
    return 'Write every natural-language JSON value in Bengali. Keep each "original" quotation copied exactly from the Bengali transcript; do not translate that quotation.';
  }
  if (language === 'hi') {
    return 'Write every natural-language JSON value in Hindi using Devanagari script. Keep each "original" quotation copied exactly from the Hindi transcript; do not translate that quotation.';
  }
  return 'Write every natural-language JSON value in English.';
}

function containsRequestedScript(value: string, language: Topic['language']): boolean {
  const script = language === 'bn'
    ? /\p{Script=Bengali}/u
    : language === 'hi'
      ? /\p{Script=Devanagari}/u
      : null;
  if (script === null) return true;
  const letters = [...value].filter((character) => /\p{L}/u.test(character));
  const targetLetters = letters.filter((character) => script.test(character)).length;
  return targetLetters >= 3 && targetLetters / Math.max(1, letters.length) >= 0.35;
}

function languageName(language: Topic['language']): string {
  if (language === 'bn') return 'Bengali';
  if (language === 'hi') return 'Hindi';
  return 'English';
}

function normalizedComparableText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function lexicalComparableText(value: string): string {
  return (value.toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).join(' ');
}

function parseContent(content: string, model: string, transcript: string, language: Topic['language']): CoachFeedback {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned) as Partial<CoachFeedback>;
  if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.strengths) || !Array.isArray(parsed.improvements)) {
    throw new Error('Ollama returned an unexpected coaching format.');
  }
  const summary = stringField(parsed.summary, 'Ollama returned an empty summary.');
  const improvements = parsed.improvements.slice(0, 3).map((item) => {
    if (!item || typeof item.title !== 'string' || typeof item.detail !== 'string' || typeof item.drill !== 'string') {
      throw new Error('Ollama returned an incomplete improvement.');
    }
    return {
      title: stringField(item.title, 'Ollama returned an incomplete improvement.'),
      detail: stringField(item.detail, 'Ollama returned an incomplete improvement.'),
      drill: stringField(item.drill, 'Ollama returned an incomplete improvement.'),
    };
  });
  if (improvements.length !== 3) throw new Error('Ollama did not return three improvements.');
  const strengths = parsed.strengths.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).slice(0, 3).map((value) => value.trim());
  if (strengths.length < 2) throw new Error('Ollama did not return two usable strengths.');
  if (!Array.isArray(parsed.weaknesses) || parsed.weaknesses.length !== 3) {
    throw new Error('Ollama did not return three usable weaknesses.');
  }
  const weaknesses = parsed.weaknesses.map((item) => ({
    title: stringField(item?.title, 'Ollama returned an incomplete weakness.'),
    evidence: stringField(item?.evidence, 'Ollama returned an incomplete weakness.'),
    whyItMatters: stringField(item?.whyItMatters, 'Ollama returned an incomplete weakness.'),
    howToImprove: stringField(item?.howToImprove, 'Ollama returned an incomplete weakness.'),
  }));
  if (!Array.isArray(parsed.reframes) || parsed.reframes.length < 1) {
    throw new Error('Ollama did not return a usable sentence reframe.');
  }
  const seenOriginals = new Set<string>();
  const reframes = parsed.reframes.slice(0, 2).map((item) => {
    const original = stringField(item?.original, 'Ollama returned an incomplete sentence reframe.');
    const normalizedOriginal = normalizedComparableText(original);
    if (!transcript.includes(original)) {
      throw new Error('Ollama returned a quotation that was not in the transcript.');
    }
    if (seenOriginals.has(normalizedOriginal)) {
      throw new Error('Ollama returned duplicate quotations for its sentence reframes.');
    }
    seenOriginals.add(normalizedOriginal);
    const revised = stringField(item?.revised, 'Ollama returned an incomplete sentence reframe.');
    if (lexicalComparableText(revised) === lexicalComparableText(original)) {
      throw new Error('Ollama returned a sentence reframe that did not change the original wording.');
    }
    return {
      original,
      issue: stringField(item?.issue, 'Ollama returned an incomplete sentence reframe.'),
      revised,
      principle: stringField(item?.principle, 'Ollama returned an incomplete sentence reframe.'),
    };
  });
  const strategy = parsed.topicStrategy;
  if (!strategy || !Array.isArray(strategy.angles) || strategy.angles.length < 3 || !Array.isArray(strategy.nextOutline) || strategy.nextOutline.length < 4) {
    throw new Error('Ollama returned an incomplete topic strategy.');
  }
  const topicStrategy = {
    coreQuestion: stringField(strategy.coreQuestion, 'Ollama returned an incomplete topic strategy.'),
    angles: strategy.angles.slice(0, 3).map((value) => stringField(value, 'Ollama returned an incomplete topic strategy.')),
    strongestCounterargument: stringField(strategy.strongestCounterargument, 'Ollama returned an incomplete topic strategy.'),
    nextOutline: strategy.nextOutline.slice(0, 4).map((value) => stringField(value, 'Ollama returned an incomplete topic strategy.')),
  };
  if (language === 'bn' || language === 'hi') {
    const generatedFields = [
      summary,
      ...strengths,
      ...improvements.flatMap((item) => [item.title, item.detail, item.drill]),
      ...weaknesses.flatMap((item) => [item.title, item.evidence, item.whyItMatters, item.howToImprove]),
      ...reframes.flatMap((item) => [item.issue, item.revised, item.principle]),
      topicStrategy.coreQuestion,
      ...topicStrategy.angles,
      topicStrategy.strongestCounterargument,
      ...topicStrategy.nextOutline,
    ];
    if (generatedFields.some((field) => !containsRequestedScript(field, language))) {
      throw new Error(`Ollama did not return the requested ${languageName(language)} coaching, so browser coaching was used.`);
    }
  }
  return {
    summary,
    strengths,
    improvements,
    weaknesses,
    reframes,
    topicStrategy,
    provider: 'ollama',
    model,
    language: language ?? 'en',
  };
}

export function ollamaChatEndpoint(endpoint: string): string {
  const base = endpoint.trim().replace(/\/+$/, '');
  if (!base) throw new Error('An Ollama endpoint is required.');
  if (/\/api\/chat$/i.test(base)) return base;
  if (/\/api$/i.test(base)) return `${base}/chat`;
  return `${base}/api/chat`;
}

export async function requestOllamaFeedback(
  input: Parameters<typeof buildPrompt>[0],
  settings: UserSettings,
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<CoachFeedback> {
  const prompt = buildPrompt(input);
  const body = {
    model: settings.ollamaModel,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    format: feedbackSchema,
    options: { temperature: 0.2, num_predict: 1_600 },
  };
  const endpoint = settings.ollamaViaServer
    ? `${apiBaseUrl.replace(/\/+$/, '')}/ai/coach`
    : ollamaChatEndpoint(settings.ollamaEndpoint);
  if (signal?.aborted) throw new DOMException('Coaching generation was cancelled.', 'AbortError');
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let response: Response;
  let result: { message?: { content?: string }; error?: string } | null;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      credentials: settings.ollamaViaServer ? 'include' : 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    result = await response.json().catch(() => null) as { message?: { content?: string }; error?: string } | null;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Coaching generation was cancelled.', 'AbortError');
    if (controller.signal.aborted) throw new Error('Ollama did not respond within two minutes.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
  if (signal?.aborted) throw new DOMException('Coaching generation was cancelled.', 'AbortError');
  if (controller.signal.aborted) throw new Error('Ollama did not respond within two minutes.');
  if (!response.ok) throw new Error(result?.error || `Ollama request failed (${response.status}).`);
  if (!result?.message?.content) throw new Error('Ollama returned no coaching text.');
  return parseContent(result.message.content, settings.ollamaModel, input.transcript, input.topic.language);
}

export const ollamaCoachTestHelpers = { parseContent, coachingLanguageInstruction };
