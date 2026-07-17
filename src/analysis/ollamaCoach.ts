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
  },
  required: ['summary', 'strengths', 'improvements'],
};

function buildPrompt(input: {
  topic: Topic;
  stance: Stance;
  transcript: string;
  audio: AudioMetrics;
  text: TextMetrics;
  scores: ScoreBreakdown;
}): string {
  return `You are a rigorous but encouraging public-speaking coach.
The speaker had to argue ${input.stance.toUpperCase()} this motion: "${input.topic.prompt}"

Transcript:
${input.transcript.slice(0, 12_000)}

Measured analytics (these are authoritative):
${JSON.stringify({ audio: input.audio, language: input.text, scores: input.scores })}

Return the requested JSON only. Give exactly three prioritized improvements, each with a concrete drill. Base every observation on the transcript or supplied analytics. Do not invent timestamps, facial cues, confidence, emotion, identity, or acoustic facts. Do not diagnose the speaker. Distinguish a deliberate rhetorical pause from a hesitation when the evidence is ambiguous. Keep the summary under 55 words and each list item under 45 words.`;
}

function parseContent(content: string, model: string): CoachFeedback {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned) as Partial<CoachFeedback>;
  if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.strengths) || !Array.isArray(parsed.improvements)) {
    throw new Error('Ollama returned an unexpected coaching format.');
  }
  const improvements = parsed.improvements.slice(0, 3).map((item) => {
    if (!item || typeof item.title !== 'string' || typeof item.detail !== 'string' || typeof item.drill !== 'string') {
      throw new Error('Ollama returned an incomplete improvement.');
    }
    return { title: item.title, detail: item.detail, drill: item.drill };
  });
  if (improvements.length !== 3) throw new Error('Ollama did not return three improvements.');
  const strengths = parsed.strengths.filter((value): value is string => typeof value === 'string').slice(0, 3);
  if (strengths.length < 2) throw new Error('Ollama did not return two usable strengths.');
  return {
    summary: parsed.summary,
    strengths,
    improvements,
    provider: 'ollama',
    model,
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
): Promise<CoachFeedback> {
  const prompt = buildPrompt(input);
  const body = {
    model: settings.ollamaModel,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    format: feedbackSchema,
    options: { temperature: 0.2 },
  };
  const endpoint = settings.ollamaViaServer
    ? `${apiBaseUrl.replace(/\/+$/, '')}/ai/coach`
    : ollamaChatEndpoint(settings.ollamaEndpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      credentials: settings.ollamaViaServer ? 'include' : 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Ollama did not respond within two minutes.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const result = await response.json().catch(() => null) as { message?: { content?: string }; error?: string } | null;
  if (!response.ok) throw new Error(result?.error || `Ollama request failed (${response.status}).`);
  if (!result?.message?.content) throw new Error('Ollama returned no coaching text.');
  return parseContent(result.message.content, settings.ollamaModel);
}
