import type { SpeechLanguage, Stance } from '../types';

export const SPEECH_LANGUAGES: ReadonlyArray<{
  code: SpeechLanguage;
  label: string;
  nativeLabel: string;
  whisperLanguage: string;
  locales: string[];
}> = [
  { code: 'en', label: 'English', nativeLabel: 'English', whisperLanguage: 'english', locales: ['en'] },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', whisperLanguage: 'bengali', locales: ['bn'] },
];

export function isSpeechLanguage(value: unknown): value is SpeechLanguage {
  return value === 'en' || value === 'bn';
}

export function speechLanguageDetails(language: SpeechLanguage) {
  return SPEECH_LANGUAGES.find((item) => item.code === language) ?? SPEECH_LANGUAGES[0];
}

export function whisperLanguageName(language: SpeechLanguage): string {
  return speechLanguageDetails(language).whisperLanguage;
}

export function stanceLabel(stance: Stance, language: SpeechLanguage): string {
  if (language === 'bn') return stance === 'for' ? 'পক্ষে' : 'বিপক্ষে';
  return stance;
}

export function modelForSpeechLanguage(model: string, language: SpeechLanguage): string {
  if (language === 'bn') {
    if (model === 'onnx-community/whisper-tiny.en') return 'onnx-community/whisper-tiny';
    if (model === 'onnx-community/whisper-base.en') return 'onnx-community/whisper-base';
    if (model === 'distil-whisper/distil-small.en' || model === 'onnx-community/whisper-small.en') return 'onnx-community/whisper-small';
    return model;
  }

  if (model === 'onnx-community/whisper-tiny') return 'onnx-community/whisper-tiny.en';
  if (model === 'onnx-community/whisper-base') return 'onnx-community/whisper-base.en';
  if (model === 'onnx-community/whisper-small') return 'distil-whisper/distil-small.en';
  return model;
}
