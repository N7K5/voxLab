export type Difficulty = 'easy' | 'medium' | 'hard';
export type Stance = 'for' | 'against';
export type StanceMode = 'choose' | 'game';
export type PracticeMode = 'solo' | 'duel';
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
  contentWordRatio: number;
  fillerCount: number;
  fillersPerMinute: number;
  repeatedPhraseCount: number;
  transitionCount: number;
  transitionVariety: number;
  reasoningMarkerCount: number;
  exampleMarkerCount: number;
  topicKeywordCoverage: number;
  stanceSignal: 'aligned' | 'opposed' | 'mixed' | 'unclear';
  stanceConfidence?: number;
  stanceEngine?: string;
  hasOpening: boolean;
  hasConclusion: boolean;
  sentenceCount: number;
  averageSentenceWords: number;
  sentenceLengthVariation: number;
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
  weaknesses?: CoachingWeakness[];
  reframes?: SentenceReframe[];
  topicStrategy?: TopicStrategy;
  provider: AiProvider;
  model?: string;
}

export interface CoachingWeakness {
  title: string;
  evidence: string;
  whyItMatters: string;
  howToImprove: string;
}

export interface SentenceReframe {
  original: string;
  issue: string;
  revised: string;
  principle: string;
}

export interface TopicStrategy {
  coreQuestion: string;
  angles: string[];
  strongestCounterargument: string;
  nextOutline: string[];
}

export interface DuelParticipant {
  attemptId: string;
  name: string;
  stance: Stance;
  scores: ScoreBreakdown;
}

export interface DuelComparison {
  duelId: string;
  currentSpeaker: 1 | 2;
  speaker1: DuelParticipant;
  speaker2: DuelParticipant;
  winner: 1 | 2 | 'tie';
  margin: number;
  verdict: string;
  swingFactors: string[];
}

export interface AnalysisReport {
  audio: AudioMetrics;
  text: TextMetrics;
  scores: ScoreBreakdown;
  feedback: CoachFeedback;
  transcriptionEngine: string;
  transcriptionWarning?: string;
  analysisWarning?: string;
  duel?: DuelComparison;
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
  stanceAnalysis: 'signals' | 'semantic';
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
