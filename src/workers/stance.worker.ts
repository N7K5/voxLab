import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL = 'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7';
const MIN_DECISIVE_SCORE = 0.68;
const MIN_DECISIVE_MARGIN = 0.2;

export type SemanticStanceLanguage = 'en' | 'bn' | 'hi';
export type SemanticPosition = 'support' | 'oppose' | 'unclear';

interface StanceHypothesis {
  position: SemanticPosition;
  text: string;
}

interface StanceMessage {
  id: string;
  transcript: string;
  topic: string;
  language?: SemanticStanceLanguage;
}

interface ZeroShotOutput {
  labels: string[];
  scores: number[];
}

type ZeroShotPipeline = (
  input: string,
  labels: string[],
  options: Record<string, unknown>,
) => Promise<ZeroShotOutput>;

let classifierPromise: Promise<ZeroShotPipeline> | null = null;

function post(id: string, payload: Record<string, unknown>): void {
  (globalThis as unknown as DedicatedWorkerGlobalScope).postMessage({ id, ...payload });
}

function normalizeLanguage(language: unknown): SemanticStanceLanguage {
  return language === 'bn' || language === 'hi' ? language : 'en';
}

export function buildStanceHypotheses(topic: string, language: SemanticStanceLanguage): StanceHypothesis[] {
  const quotedTopic = `“${topic.trim()}”`;
  if (language === 'bn') {
    return [
      { position: 'support', text: `বক্তার অবস্থান ${quotedTopic} প্রস্তাবটির পক্ষে।` },
      { position: 'oppose', text: `বক্তার অবস্থান ${quotedTopic} প্রস্তাবটির বিপক্ষে।` },
      { position: 'unclear', text: `বক্তা ${quotedTopic} প্রস্তাবটিতে কোনো স্পষ্ট পক্ষ নেননি।` },
    ];
  }
  if (language === 'hi') {
    return [
      { position: 'support', text: `वक्ता का रुख ${quotedTopic} प्रस्ताव के समर्थन में है।` },
      { position: 'oppose', text: `वक्ता का रुख ${quotedTopic} प्रस्ताव के विरोध में है।` },
      { position: 'unclear', text: `वक्ता ने ${quotedTopic} प्रस्ताव पर कोई स्पष्ट पक्ष नहीं लिया है।` },
    ];
  }
  return [
    { position: 'support', text: `The speaker's position supports the motion ${quotedTopic}.` },
    { position: 'oppose', text: `The speaker's position opposes the motion ${quotedTopic}.` },
    { position: 'unclear', text: `The speaker does not take a clear position on the motion ${quotedTopic}.` },
  ];
}

export function resolveSemanticPosition(
  output: Pick<ZeroShotOutput, 'labels' | 'scores'>,
  hypotheses: StanceHypothesis[],
): { position: SemanticPosition; confidence?: number } {
  const topLabel = output.labels[0];
  const topScore = Number.isFinite(output.scores[0]) ? output.scores[0] : 0;
  const runnerUpScore = Number.isFinite(output.scores[1]) ? output.scores[1] : 0;
  const matched = hypotheses.find((hypothesis) => hypothesis.text === topLabel);
  const decisive = topScore >= MIN_DECISIVE_SCORE && topScore - runnerUpScore >= MIN_DECISIVE_MARGIN;

  if (!matched || !decisive || matched.position === 'unclear') return { position: 'unclear' };
  return { position: matched.position, confidence: topScore };
}

function representativeTranscript(transcript: string): string {
  const normalized = transcript.replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ').filter(Boolean);
  const maximumWords = 160;
  if (words.length <= maximumWords) return normalized;

  const middleStart = Math.max(0, Math.floor(words.length / 2) - 20);
  return [
    ...words.slice(0, 60),
    '…',
    ...words.slice(middleStart, middleStart + 40),
    '…',
    ...words.slice(-60),
  ].join(' ');
}

function comparisonMessage(language: SemanticStanceLanguage): string {
  if (language === 'bn') return 'বক্তব্যটি নির্ধারিত প্রস্তাবের সঙ্গে তুলনা করা হচ্ছে…';
  if (language === 'hi') return 'भाषण की निर्धारित प्रस्ताव से तुलना की जा रही है…';
  return 'Comparing the argument with the assigned motion…';
}

function loadClassifier(id: string): Promise<ZeroShotPipeline> {
  if (!classifierPromise) {
    classifierPromise = pipeline('zero-shot-classification', MODEL, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (progress: { status?: string; progress?: number; file?: string }) => {
        post(id, {
          type: 'status',
          message: progress.status === 'progress'
            ? `Loading ${progress.file ?? 'stance model'} (browser cache or network)…`
            : 'Preparing semantic stance model…',
          progress: typeof progress.progress === 'number' ? progress.progress : undefined,
        });
      },
    }).then((loaded) => loaded as unknown as ZeroShotPipeline).catch((error) => {
      classifierPromise = null;
      throw error;
    });
  }
  return classifierPromise;
}

async function handleMessage(event: MessageEvent<StanceMessage>): Promise<void> {
  const { id, transcript, topic } = event.data;
  const language = normalizeLanguage(event.data.language);
  try {
    const classifier = await loadClassifier(id);
    post(id, { type: 'status', message: comparisonMessage(language) });
    const hypotheses = buildStanceHypotheses(topic, language);
    const output = await classifier(representativeTranscript(transcript), hypotheses.map(({ text }) => text), {
      hypothesis_template: '{}',
      multi_label: false,
    });
    const result = resolveSemanticPosition(output, hypotheses);
    post(id, { type: 'result', ...result, model: MODEL });
  } catch (error) {
    post(id, { type: 'error', error: error instanceof Error ? error.message : 'Semantic stance analysis failed.' });
  }
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  (globalThis as unknown as DedicatedWorkerGlobalScope).onmessage = handleMessage;
}
