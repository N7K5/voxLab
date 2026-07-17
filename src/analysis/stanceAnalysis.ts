import type { Stance, TextMetrics } from '../types';

export type SemanticStanceLanguage = 'en' | 'bn' | 'hi';

export interface SemanticStanceResult {
  signal: 'aligned' | 'opposed' | 'unclear';
  confidence?: number;
  engine: string;
}

export function mergeStanceAssessment(
  fast: Pick<TextMetrics, 'stanceSignal' | 'stanceConfidence' | 'stanceEngine'>,
  semantic: SemanticStanceResult,
): Pick<TextMetrics, 'stanceSignal' | 'stanceConfidence' | 'stanceEngine'> {
  if (semantic.signal === 'unclear' && fast.stanceSignal !== 'unclear') {
    return {
      ...fast,
      stanceEngine: `${fast.stanceEngine ?? 'Fast phrase signals'} · semantic check inconclusive`,
    };
  }
  const fastIsDecisive = fast.stanceSignal === 'aligned' || fast.stanceSignal === 'opposed';
  const signalsConflict = fastIsDecisive
    && semantic.signal !== 'unclear'
    && fast.stanceSignal !== semantic.signal;
  if (signalsConflict) {
    return {
      stanceSignal: 'mixed',
      stanceConfidence: Math.min(semantic.confidence ?? 0.65, fast.stanceConfidence ?? 0.65),
      stanceEngine: `${semantic.engine} · conflicts with ${fast.stanceEngine ?? 'fast phrase signals'}`,
    };
  }
  return {
    stanceSignal: semantic.signal,
    stanceConfidence: semantic.confidence,
    stanceEngine: semantic.engine,
  };
}

interface PendingRequest {
  resolve: (value: SemanticStanceResult) => void;
  reject: (reason: Error) => void;
  stance: Stance;
  onProgress?: (message: string, progress?: number) => void;
  timeout: ReturnType<typeof globalThis.setTimeout>;
  cleanup: () => void;
}

let worker: Worker | null = null;
const pending = new Map<string, PendingRequest>();
const STANCE_TIMEOUT_MS = 240_000;

function stanceAbortError(): DOMException {
  return new DOMException('Semantic stance analysis was cancelled.', 'AbortError');
}

function stopWorker(error: Error): void {
  for (const request of pending.values()) {
    globalThis.clearTimeout(request.timeout);
    request.cleanup();
    request.reject(error);
  }
  pending.clear();
  worker?.terminate();
  worker = null;
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/stance.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
    const id = String(event.data.id);
    const request = pending.get(id);
    if (!request) return;
    if (event.data.type === 'status') {
      request.onProgress?.(String(event.data.message), typeof event.data.progress === 'number' ? event.data.progress : undefined);
      return;
    }
    pending.delete(id);
    globalThis.clearTimeout(request.timeout);
    request.cleanup();
    if (event.data.type === 'error') {
      request.reject(new Error(String(event.data.error)));
      return;
    }
    const position = event.data.position;
    const aligned = (position === 'support' && request.stance === 'for') || (position === 'oppose' && request.stance === 'against');
    const opposed = (position === 'support' && request.stance === 'against') || (position === 'oppose' && request.stance === 'for');
    request.resolve({
      signal: aligned ? 'aligned' : opposed ? 'opposed' : 'unclear',
      confidence: typeof event.data.confidence === 'number' ? event.data.confidence : undefined,
      engine: `Local semantic NLI · ${String(event.data.model ?? 'DeBERTa xsmall')}`,
    });
  };
  worker.onerror = (event) => {
    stopWorker(new Error(event.message || 'The stance-analysis worker stopped.'));
  };
  return worker;
}

export function analyzeStanceSemantically(input: {
  transcript: string;
  topic: string;
  stance: Stance;
  language?: SemanticStanceLanguage;
  onProgress?: (message: string, progress?: number) => void;
  signal?: AbortSignal;
}): Promise<SemanticStanceResult> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(stanceAbortError());
      return;
    }
    const onAbort = () => {
      if (pending.has(id)) stopWorker(stanceAbortError());
    };
    const cleanup = () => input.signal?.removeEventListener('abort', onAbort);
    const timeout = globalThis.setTimeout(() => {
      if (!pending.has(id)) return;
      stopWorker(new Error('The semantic stance model did not finish within four minutes, so fast phrase signals were used.'));
    }, STANCE_TIMEOUT_MS);
    pending.set(id, {
      resolve,
      reject,
      stance: input.stance,
      onProgress: input.onProgress,
      timeout,
      cleanup,
    });
    input.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      getWorker().postMessage({
        id,
        transcript: input.transcript,
        topic: input.topic,
        language: input.language ?? 'en',
      });
    } catch (error) {
      pending.delete(id);
      globalThis.clearTimeout(timeout);
      cleanup();
      reject(error instanceof Error ? error : new Error('The stance-analysis worker could not start.'));
    }
  });
}
