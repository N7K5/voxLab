import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL = 'Xenova/nli-deberta-v3-xsmall';

interface StanceMessage {
  id: string;
  transcript: string;
  topic: string;
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
  self.postMessage({ id, ...payload });
}

function loadClassifier(id: string): Promise<ZeroShotPipeline> {
  if (!classifierPromise) {
    classifierPromise = pipeline('zero-shot-classification', MODEL, {
      dtype: 'q8',
      progress_callback: (progress: { status?: string; progress?: number; file?: string }) => {
        post(id, {
          type: 'status',
          message: progress.status === 'progress' ? `Downloading ${progress.file ?? 'stance model'}…` : 'Preparing semantic stance model…',
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

self.onmessage = async (event: MessageEvent<StanceMessage>) => {
  const { id, transcript, topic } = event.data;
  try {
    const classifier = await loadClassifier(id);
    post(id, { type: 'status', message: 'Comparing the argument with the assigned motion…' });
    const labels = [
      `support for the motion “${topic}”`,
      `opposition to the motion “${topic}”`,
      `no clear position on the motion “${topic}”`,
    ];
    const output = await classifier(transcript.slice(0, 8_000), labels, {
      hypothesis_template: 'The speech expresses {}.',
      multi_label: false,
    });
    const ranked = output.labels.map((label, index) => ({ label, score: output.scores[index] ?? 0 }));
    const top = ranked[0] ?? { label: labels[2], score: 0 };
    const runnerUp = ranked[1]?.score ?? 0;
    const decisive = top.score >= 0.55 && top.score - runnerUp >= 0.15;
    const position = decisive && top.label.startsWith('support')
      ? 'support'
      : decisive && top.label.startsWith('opposition')
        ? 'oppose'
        : 'unclear';
    post(id, { type: 'result', position, confidence: position === 'unclear' ? undefined : top.score, model: MODEL });
  } catch (error) {
    post(id, { type: 'error', error: error instanceof Error ? error.message : 'Semantic stance analysis failed.' });
  }
};
