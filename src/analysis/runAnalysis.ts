import type { AnalysisReport, Stance, Topic, UserSettings } from '../types';
import { resampleTo16Khz } from '../audio/recorder';
import { analyzeAudio, calculateClippingRatio } from './audioAnalysis';
import { requestOllamaFeedback } from './ollamaCoach';
import { browserFeedback, calculateScores } from './scoring';
import { analyzeStanceSemantically, mergeStanceAssessment } from './stanceAnalysis';
import { analyzeText } from './textAnalysis';
import { transcribeLocally, type TranscriptionProgress } from './transcribe';
import { modelForSpeechLanguage } from '../lib/speechLanguages';
import { automaticTranscriptIssue } from './transcriptQuality';

export class TranscriptionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptionUnavailableError';
  }
}

export interface AnalysisProgress {
  stage: 'audio' | 'model' | 'transcription' | 'language' | 'coaching' | 'saving';
  message: string;
  progress?: number;
}

function analysisAbortError(): DOMException {
  return new DOMException('Speech analysis was cancelled.', 'AbortError');
}

function throwIfAnalysisAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw analysisAbortError();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export async function runAnalysis(input: {
  pcm: Float32Array;
  sampleRate: number;
  topic: Topic;
  stance: Stance;
  settings: UserSettings;
  apiBaseUrl: string;
  transcriptOverride?: string;
  onProgress?: (progress: AnalysisProgress) => void;
  signal?: AbortSignal;
}): Promise<{ transcript: string; report: AnalysisReport }> {
  throwIfAnalysisAborted(input.signal);
  const pcm16 = resampleTo16Khz(input.pcm, input.sampleRate);
  const speechLanguage = input.topic.language ?? input.settings.speechLanguage ?? 'en';
  input.onProgress?.({ stage: 'audio', message: 'Measuring pace, pauses, energy, and pitch…' });
  const originalClippingRatio = calculateClippingRatio(input.pcm);
  const audioPromise = analyzeAudio(pcm16).then((audio) => ({ ...audio, clippingRatio: originalClippingRatio }));

  let transcript = input.transcriptOverride?.trim() ?? '';
  let transcriptionEngine = input.transcriptOverride ? 'Manual transcript' : '';
  let transcriptionWarning: string | undefined;
  if (transcript && input.transcriptOverride) {
    const manualQualityIssue = automaticTranscriptIssue(transcript, speechLanguage);
    if (manualQualityIssue) {
      transcriptionWarning = manualQualityIssue.kind === 'repetition'
        ? 'The manual transcript contains a strong repetition pattern. Analysis continued as requested, but vocabulary, repetition, and stance results may not represent the recording.'
        : 'The manual transcript uses a different writing system from the selected practice language. Analysis continued as requested, but language and stance results may be less reliable.';
    }
  }
  if (!transcript) {
    try {
      const transcription = await transcribeLocally(pcm16, {
        model: modelForSpeechLanguage(input.settings.whisperModel, speechLanguage),
        device: input.settings.whisperDevice,
        language: speechLanguage,
        onProgress: (progress: TranscriptionProgress) => input.onProgress?.(progress),
        signal: input.signal,
      });
      throwIfAnalysisAborted(input.signal);
      transcript = transcription.text;
      transcriptionEngine = transcription.engine;
      const qualityIssue = automaticTranscriptIssue(transcript, speechLanguage);
      if (qualityIssue) throw new TranscriptionUnavailableError(qualityIssue.message);
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) throw analysisAbortError();
      await audioPromise;
      throw error instanceof TranscriptionUnavailableError
        ? error
        : new TranscriptionUnavailableError(error instanceof Error ? error.message : 'Local transcription failed.');
    }
  }

  if (!transcript) {
    throwIfAnalysisAborted(input.signal);
    const audio = await audioPromise;
    throwIfAnalysisAborted(input.signal);
    throw new TranscriptionUnavailableError(
      audio.voicedSeconds >= 0.35
        ? 'Voice was detected, but the local speech model returned no words. Replay the recording below while adding a rough transcript.'
        : 'Very little speech-level audio reached the local analyzer. Replay the recording below, then add a rough transcript or record another take.',
    );
  }

  throwIfAnalysisAborted(input.signal);
  const audio = await audioPromise;
  throwIfAnalysisAborted(input.signal);
  input.onProgress?.({ stage: 'language', message: 'Checking fluency, vocabulary, structure, and relevance…' });
  let text = analyzeText(transcript, input.topic, input.stance, audio);
  let analysisWarning: string | undefined;
  if (input.settings.stanceAnalysis === 'semantic') {
    try {
      const semanticStance = await analyzeStanceSemantically({
        transcript,
        topic: input.topic.prompt,
        stance: input.stance,
        language: speechLanguage,
        onProgress: (message, progress) => input.onProgress?.({ stage: 'language', message, progress }),
        signal: input.signal,
      });
      throwIfAnalysisAborted(input.signal);
      text = {
        ...text,
        ...mergeStanceAssessment(text, semanticStance),
      };
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) throw analysisAbortError();
      analysisWarning = `Semantic stance checking was unavailable, so fast phrase signals were used: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
  }
  const scores = calculateScores(audio, text);
  let feedback = browserFeedback(scores, audio, text, {
    transcript,
    topic: input.topic,
    stance: input.stance,
  });
  if (input.settings.aiProvider === 'ollama') {
    input.onProgress?.({ stage: 'coaching', message: `Asking ${input.settings.ollamaModel} for evidence-based coaching…` });
    try {
      feedback = await requestOllamaFeedback(
        { topic: input.topic, stance: input.stance, transcript, audio, text, scores },
        input.settings,
        input.apiBaseUrl,
        input.signal,
      );
      throwIfAnalysisAborted(input.signal);
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) throw analysisAbortError();
      const coachingWarning = `Ollama was unavailable, so browser coaching was used: ${error instanceof Error ? error.message : 'unknown error'}`;
      analysisWarning = analysisWarning ? `${analysisWarning} ${coachingWarning}` : coachingWarning;
    }
  }

  throwIfAnalysisAborted(input.signal);
  return {
    transcript,
    report: { audio, text, scores, feedback, transcriptionEngine, transcriptionWarning, analysisWarning },
  };
}
