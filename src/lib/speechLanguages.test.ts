import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../types';
import { settingsFromConfig } from './config';
import {
  isSpeechLanguage,
  modelForSpeechLanguage,
  stanceLabel,
  whisperLanguageName,
} from './speechLanguages';

describe('speech-language helpers', () => {
  it('maps every English-only tier to a Bengali-capable multilingual model', () => {
    expect(modelForSpeechLanguage('onnx-community/whisper-tiny.en', 'bn')).toBe('onnx-community/whisper-tiny');
    expect(modelForSpeechLanguage('onnx-community/whisper-base.en', 'bn')).toBe('onnx-community/whisper-base');
    expect(modelForSpeechLanguage('distil-whisper/distil-small.en', 'bn')).toBe('onnx-community/whisper-small');
    expect(modelForSpeechLanguage('onnx-community/whisper-small.en', 'bn')).toBe('onnx-community/whisper-small');
  });

  it('can return to the smaller English-only tier after a language switch', () => {
    expect(modelForSpeechLanguage('onnx-community/whisper-base', 'en')).toBe('onnx-community/whisper-base.en');
    expect(modelForSpeechLanguage('onnx-community/whisper-small', 'en')).toBe('distil-whisper/distil-small.en');
  });

  it('uses Whisper and stance labels for Bengali', () => {
    expect(whisperLanguageName('bn')).toBe('bengali');
    expect(stanceLabel('for', 'bn')).toBe('পক্ষে');
    expect(stanceLabel('against', 'bn')).toBe('বিপক্ষে');
  });

  it('rejects unsupported language codes', () => {
    expect(isSpeechLanguage('bn')).toBe(true);
    expect(isSpeechLanguage('hi')).toBe(false);
  });

  it('turns a Bengali deployment default into truthful multilingual settings', () => {
    const config: AppConfig = {
      storage: { mode: 'browser', apiBaseUrl: '/api' },
      ai: { provider: 'browser', ollamaEndpoint: 'http://localhost:11434', ollamaModel: 'qwen3:4b', ollamaViaServer: false },
      speech: { model: 'onnx-community/whisper-base.en', device: 'auto', language: 'bn' },
      practice: { defaultDurationSeconds: 60, saveRecordings: true },
    };
    expect(settingsFromConfig(config)).toMatchObject({
      speechLanguage: 'bn',
      whisperModel: 'onnx-community/whisper-base',
      stanceAnalysis: 'signals',
    });
  });
});
