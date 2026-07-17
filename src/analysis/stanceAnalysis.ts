import type { Stance, TextMetrics } from '../types';

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
}

let worker: Worker | null = null;
const pending = new Map<string, PendingRequest>();

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
    for (const request of pending.values()) request.reject(new Error(event.message || 'The stance-analysis worker stopped.'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function analyzeStanceSemantically(input: {
  transcript: string;
  topic: string;
  stance: Stance;
  onProgress?: (message: string, progress?: number) => void;
}): Promise<SemanticStanceResult> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, stance: input.stance, onProgress: input.onProgress });
    getWorker().postMessage({ id, transcript: input.transcript, topic: input.topic });
  });
}
