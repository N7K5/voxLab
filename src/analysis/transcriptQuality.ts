import type { SpeechLanguage } from '../types';

export interface TranscriptQualityIssue {
  kind: 'repetition' | 'language';
  message: string;
}

const WORD_PATTERN = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)?/gu;
const SCRIPT_PATTERNS: Record<SpeechLanguage, RegExp> = {
  en: /\p{Script=Latin}/u,
  bn: /\p{Script=Bengali}/u,
  hi: /\p{Script=Devanagari}/u,
};

const LANGUAGE_NAMES: Record<SpeechLanguage, string> = {
  en: 'English',
  bn: 'Bengali',
  hi: 'Hindi',
};

function words(text: string, language: SpeechLanguage): string[] {
  return text.toLocaleLowerCase(language).match(WORD_PATTERN) ?? [];
}

function duplicateNgramRatio(tokens: string[], size: number): number {
  const total = tokens.length - size + 1;
  if (total <= 0) return 0;
  const counts = new Map<string, number>();
  for (let index = 0; index < total; index += 1) {
    const phrase = tokens.slice(index, index + size).join(' ');
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  const duplicates = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return duplicates / total;
}

function expectedScriptRatio(text: string, language: SpeechLanguage): { expected: number; other: number } {
  const letters = [...text].filter((character) => /\p{L}/u.test(character));
  if (!letters.length) return { expected: 0, other: 0 };
  const expected = letters.filter((character) => SCRIPT_PATTERNS[language].test(character)).length;
  return { expected: expected / letters.length, other: (letters.length - expected) / letters.length };
}

/**
 * Rejects obvious Whisper hallucinations before they contaminate coaching metrics.
 * This is deliberately conservative: ordinary repetition and code-switching pass,
 * while long transcript loops and transcripts written almost entirely in the wrong
 * script are sent to the existing replay/manual-transcript recovery screen.
 */
export function automaticTranscriptIssue(text: string, language: SpeechLanguage): TranscriptQualityIssue | null {
  const tokens = words(text, language);
  if (tokens.length >= 18) {
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    const dominantRatio = Math.max(...counts.values()) / tokens.length;
    const uniqueRatio = counts.size / tokens.length;
    const duplicateBigramRatio = duplicateNgramRatio(tokens, 2);
    const duplicateTrigramRatio = duplicateNgramRatio(tokens, 3);

    if (
      dominantRatio >= 0.55
      || (uniqueRatio <= 0.16 && dominantRatio >= 0.25)
      || (duplicateBigramRatio >= 0.72 && duplicateTrigramRatio >= 0.65)
    ) {
      return {
        kind: 'repetition',
        message: 'The speech model produced a repetitive transcript loop instead of a reliable transcription. Replay the recording below and add a rough transcript, or try a larger transcription model for this language.',
      };
    }
  }

  if (tokens.length >= 8) {
    const script = expectedScriptRatio(text, language);
    if (script.expected < 0.08 && script.other > 0.75) {
      return {
        kind: 'language',
        message: `The speech model returned text in a different writing system from the selected ${LANGUAGE_NAMES[language]} language. Replay the recording below and add a rough transcript, or change the practice language and record again.`,
      };
    }
  }

  return null;
}
