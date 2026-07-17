import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserSettings } from '../types';
import {
  disposeTopicVerifier,
  normalizeTopicDraft,
  topicDraftPrecheck,
  topicDraftWordCount,
  topicVerificationTestHelpers,
  verifyCustomTopic,
} from './topicVerification';

const settings: UserSettings = {
  aiProvider: 'browser',
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'qwen3:4b',
  ollamaViaServer: false,
  whisperModel: 'onnx-community/whisper-tiny.en',
  whisperDevice: 'auto',
  speechLanguage: 'en',
  stanceAnalysis: 'semantic',
  saveRecordings: true,
};

afterEach(() => {
  disposeTopicVerifier();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('custom topic precheck', () => {
  it('normalizes spacing without rewriting the motion', () => {
    expect(normalizeTopicDraft('  Schools   should start later.  ')).toBe('Schools should start later.');
  });

  it('rejects questions, links, fragments, and overlong drafts before model inference', () => {
    expect(topicDraftPrecheck('Should schools start later in the morning?', 'en')).toContain('proposition');
    expect(topicDraftPrecheck('Read https://example.com and debate this issue please', 'en')).toContain('link');
    expect(topicDraftPrecheck('School phones', 'en')).toContain('five words');
    expect(topicDraftPrecheck(Array.from({ length: 36 }, () => 'word').join(' '), 'en')).toContain('35 words');
  });

  it('accepts complete English, Bengali, and Hindi motions for AI review', () => {
    expect(topicDraftPrecheck('Schools should replace one exam with a practical project.', 'en')).toBeNull();
    expect(topicDraftPrecheck('বিদ্যালয়ে একটি পরীক্ষার বদলে ব্যবহারিক প্রকল্প রাখা উচিত।', 'bn')).toBeNull();
    expect(topicDraftPrecheck('विद्यालयों में एक परीक्षा की जगह व्यावहारिक परियोजना होनी चाहिए।', 'hi')).toBeNull();
  });

  it('uses the same Unicode-aware word count for the counter and precheck boundary', () => {
    const fiveWords = '  Students shouldn’t need daily homework.  ';
    expect(topicDraftWordCount(fiveWords)).toBe(5);
    expect(topicDraftPrecheck(fiveWords, 'en')).toBeNull();
    expect(topicDraftWordCount('বিদ্যালয়ে ব্যবহারিক প্রকল্প রাখা উচিত।')).toBe(5);
    expect(topicDraftWordCount('विद्यालयों में व्यावहारिक परियोजना होनी चाहिए।')).toBe(6);

    const thirtyFiveWords = Array.from({ length: 35 }, (_, index) => `word${index}`).join(' ');
    expect(topicDraftWordCount(thirtyFiveWords)).toBe(35);
    expect(topicDraftPrecheck(thirtyFiveWords, 'en')).toBeNull();
    expect(topicDraftPrecheck(`${thirtyFiveWords} extra`, 'en')).toContain('35 words');
  });
});

describe('Ollama topic verdict validation', () => {
  const { parseOllamaVerdict } = topicVerificationTestHelpers;

  it('accepts only the exact typed schema in the requested language', () => {
    expect(parseOllamaVerdict('```json\n{"accepted":true,"reason":"This motion has a meaningful trade-off."}\n```', 'en'))
      .toEqual({ accepted: true, reason: 'This motion has a meaningful trade-off.' });
    expect(parseOllamaVerdict('{"accepted":false,"reason":"विषय इतना व्यापक नहीं है कि सार्थक बहस हो सके।"}', 'hi').accepted)
      .toBe(false);
    expect(parseOllamaVerdict('{"accepted":true,"reason":"বিষয়টি উভয় পক্ষের যুক্তির সুযোগ দেয়।"}', 'bn').accepted)
      .toBe(true);
  });

  it.each([
    ['not JSON', 'en'],
    ['null', 'en'],
    ['[]', 'en'],
    ['{"accepted":"yes","reason":"This looks broad enough."}', 'en'],
    ['{"accepted":true,"reason":"This looks broad enough.","confidence":0.9}', 'en'],
    ['{"accepted":true,"reason":"यह पर्याप्त व्यापक है।"}', 'en'],
    ['{"accepted":true,"reason":"This is broad enough."}', 'bn'],
  ] as const)('rejects malformed or wrong-language output: %s', (content, language) => {
    expect(() => parseOllamaVerdict(content, language)).toThrow('invalid topic verdict');
  });

  it('rejects reasons over the promised 35-word limit', () => {
    const reason = Array.from({ length: 36 }, () => 'word').join(' ');
    expect(() => parseOllamaVerdict(JSON.stringify({ accepted: true, reason }), 'en'))
      .toThrow('invalid topic verdict');
  });
});

describe('topic verification cancellation and cleanup', () => {
  it('does not fall back to the browser model after an Ollama request is cancelled', async () => {
    const workerConstructed = vi.fn();
    class UnexpectedWorker {
      constructor() {
        workerConstructed();
      }
    }
    vi.stubGlobal('Worker', UnexpectedWorker);
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    })));
    const onProgress = vi.fn();
    const controller = new AbortController();
    const verification = verifyCustomTopic({
      prompt: 'Schools should replace final exams with practical projects.',
      language: 'en',
      settings: { ...settings, aiProvider: 'ollama' },
      apiBaseUrl: '/api',
      onProgress,
      signal: controller.signal,
    });

    controller.abort();

    await expect(verification).rejects.toMatchObject({ name: 'AbortError' });
    expect(workerConstructed).not.toHaveBeenCalled();
    expect(onProgress.mock.calls.flat().join(' ')).not.toContain('Trying the local');
  });

  it('removes the abort listener when the browser worker cannot start', async () => {
    class BrokenWorker {
      constructor() {
        throw new Error('Worker construction failed.');
      }
    }
    vi.stubGlobal('Worker', BrokenWorker);
    const controller = new AbortController();
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener');

    await expect(verifyCustomTopic({
      prompt: 'Schools should replace final exams with practical projects.',
      language: 'en',
      settings,
      apiBaseUrl: '/api',
      signal: controller.signal,
    })).rejects.toThrow('Worker construction failed.');

    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
