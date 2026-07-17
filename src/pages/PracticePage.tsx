import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Dices,
  FilePenLine,
  Gauge,
  Lightbulb,
  Languages,
  LoaderCircle,
  Mic2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  TriangleAlert,
  Trophy,
  UserRound,
  UsersRound,
  Volume2,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { compareDuel } from '../analysis/duelComparison';
import { runAnalysis, TranscriptionUnavailableError, type AnalysisProgress } from '../analysis/runAnalysis';
import { VoiceRecorder, type RecordingResult } from '../audio/recorder';
import { AudioPlayer } from '../components/AudioPlayer';
import { Waveform } from '../components/Waveform';
import { useApp } from '../context/AppContext';
import { randomTopic } from '../data/topics';
import { modelForSpeechLanguage, stanceLabel } from '../lib/speechLanguages';
import type {
  AnalysisReport,
  Difficulty,
  PracticeAttempt,
  PracticeMode,
  SpeechLanguage,
  Stance,
  StanceMode,
  Topic,
} from '../types';

type PracticeStep = 'setup' | 'ready' | 'recording' | 'review' | 'processing' | 'manual' | 'handoff';
type ProcessingPhase = 'voice' | 'transcript' | 'language' | 'coaching' | 'saving';

interface PendingDuelTurn {
  id: string;
  transcript: string;
  report: AnalysisReport;
  recording: RecordingResult;
  stance: Stance;
  createdAt: string;
}

const durations = [30, 60, 90, 120];
const difficultyDetails: Record<Difficulty, { title: string; description: string }> = {
  easy: { title: 'Easy', description: 'Familiar topics and everyday examples' },
  medium: { title: 'Medium', description: 'Public issues with competing trade-offs' },
  hard: { title: 'Hard', description: 'Abstract policy and ethical tensions' },
};

const processingPhases: Array<{ key: ProcessingPhase; label: string; title: string; detail: string }> = [
  { key: 'voice', label: 'Voice', title: 'Measuring your delivery', detail: 'Mapping speech, silence, pace, energy, and pitch.' },
  { key: 'transcript', label: 'Transcript', title: 'Turning speech into text', detail: 'The local speech model is listening to your complete answer.' },
  { key: 'language', label: 'Language', title: 'Reviewing your argument', detail: 'Checking vocabulary, structure, stance, and relevance.' },
  { key: 'coaching', label: 'Coaching', title: 'Writing your coaching brief', detail: 'Turning the evidence into focused strengths and one next drill.' },
  { key: 'saving', label: 'Save', title: 'Saving your results', detail: 'Keeping your brief and privacy choices together.' },
];

function processingPhase(stage?: AnalysisProgress['stage']): ProcessingPhase {
  if (stage === 'model' || stage === 'transcription') return 'transcript';
  if (stage === 'language') return 'language';
  if (stage === 'coaching') return 'coaching';
  if (stage === 'saving') return 'saving';
  return 'voice';
}

function randomStance(): Stance {
  return Math.random() > 0.5 ? 'for' : 'against';
}

function oppositeStance(stance: Stance): Stance {
  return stance === 'for' ? 'against' : 'for';
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something unexpected happened.';
}

