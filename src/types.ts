export type Difficulty = 'easy' | 'medium' | 'hard';
export type Stance = 'for' | 'against';
export type StanceMode = 'choose' | 'game';
export type AiProvider = 'browser' | 'ollama';
export type StorageMode = 'auto' | 'browser' | 'database';

export interface Topic {
  id: string;
  prompt: string;
  difficulty: Difficulty;
  category: string;
  context?: string;
}

export interface User {
  id: string;
  username: string;
  createdAt: string;
}

export interface PauseEvent {
  start: number;
  end: number;
  duration: number;
}

export interface AudioMetrics {
  recordedDurationSeconds: number;
  speakingSpanSeconds: number;
  voicedSeconds: number;
  silenceRatio: number;
  initialSilenceSeconds: number;
  trailingSilenceSeconds: number;
  pauseCount: number;
  longPauseCount: number;
  averagePauseSeconds: number;
  longestPauseSeconds: number;
  pauses: PauseEvent[];
  averageVolumeDb: number;
  volumeVariation: number;
  clippingRatio: number;
  averagePitchHz: number | null;
  pitchVariationSemitones: number | null;
}

export interface TextMetrics {
  wordCount: number;
  wordsPerMinute: number;
  uniqueWordRatio: number;
  fillerCount: number;
  fillersPerMinute: number;
  repeatedPhraseCount: number;
  transitionCount: number;
  topicKeywordCoverage: number;
  stanceSignal: 'aligned' | 'mixed' | 'unclear';
  hasOpening: boolean;
  hasConclusion: boolean;
  sentenceCount: number;
}

export interface ScoreBreakdown {
  overall: number;
  pacing: number;
  fluency: number;
  vocabulary: number;
  delivery: number;
  structure: number;
  relevance: number;
}

export interface CoachFeedback {
  summary: string;
  strengths: string[];
  improvements: Array<{
    title: string;
    detail: string;
    drill: string;
  }>;
  provider: AiProvider;
  model?: string;
}

export interface AnalysisReport {
  audio: AudioMetrics;
  text: TextMetrics;
  scores: ScoreBreakdown;
  feedback: CoachFeedback;
  transcriptionEngine: string;
  transcriptionWarning?: string;
}

export interface PracticeAttempt {
  id: string;
  userId: string;
  topic: Topic;
  stance: Stance;
  durationSeconds: number;
  transcript: string;
  report: AnalysisReport;
  createdAt: string;
  recordingMimeType?: string;
  hasRecording: boolean;
  recording?: Blob;
}

export interface PracticeDraft {
  topic: Topic;
  stance: Stance;
  durationSeconds: number;
  difficulty: Difficulty;
}

export interface UserSettings {
  aiProvider: AiProvider;
  ollamaEndpoint: string;
  ollamaModel: string;
  ollamaViaServer: boolean;
  whisperModel: string;
  whisperDevice: 'auto' | 'webgpu' | 'wasm';
  saveRecordings: boolean;
}

export interface AppConfig {
  storage: {
    mode: StorageMode;
    apiBaseUrl: string;
  };
  ai: {
    provider: AiProvider;
    ollamaEndpoint: string;
    ollamaModel: string;
    ollamaViaServer: boolean;
  };
  speech: {
    model: string;
    device: 'auto' | 'webgpu' | 'wasm';
    language: string;
  };
  practice: {
    defaultDurationSeconds: number;
    saveRecordings: boolean;
  };
}

export interface StorageStatus {
  kind: 'browser' | 'database';
  label: string;
  detail: string;
}
