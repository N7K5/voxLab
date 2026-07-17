import type { AnalysisReport, Stance, Topic, UserSettings } from '../types';
import { resampleTo16Khz } from '../audio/recorder';
import { analyzeAudio, calculateClippingRatio } from './audioAnalysis';
import { requestOllamaFeedback } from './ollamaCoach';
import { browserFeedback, calculateScores } from './scoring';
import { analyzeStanceSemantically, mergeStanceAssessment } from './stanceAnalysis';
import { analyzeText } from './textAnalysis';
import { transcribeLocally, type TranscriptionProgress } from './transcribe';

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

export async function runAnalysis(input: {
  pcm: Float32Array;
  sampleRate: number;
  topic: Topic;
  stance: Stance;
  settings: UserSettings;
  apiBaseUrl: string;
  transcriptOverride?: string;
  onProgress?: (progress: AnalysisProgress) => void;
}): Promise<{ transcript: string; report: AnalysisReport }> {
  const pcm16 = resampleTo16Khz(input.pcm, input.sampleRate);
  input.onProgress?.({ stage: 'audio', message: 'Measuring pace, pauses, energy, and pitch…' });
  const originalClippingRatio = calculateClippingRatio(input.pcm);
  const audioPromise = analyzeAudio(pcm16).then((audio) => ({ ...audio, clippingRatio: originalClippingRatio }));

  let transcript = input.transcriptOverride?.trim() ?? '';
  let transcriptionEngine = input.transcriptOverride ? 'Manual transcript' : '';
  if (!transcript) {
    try {
      const transcription = await transcribeLocally(pcm16, {
        model: input.settings.whisperModel,
        device: input.settings.whisperDevice,
        onProgress: (progress: TranscriptionProgress) => input.onProgress?.(progress),
      });
      transcript = transcription.text;
      transcriptionEngine = transcription.engine;
    } catch (error) {
      await audioPromise;
      throw new TranscriptionUnavailableError(error instanceof Error ? error.message : 'Local transcription failed.');
    }
  }

  if (!transcript) {
    const audio = await audioPromise;
    throw new TranscriptionUnavailableError(
      audio.voicedSeconds >= 0.35
        ? 'Voice was detected, but the local speech model returned no words. Replay the recording below while adding a rough transcript.'
        : 'Very little speech-level audio reached the local analyzer. Replay the recording below, then add a rough transcript or record another take.',
    );
  }

  const audio = await audioPromise;
  input.onProgress?.({ stage: 'language', message: 'Checking fluency, vocabulary, structure, and relevance…' });
  let text = analyzeText(transcript, input.topic, input.stance, audio);
  let analysisWarning: string | undefined;
  if (input.settings.stanceAnalysis === 'semantic') {
    try {
      const semanticStance = await analyzeStanceSemantically({
        transcript,
        topic: input.topic.prompt,
        stance: input.stance,
        onProgress: (message, progress) => input.onProgress?.({ stage: 'language', message, progress }),
      });
      text = {
        ...text,
        ...mergeStanceAssessment(text, semanticStance),
      };
    } catch (error) {
      analysisWarning = `Semantic stance checking was unavailable, so fast phrase signals were used: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
  }
  const scores = calculateScores(audio, text);
  let feedback = browserFeedback(scores, audio, text, {
    transcript,
    topic: input.topic,
    stance: input.stance,
  });
  let transcriptionWarning: string | undefined;

  if (input.settings.aiProvider === 'ollama') {
    input.onProgress?.({ stage: 'coaching', message: `Asking ${input.settings.ollamaModel} for evidence-based coaching…` });
    try {
      feedback = await requestOllamaFeedback({ topic: input.topic, stance: input.stance, transcript, audio, text, scores }, input.settings, input.apiBaseUrl);
    } catch (error) {
      transcriptionWarning = `Ollama was unavailable, so browser coaching was used: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
  }

  return {
    transcript,
    report: { audio, text, scores, feedback, transcriptionEngine, transcriptionWarning, analysisWarning },
  };
}