export function PracticePage() {
  const { user, settings, config, saveAttempt, saveAttempts, storageStatus } = useApp();
  const navigate = useNavigate();
  const initialLanguage = settings?.speechLanguage ?? config?.speech.language ?? 'en';
  const [step, setStep] = useState<PracticeStep>('setup');
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('solo');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [stanceMode, setStanceMode] = useState<StanceMode>('choose');
  const [stance, setStance] = useState<Stance>('for');
  const [duration, setDuration] = useState(config?.practice.defaultDurationSeconds ?? 60);
  const [language, setLanguage] = useState<SpeechLanguage>(initialLanguage);
  const [topic, setTopic] = useState<Topic>(() => randomTopic('easy', undefined, initialLanguage));
  const [drawingTopic, setDrawingTopic] = useState(false);
  const [recording, setRecording] = useState<RecordingResult | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [manualTranscript, setManualTranscript] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<1 | 2>(1);
  const [speaker1Name, setSpeaker1Name] = useState('Speaker 1');
  const [speaker2Name, setSpeaker2Name] = useState('Opponent');
  const [duelId, setDuelId] = useState<string | null>(null);
  const [pendingDuel, setPendingDuel] = useState<PendingDuelTurn | null>(null);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const stoppingRef = useRef(false);
  const startingRef = useRef(false);
  const topicDrawTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (user && speaker1Name === 'Speaker 1') setSpeaker1Name(user.username);
  }, [speaker1Name, user]);

  useEffect(() => {
    if (!recording) {
      setAudioUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(recording.blob);
    setAudioUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [recording]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (topicDrawTimerRef.current !== null) window.clearTimeout(topicDrawTimerRef.current);
    recorderRef.current?.cancel();
  }, []);

  if (!user || !settings || !config) return <div className="page-loading"><LoaderCircle className="spin" size={24} /> Preparing practice…</div>;

  const drawTopic = (nextDifficulty: Difficulty, excludeId?: string, nextLanguage: SpeechLanguage = language) => {
    if (topicDrawTimerRef.current !== null) window.clearTimeout(topicDrawTimerRef.current);
    const nextTopic = randomTopic(nextDifficulty, excludeId, nextLanguage);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setDrawingTopic(true);
    topicDrawTimerRef.current = window.setTimeout(() => {
      setTopic(nextTopic);
      setDrawingTopic(false);
      topicDrawTimerRef.current = null;
    }, reducedMotion ? 0 : 420);
  };

  const changeDifficulty = (nextDifficulty: Difficulty) => {
    setDifficulty(nextDifficulty);
    drawTopic(nextDifficulty, nextDifficulty === difficulty ? topic.id : undefined);
  };

  const changeLanguage = (nextLanguage: SpeechLanguage) => {
    if (nextLanguage === language) return;
    setLanguage(nextLanguage);
    drawTopic(difficulty, undefined, nextLanguage);
  };

  const shuffleTopic = () => {
    if (!drawingTopic) drawTopic(difficulty, topic.id);
  };

  const prepare = () => {
    const nextStance = practiceMode === 'duel' || stanceMode === 'game' ? randomStance() : stance;
    setStance(nextStance);
    setActiveSpeaker(1);
    setPendingDuel(null);
    setDuelId(practiceMode === 'duel' ? crypto.randomUUID() : null);
    setError(null);
    setStep('ready');
  };

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stopRecording = async () => {
    if (!recorderRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    clearTimer();
    try {
      const result = await recorderRef.current.stop();
      setElapsed(Math.min(duration, result.durationSeconds));
      setRecording(result);
      setStep('review');
    } catch (stopError) {
      setError(errorMessage(stopError));
      setStep('ready');
    } finally {
      recorderRef.current = null;
      stoppingRef.current = false;
    }
  };

  const startRecording = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    setRecording(null);
    setLevels([]);
    setElapsed(0);
    stoppingRef.current = false;
    const recorder = new VoiceRecorder({
      onLevel: (level) => setLevels((current) => [...current.slice(-47), level]),
    });
    recorderRef.current = recorder;
    try {
      await recorder.start();
      startedAtRef.current = performance.now();
      setStep('recording');
      timerRef.current = window.setInterval(() => {
        const nextElapsed = (performance.now() - startedAtRef.current) / 1000;
        setElapsed(Math.min(duration, nextElapsed));
        if (nextElapsed >= duration) void stopRecording();
      }, 100);
    } catch (startError) {
      recorder.cancel();
      recorderRef.current = null;
      setError(errorMessage(startError));
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  const resetRecording = () => {
    setRecording(null);
    setElapsed(0);
    setLevels([]);
    setManualTranscript('');
    setManualReason('');
    setError(null);
    setStep('ready');
  };

  const clearTurn = () => {
    setRecording(null);
    setElapsed(0);
    setLevels([]);
    setManualTranscript('');
    setManualReason('');
    setProgress(null);
    setError(null);
  };

  const cancelDuel = () => {
    clearTurn();
    setPendingDuel(null);
    setDuelId(null);
    setActiveSpeaker(1);
    setStep('setup');
  };

  const buildAttempt = (
    id: string,
    turnRecording: RecordingResult,
    turnStance: Stance,
    transcript: string,
    report: AnalysisReport,
    createdAt: string,
  ): PracticeAttempt => ({
    id,
    userId: user.id,
    topic,
    stance: turnStance,
    durationSeconds: Math.max(1, Math.round(turnRecording.durationSeconds)),
    transcript,
    report,
    createdAt,
    recordingMimeType: turnRecording.mimeType,
    hasRecording: settings.saveRecordings,
    recording: settings.saveRecordings ? turnRecording.blob : undefined,
  });

  const analyze = async (transcriptOverride?: string) => {
    if (!recording) return;
    setError(null);
    setProgress({ stage: 'audio', message: 'Reading the shape of your voice…' });
    setStep('processing');
    try {
      const analyzed = await runAnalysis({
        pcm: recording.pcm,
        sampleRate: recording.sampleRate,
        topic,
        stance,
        settings: {
          ...settings,
          speechLanguage: language,
          whisperModel: modelForSpeechLanguage(settings.whisperModel, language),
          ...(storageStatus?.kind === 'browser' ? { ollamaViaServer: false } : {}),
        },
        apiBaseUrl: config.storage.apiBaseUrl,
        transcriptOverride,
        onProgress: (nextProgress) => {
          setProgress((currentProgress) => currentProgress?.stage === nextProgress.stage ? currentProgress : nextProgress);
        },
      });

      if (practiceMode === 'duel' && activeSpeaker === 1) {
        setPendingDuel({
          id: crypto.randomUUID(),
          transcript: analyzed.transcript,
          report: analyzed.report,
          recording,
          stance,
          createdAt: new Date().toISOString(),
        });
        setActiveSpeaker(2);
        setStance(oppositeStance(stance));
        clearTurn();
        setStep('handoff');
        return;
      }

      setProgress({ stage: 'saving', message: storageStatus?.kind === 'database' ? 'Saving to your configured server…' : 'Saving privately in this browser…' });
      const id = crypto.randomUUID();

      if (practiceMode === 'duel' && activeSpeaker === 2) {
        if (!pendingDuel || !duelId) throw new Error('The first speaker’s sealed turn is missing. Please start the 1v1 again.');
        const comparison = compareDuel(
          duelId,
          { attemptId: pendingDuel.id, name: speaker1Name.trim() || 'Speaker 1', stance: pendingDuel.stance, report: pendingDuel.report },
          { attemptId: id, name: speaker2Name.trim() || 'Opponent', stance, report: analyzed.report },
        );
        const firstAttempt = buildAttempt(
          pendingDuel.id,
          pendingDuel.recording,
          pendingDuel.stance,
          pendingDuel.transcript,
          { ...pendingDuel.report, duel: { ...comparison, currentSpeaker: 1 } },
          pendingDuel.createdAt,
        );
        const secondAttempt = buildAttempt(
          id,
          recording,
          stance,
          analyzed.transcript,
          { ...analyzed.report, duel: { ...comparison, currentSpeaker: 2 } },
          new Date().toISOString(),
        );
        await saveAttempts([firstAttempt, secondAttempt]);
      } else {
        await saveAttempt(buildAttempt(id, recording, stance, analyzed.transcript, analyzed.report, new Date().toISOString()));
      }
      navigate(`/results/${id}`, { replace: true });
    } catch (analysisError) {
      if (analysisError instanceof TranscriptionUnavailableError) {
        setManualReason(analysisError.message);
        setStep('manual');
      } else {
        setError(errorMessage(analysisError));
        setStep('review');
      }
    }
  };

  const submitManual = (event: FormEvent) => {
    event.preventDefault();
    if (manualTranscript.trim().split(/\s+/).length < 3) {
      setError('Please enter at least a few words from your speech.');
      return;
    }
    void analyze(manualTranscript.trim());
  };

  const remaining = Math.max(0, duration - elapsed);
  const timerProgress = duration ? Math.min(1, elapsed / duration) : 0;

  if (step === 'setup') {
    return (
      <div className="page practice-page setup-page">
        <div className="practice-page-header"><div><span className="eyebrow"><Target size={14} /> Build a new round</span><h1>Set the challenge</h1><p>Train solo, or pass one device between two local opponents.</p></div><span className="step-count">Step 1 of 3</span></div>

        <div className="setup-layout">
          <div className="setup-controls">
            <section className="setup-section">
              <div className="setup-section-heading"><span>01</span><div><h2>Round format</h2><p>Take a focused solo rep or challenge someone beside you.</p></div></div>
              <div className="mode-grid format-grid">
                <button type="button" className={`mode-choice${practiceMode === 'solo' ? ' selected' : ''}`} onClick={() => setPracticeMode('solo')}><UserRound size={21} /><span><strong>Solo practice</strong><small>One speech and a personal brief</small></span></button>
                <button type="button" className={`mode-choice${practiceMode === 'duel' ? ' selected' : ''}`} onClick={() => setPracticeMode('duel')}><UsersRound size={21} /><span><strong>Local 1v1</strong><small>Opposite sides on one device</small></span></button>
              </div>
            </section>

            <section className="setup-section">
              <div className="setup-section-heading"><span>02</span><div><h2>Speaking language</h2><p>The topic, transcription, and coaching will follow this choice.</p></div></div>
              <div className="mode-grid language-grid">
                <button type="button" className={`mode-choice${language === 'en' ? ' selected' : ''}`} onClick={() => changeLanguage('en')}><Languages size={20} /><span><strong>English</strong><small>English topics and models</small></span></button>
                <button type="button" className={`mode-choice${language === 'bn' ? ' selected' : ''}`} onClick={() => changeLanguage('bn')}><Languages size={20} /><span lang="bn"><strong>বাংলা</strong><small>বাংলা বিষয় ও ট্রান্সক্রিপশন</small></span></button>
              </div>
            </section>

            <section className="setup-section">
              <div className="setup-section-heading"><span>03</span><div><h2>Difficulty</h2><p>How much complexity do you want today?</p></div></div>
              <div className="difficulty-grid">
                {(Object.keys(difficultyDetails) as Difficulty[]).map((option) => (
                  <button key={option} type="button" className={`difficulty-choice ${option}${difficulty === option ? ' selected' : ''}`} onClick={() => changeDifficulty(option)}>
                    <span className="choice-radio">{difficulty === option && <Check size={13} />}</span>
                    <strong>{difficultyDetails[option].title}</strong>
                    <small>{difficultyDetails[option].description}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="setup-section">
              {practiceMode === 'solo' ? (
                <>
                  <div className="setup-section-heading"><span>04</span><div><h2>Choose your side</h2><p>Stay in control, or make it a reflex test.</p></div></div>
                  <div className="mode-grid">
                    <button type="button" className={`mode-choice${stanceMode === 'choose' ? ' selected' : ''}`} onClick={() => setStanceMode('choose')}><Target size={20} /><span><strong>I’ll choose</strong><small>Pick for or against</small></span></button>
                    <button type="button" className={`mode-choice${stanceMode === 'game' ? ' selected' : ''}`} onClick={() => setStanceMode('game')}><Dices size={20} /><span><strong>Game mode</strong><small>Random side revealed next</small></span></button>
                  </div>
                  {stanceMode === 'choose' && <div className="stance-toggle"><button type="button" className={stance === 'for' ? 'selected for' : ''} onClick={() => setStance('for')}><Check size={16} /> {language === 'bn' ? 'পক্ষে' : 'For'}</button><button type="button" className={stance === 'against' ? 'selected against' : ''} onClick={() => setStance('against')}><ArrowLeft size={16} /> {language === 'bn' ? 'বিপক্ষে' : 'Against'}</button></div>}
                </>
              ) : (
                <>
                  <div className="setup-section-heading"><span>04</span><div><h2>Name the speakers</h2><p>The first side is random. The second speaker receives the opposite side.</p></div></div>
                  <div className="duel-name-grid">
                    <label><span>Speaker 1 · account owner</span><input value={speaker1Name} onChange={(event) => setSpeaker1Name(event.target.value)} maxLength={32} placeholder="Speaker 1" /></label>
                    <span className="duel-versus">VS</span>
                    <label><span>Speaker 2 · local guest</span><input value={speaker2Name} onChange={(event) => setSpeaker2Name(event.target.value)} maxLength={32} placeholder="Opponent" /></label>
                  </div>
                  <p className="duel-storage-note"><ShieldCheck size={14} /> Both analyses—and both recordings when saving is enabled—are stored under {speaker1Name.trim() || 'Speaker 1'}’s account.</p>
                </>
              )}
            </section>

            <section className="setup-section">
              <div className="setup-section-heading"><span>05</span><div><h2>Speaking time</h2><p>{practiceMode === 'duel' ? 'Each speaker gets the same amount of time.' : 'One minute is the sweet spot. Customize it when you need more room.'}</p></div></div>
              <div className="duration-pills">{durations.map((seconds) => <button key={seconds} type="button" className={duration === seconds ? 'selected' : ''} onClick={() => setDuration(seconds)}>{seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}</button>)}</div>
              <label className="duration-slider"><span>Custom duration</span><strong>{formatTime(duration)}</strong><input type="range" min={30} max={180} step={15} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
            </section>
          </div>

          <aside className={`topic-preview-card${drawingTopic ? ' is-drawing' : ''}`} aria-busy={drawingTopic}>
            {drawingTopic && <div className="topic-draw-overlay" role="status"><span className="topic-draw-icon"><Dices size={24} /></span><strong>Drawing {difficulty === 'easy' ? 'an' : 'a'} {difficulty} prompt</strong><span className="topic-draw-dots" aria-hidden="true"><i /><i /><i /></span></div>}
            <div key={topic.id} className="topic-preview-content" aria-live="polite">
              <div className="topic-preview-top"><span className={`difficulty-pill ${topic.difficulty}`}>{topic.difficulty}</span><span lang={language === 'bn' ? 'bn' : undefined}>{topic.category}</span></div>
              <div className="topic-quote-mark">“</div>
              <h2 lang={language === 'bn' ? 'bn' : undefined}>{topic.prompt}</h2>
              <p lang={language === 'bn' ? 'bn' : undefined}>{practiceMode === 'duel' ? (language === 'bn' ? 'প্রথম বক্তা একটি এলোমেলো পক্ষ পাবেন। দ্বিতীয় বক্তা বিপরীত পক্ষ নেবেন।' : 'Speaker 1 gets a random side. Speaker 2 takes the opposite.') : stanceMode === 'game' ? (language === 'bn' ? 'বিষয়টি নিশ্চিত করলে আপনার পক্ষ দেখানো হবে।' : 'Your side will be revealed when you lock in this prompt.') : language === 'bn' ? `আপনি ${stanceLabel(stance, language)} কথা বলবেন।` : `You will argue ${stance}.`}</p>
              <button className="shuffle-button" type="button" disabled={drawingTopic} onClick={shuffleTopic}>{drawingTopic ? <Dices size={16} /> : <RefreshCw size={16} />} {drawingTopic ? 'Drawing…' : 'Draw another prompt'}</button>
              <div className="topic-preview-footer"><span><Clock3 size={15} /> {formatTime(duration)}{practiceMode === 'duel' ? ' each' : ''}</span><span><CircleDot size={15} /> {practiceMode === 'duel' ? 'Local 1v1' : stanceMode === 'game' ? (language === 'bn' ? 'এলোমেলো পক্ষ' : 'Random side') : stanceLabel(stance, language)}</span></div>
              <button className="button primary large full" type="button" disabled={drawingTopic} onClick={prepare}>{practiceMode === 'duel' ? 'Start the 1v1' : 'Lock it in'} <ChevronRight size={18} /></button>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (step === 'handoff' && pendingDuel) {
    return (
      <div className="handoff-page">
        <div className="handoff-card">
          <span className="handoff-seal"><Check size={26} /></span>
          <span className="eyebrow"><UsersRound size={14} /> Turn 1 sealed</span>
          <h1>Pass the device to {speaker2Name.trim() || 'Speaker 2'}</h1>
          <p>{speaker1Name.trim() || 'Speaker 1'}’s score and coaching stay hidden until both speeches are complete.</p>
          <div className="handoff-motion"><span>Same motion</span><strong>{topic.prompt}</strong></div>
          <div className="handoff-side"><span>{speaker2Name.trim() || 'Speaker 2'}, your side is</span><strong className={stance}>{stanceLabel(stance, language)}</strong></div>
          <button className="button primary large full" type="button" onClick={() => setStep('ready')}>I have the device <ChevronRight size={18} /></button>
          <button className="text-link handoff-cancel" type="button" onClick={cancelDuel}>Cancel this 1v1</button>
          <div className="handoff-privacy"><ShieldCheck size={15} /> This guest turn will be saved under {speaker1Name.trim() || 'Speaker 1'}’s account.</div>
        </div>
      </div>
    );
  }

  if (step === 'ready') {
    return (
      <div className="page practice-page ready-page">
        <button className="text-link back-button" type="button" onClick={() => setStep(practiceMode === 'duel' && activeSpeaker === 2 ? 'handoff' : 'setup')}><ArrowLeft size={15} /> {practiceMode === 'duel' && activeSpeaker === 2 ? 'Back to handoff' : 'Change setup'}</button>
        <div className="ready-layout">
          <section className="ready-prompt">
            <div className="ready-meta"><span className={`difficulty-pill ${topic.difficulty}`}>{topic.difficulty}</span><span>{topic.category}</span>{practiceMode === 'duel' && <span className="duel-turn-pill"><UsersRound size={12} /> {activeSpeaker === 1 ? speaker1Name.trim() || 'Speaker 1' : speaker2Name.trim() || 'Speaker 2'} · turn {activeSpeaker}</span>}</div>
            <span className={`stance-reveal ${stance}`}><Sparkles size={15} /> {language === 'bn' ? 'বলুন' : 'Argue'} {stanceLabel(stance, language)}</span>
            <h1 lang={language === 'bn' ? 'bn' : undefined}>{topic.prompt}</h1>
            <div className="prep-framework">
              <span><strong>Claim</strong><small>State your position</small></span><ArrowRight size={16} />
              <span><strong>Reason</strong><small>Explain why</small></span><ArrowRight size={16} />
              <span><strong>Example</strong><small>Make it concrete</small></span><ArrowRight size={16} />
              <span><strong>Close</strong><small>Land the point</small></span>
            </div>
          </section>
          <aside className="ready-recorder-card">
            <span className="ready-mic"><Mic2 size={30} /></span>
            <h2>{practiceMode === 'duel' ? `${activeSpeaker === 1 ? speaker1Name.trim() || 'Speaker 1' : speaker2Name.trim() || 'Speaker 2'} · ` : ''}{formatTime(duration)} on the clock</h2>
            <p>Your browser will ask for microphone access. The countdown starts only after access is granted.</p>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button primary large full" type="button" disabled={starting} onClick={() => void startRecording()}>{starting ? <><LoaderCircle size={19} className="spin" /> Waiting for microphone…</> : <><Mic2 size={19} /> Start recording</>}</button>
            <span className="privacy-line"><ShieldCheck size={14} /> Acoustic analysis runs locally</span>
          </aside>
        </div>
      </div>
    );
  }

  if (step === 'recording') {
    return (
      <div className="recording-page">
        <div className="recording-live-label"><span /> Recording live</div>
        <div className="recording-topic" lang={language === 'bn' ? 'bn' : undefined}><span>{practiceMode === 'duel' ? `${activeSpeaker === 1 ? speaker1Name.trim() || 'Speaker 1' : speaker2Name.trim() || 'Speaker 2'} · ` : ''}{language === 'bn' ? 'বলুন' : 'Argue'} {stanceLabel(stance, language)}</span><h1>{topic.prompt}</h1></div>
        <div className="recording-stage">
          <div className="record-timer" style={{ '--timer-progress': `${timerProgress * 360}deg` } as CSSProperties}>
            <div><strong>{formatTime(remaining)}</strong><span>remaining</span></div>
          </div>
          <Waveform levels={levels} active />
          <div className="live-level"><Volume2 size={14} /><span><i style={{ width: `${Math.min(100, (levels.at(-1) ?? 0) * 900)}%` }} /></span></div>
          <button className="stop-button" type="button" onClick={() => void stopRecording()}><Square size={21} fill="currentColor" /><span>Finish early</span></button>
        </div>
        <p className="recording-hint">Take the pause. Then continue the thought.</p>
      </div>
    );
  }

  if (step === 'review' && recording) {
    return (
      <div className="page practice-page review-page">
        <div className="practice-page-header"><div><span className="eyebrow"><Check size={14} /> {practiceMode === 'duel' ? `${activeSpeaker === 1 ? speaker1Name.trim() || 'Speaker 1' : speaker2Name.trim() || 'Speaker 2'} recorded` : 'Recording complete'}</span><h1>Listen once. Then analyze.</h1><p>{practiceMode === 'duel' && activeSpeaker === 1 ? 'This turn will be sealed before the device handoff.' : 'You can redo the take before any analysis or saving happens.'}</p></div><span className="step-count">{practiceMode === 'duel' ? `Speaker ${activeSpeaker} of 2` : 'Step 2 of 3'}</span></div>
        <div className="review-layout">
          <section className="review-player-card">
            <div className="review-topic" lang={language === 'bn' ? 'bn' : undefined}><span className={`stance-pill ${stance}`}>{stanceLabel(stance, language)}</span><h2>{topic.prompt}</h2></div>
            <Waveform levels={levels} label="Waveform from recorded speech" />
            {audioUrl && <AudioPlayer src={audioUrl} fallbackDuration={recording.durationSeconds} />}
            <div className="review-facts"><span><Clock3 size={15} /><strong>{recording.durationSeconds.toFixed(1)}s</strong><small>recorded</small></span><span><AudioLines size={15} /><strong>{recording.mimeType.split(';')[0]}</strong><small>format</small></span><span><ShieldCheck size={15} /><strong>{settings.saveRecordings ? 'Enabled' : 'Off'}</strong><small>save audio</small></span></div>
          </section>
          <aside className="review-action-card">
            <span className="eyebrow"><BrainCircuit size={14} /> Ready for evidence</span>
            <h2>Analyze voice and words</h2>
            <p>VoxLab will measure pauses, energy, pitch, pace, fillers, vocabulary, structure, and relevance.</p>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button primary large full" type="button" onClick={() => void analyze()}><Sparkles size={18} /> {practiceMode === 'duel' && activeSpeaker === 1 ? 'Analyze and seal turn' : practiceMode === 'duel' ? 'Analyze and compare' : 'Analyze this speech'}</button>
            <button className="button secondary full" type="button" onClick={resetRecording}><RotateCcw size={17} /> Record again</button>
            <p className="model-note">First-time analysis may download the selected {language === 'bn' ? 'multilingual ' : ''}Whisper model{language === 'en' ? ' and semantic stance model' : ''}. They are cached for later practices.</p>
          </aside>
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    const activePhase = processingPhase(progress?.stage);
    const currentIndex = processingPhases.findIndex((phase) => phase.key === activePhase);
    const activeCopy = processingPhases[currentIndex] ?? processingPhases[0];
    const progressValue = [12, 38, 66, 84, 96][currentIndex] ?? 8;
    return (
      <div className="processing-page">
        <div className="processing-card">
          <div className="processing-orbit"><span /><BrainCircuit size={32} /></div>
          <span className="eyebrow">Step 3 of 3</span>
          <h1>Building your coaching brief</h1>
          <div className="processing-copy" aria-live="polite" aria-atomic="true"><strong>{activeCopy.title}</strong><p>{activeCopy.detail}</p></div>
          <div className="processing-progress" role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue}><span style={{ width: `${progressValue}%` }} /></div>
          <div className="processing-stages">
            {processingPhases.map(({ key, label }, index) => {
              const complete = index < currentIndex;
              const active = index === currentIndex;
              return <span key={key} className={`${complete ? 'complete' : ''}${active ? ' active' : ''}`}>{complete ? <Check size={12} /> : <i />}{label}</span>;
            })}
          </div>
          <div className="processing-note"><ShieldCheck size={15} /><span>Keep this tab open. Voice metrics are being computed on your device.</span></div>
        </div>
      </div>
    );
  }

  if (step === 'manual') {
    return (
      <div className="page practice-page manual-page">
        <div className="manual-card">
          <span className="manual-icon"><FilePenLine size={25} /></span>
          <span className="eyebrow">Transcription fallback</span>
          <h1>Add what you said</h1>
          <p>The voice analysis succeeded, but local speech-to-text could not finish. Paste or type a rough transcript—the wording does not need to be perfect.</p>
          <div className="manual-reason"><TriangleAlert size={15} /> {manualReason}</div>
          {audioUrl && recording && (
            <div className="manual-recording">
              <div className="manual-recording-heading"><AudioLines size={17} /><div><strong>Replay your recording</strong><span>Listen back while you add a rough transcript.</span></div></div>
              <AudioPlayer src={audioUrl} fallbackDuration={recording.durationSeconds} compact />
            </div>
          )}
          <form onSubmit={submitManual}>
            <label><span>Manual transcript</span><textarea lang={language === 'bn' ? 'bn' : undefined} value={manualTranscript} onChange={(event) => { setManualTranscript(event.target.value); setError(null); }} rows={9} placeholder={language === 'bn' ? 'আপনি যা বলেছিলেন তা বাংলায় লিখুন…' : 'Type the words you remember saying…'} required /></label>
            <div className="manual-count">{manualTranscript.trim() ? manualTranscript.trim().split(/\s+/).length : 0} words</div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button primary large full" type="submit"><BrainCircuit size={18} /> Continue analysis</button>
            <button className="button secondary full" type="button" onClick={() => setStep('review')}>Back to recording</button>
          </form>
        </div>
        <aside className="manual-help"><Lightbulb size={19} /><div><strong>Why this works</strong><p>Pause, pitch, loudness, and timing come from the audio. The transcript is used for vocabulary, structure, and relevance.</p></div></aside>
      </div>
    );
  }

  return <div className="page error-page"><TriangleAlert size={28} /><h1>Practice interrupted</h1><p>Please return to the setup and try again.</p><Link className="button secondary" to="/dashboard">Dashboard</Link></div>;
}
