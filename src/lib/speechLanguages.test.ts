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
  it.each(['bn', 'hi'] as const)('maps every English-only tier to a %s-capable multilingual model', (language) => {
    expect(modelForSpeechLanguage('onnx-community/whisper-tiny.en', language)).toBe('onnx-community/whisper-tiny');
    expect(modelForSpeechLanguage('onnx-community/whisper-base.en', language)).toBe('onnx-community/whisper-base');
    expect(modelForSpeechLanguage('distil-whisper/distil-small.en', language)).toBe('onnx-community/whisper-small');
    expect(modelForSpeechLanguage('onnx-community/whisper-small.en', language)).toBe('onnx-community/whisper-small');
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

  it('uses Whisper and stance labels for Hindi', () => {
    expect(whisperLanguageName('hi')).toBe('hindi');
    expect(stanceLabel('for', 'hi')).toBe('पक्ष');
    expect(stanceLabel('against', 'hi')).toBe('विपक्ष');
  });

  it('rejects unsupported language codes', () => {
    expect(isSpeechLanguage('bn')).toBe(true);
    expect(isSpeechLanguage('hi')).toBe(true);
    expect(isSpeechLanguage('fr')).toBe(false);
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
      stanceAnalysis: 'semantic',
    });
  });
});
