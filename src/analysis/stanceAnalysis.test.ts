import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeStanceSemantically } from './stanceAnalysis';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('semantic stance cancellation', () => {
  it('terminates an in-flight model worker when its analysis is aborted', async () => {
    let instance: HangingWorker | undefined;
    class HangingWorker {
      onmessage: ((event: MessageEvent<Record<string, unknown>>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        instance = this;
      }
    }
    vi.stubGlobal('Worker', HangingWorker);
    const controller = new AbortController();
    const analysis = analyzeStanceSemantically({
      transcript: 'Public transport reduces congestion and should receive more investment.',
      topic: 'Cities should invest more in public transport.',
      stance: 'for',
      signal: controller.signal,
    });

    controller.abort();

    await expect(analysis).rejects.toMatchObject({ name: 'AbortError' });
    expect(instance?.terminate).toHaveBeenCalledOnce();
  });
});
