import {
  ArrowLeft,
  ArrowRight,
  AlignLeft,
  AudioLines,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  Headphones,
  Lightbulb,
  Link2,
  LoaderCircle,
  MessageSquareText,
  Mic2,
  Pause,
  Quote,
  Shuffle,
  Sparkles,
  Target,
  TriangleAlert,
  Volume2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AudioPlayer } from '../components/AudioPlayer';
import { MetricBar } from '../components/MetricBar';
import { ScoreRing } from '../components/ScoreRing';
import { useApp } from '../context/AppContext';
import type { PracticeAttempt, ScoreBreakdown } from '../types';

const scoreLabels: Array<{ key: keyof ScoreBreakdown; label: string }> = [
  { key: 'pacing', label: 'Pacing' },
  { key: 'fluency', label: 'Fluency' },
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'structure', label: 'Structure' },
  { key: 'relevance', label: 'Relevance' },
];

function metric(value: number | null, suffix = '', digits = 0): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}${suffix}`;
}

function scoreBand(score: number): string {
  if (score >= 90) return 'Exceptional';
  if (score >= 80) return 'Strong';
  if (score >= 65) return 'Capable';
  return 'Developing';
}

export function ResultsPage() {
  const { id = '' } = useParams();
  const { attempts, getAttempt, getRecording } = useApp();
  const [attempt, setAttempt] = useState<PracticeAttempt | null | undefined>(() => attempts.find((item) => item.id === id));
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const found = await getAttempt(id);
        if (cancelled) return;
        setAttempt(found);
        if (found?.hasRecording) {
          const recording = await getRecording(id);
          if (recording && !cancelled) {
            objectUrl = URL.createObjectURL(recording);
            setAudioUrl(objectUrl);
          }
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load this analysis.');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [getAttempt, getRecording, id]);

  const createdLabel = useMemo(() => attempt ? new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(attempt.createdAt)) : '', [attempt]);

  if (attempt === undefined && !error) return <div className="page-loading"><LoaderCircle className="spin" size={25} /> Loading your analysis…</div>;
  if (!attempt || error) return <div className="page error-page"><TriangleAlert size={28} /><h1>Analysis not found</h1><p>{error ?? 'This practice may have been deleted.'}</p><Link className="button secondary" to="/history"><ArrowLeft size={16} /> Back to history</Link></div>;

  const { report } = attempt;
  const providerLabel = report.feedback.provider === 'ollama' ? `Ollama · ${report.feedback.model ?? 'local model'}` : 'Browser coach';
  const scrollToRecording = () => document.getElementById('recording')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div className="page results-page">
      <div className="results-back-row"><Link className="text-link" to="/history"><ArrowLeft size={15} /> History</Link><span>{createdLabel}</span></div>

      <section className="results-hero">
        <div className="results-score"><ScoreRing score={report.scores.overall} /><span className="score-band">{scoreBand(report.scores.overall)}</span><span className="provider-badge"><Sparkles size={13} /> {providerLabel}</span></div>
        <div className="results-title">
          <div className="attempt-meta"><span className={`difficulty-pill ${attempt.topic.difficulty}`}>{attempt.topic.difficulty}</span><span className={`stance-pill ${attempt.stance}`}>{attempt.stance}</span><span><Clock3 size={12} /> {Math.round(attempt.durationSeconds)} sec</span></div>
          <h1>{attempt.topic.prompt}</h1>
          <p>{report.feedback.summary}</p>
          <div className="results-actions"><Link className="button primary" to="/practice"><Mic2 size={17} /> Practice another</Link>{audioUrl && <button className="button secondary" type="button" onClick={scrollToRecording}><Headphones size={17} /> Listen back</button>}</div>
        </div>
      </section>

      {report.transcriptionWarning && <div className="analysis-warning"><TriangleAlert size={17} /><span>{report.transcriptionWarning}</span></div>}

      <section className="results-grid">
        <div className="results-main-column">
          <article className="result-card">
            <div className="card-heading"><span className="card-icon"><Gauge size={18} /></span><div><span className="eyebrow">Score breakdown</span><h2>How the speech held together</h2></div></div>
            <div className="metric-bars">{scoreLabels.map(({ key, label }) => <MetricBar key={key} label={label} value={report.scores[key]} />)}</div>
            <div className="score-calibration"><Gauge size={15} /><p><strong>A deliberately demanding rubric.</strong> Around 70 is capable, 80 is strong, and 90 is exceptional. Short takes are capped until there is enough voice and language evidence.</p></div>
          </article>

          <article className="result-card">
            <div className="card-heading"><span className="card-icon"><Lightbulb size={18} /></span><div><span className="eyebrow">Coach notes</span><h2>What to keep and what to train</h2></div></div>
            <div className="strength-list"><h3>Strengths</h3>{report.feedback.strengths.map((strength) => <p key={strength}><CheckCircle2 size={16} /> {strength}</p>)}</div>
            <div className="improvement-list">
              {report.feedback.improvements.map((improvement, index) => (
                <section key={`${improvement.title}-${index}`}>
                  <span className="improvement-number">{String(index + 1).padStart(2, '0')}</span>
                  <div><h3>{improvement.title}</h3><p>{improvement.detail}</p><div className="drill"><strong>Try this drill</strong><span>{improvement.drill}</span></div></div>
                </section>
              ))}
            </div>
          </article>

          <article className="result-card transcript-card">
            <div className="card-heading"><span className="card-icon"><FileText size={18} /></span><div><span className="eyebrow">Transcript</span><h2>Your argument in words</h2></div></div>
            <blockquote>{attempt.transcript}</blockquote>
            <div className="transcript-footer"><span>{report.text.wordCount} words</span><span>{report.text.sentenceCount} sentences</span><span>{report.transcriptionEngine}</span></div>
          </article>
        </div>

        <aside className="results-aside-column">
          {audioUrl && <article className="result-card audio-card" id="recording"><span className="card-icon"><Volume2 size={18} /></span><div><span className="eyebrow">Saved recording</span><h2>Listen for the evidence</h2><p>Replay once while reading the notes. Focus on only one improvement.</p></div><AudioPlayer src={audioUrl} fallbackDuration={attempt.durationSeconds} compact /></article>}

          <article className="result-card voice-evidence-card">
            <div className="card-heading"><span className="card-icon"><AudioLines size={18} /></span><div><span className="eyebrow">Voice evidence</span><h2>Measured acoustics</h2></div></div>
            <div className="evidence-grid">
              <div><span><Gauge size={15} /> Pace</span><strong>{metric(report.text.wordsPerMinute, ' WPM')}</strong></div>
              <div><span><MessageSquareText size={15} /> Fillers</span><strong>{report.text.fillerCount}</strong></div>
              <div><span><Pause size={15} /> Pauses</span><strong>{report.audio.pauseCount}</strong></div>
              <div><span><Clock3 size={15} /> Longest</span><strong>{metric(report.audio.longestPauseSeconds, 's', 1)}</strong></div>
              <div><span><AudioLines size={15} /> Pitch range</span><strong>{metric(report.audio.pitchVariationSemitones, ' st', 1)}</strong></div>
              <div><span><Volume2 size={15} /> Volume range</span><strong>{metric(report.audio.volumeVariation, ' dB', 1)}</strong></div>
            </div>
            <div className="evidence-detail">
              <span><small>Silence ratio</small><strong>{Math.round(report.audio.silenceRatio * 100)}%</strong></span>
              <span><small>Initial pause</small><strong>{metric(report.audio.initialSilenceSeconds, 's', 1)}</strong></span>
              <span><small>Clipping</small><strong>{metric(report.audio.clippingRatio * 100, '%', 1)}</strong></span>
            </div>
            <p className="local-analysis-note">These signals are derived from the recorded waveform, not guessed from the transcript.</p>
          </article>

          <article className="result-card language-evidence-card">
            <div className="card-heading"><span className="card-icon"><AlignLeft size={18} /></span><div><span className="eyebrow">Argument evidence</span><h2>Measured language signals</h2></div></div>
            <div className="evidence-grid">
              <div><span><Target size={15} /> Topic coverage</span><strong>{Math.round((report.text.topicKeywordCoverage ?? 0) * 100)}%</strong></div>
              <div><span><Link2 size={15} /> Reasoning links</span><strong>{report.text.reasoningMarkerCount ?? 0}</strong></div>
              <div><span><Quote size={15} /> Example cues</span><strong>{report.text.exampleMarkerCount ?? 0}</strong></div>
              <div><span><Shuffle size={15} /> Transition variety</span><strong>{report.text.transitionVariety ?? report.text.transitionCount}</strong></div>
              <div><span><FileText size={15} /> Content words</span><strong>{Math.round((report.text.contentWordRatio ?? 0) * 100)}%</strong></div>
              <div><span><AlignLeft size={15} /> Sentence rhythm</span><strong>{metric(report.text.averageSentenceWords ?? 0, ' avg', 1)}</strong></div>
            </div>
            <p className="local-analysis-note">These are transparent transcript signals—not a claim that the app understands every idea or synonym.</p>
          </article>

          <Link className="next-practice-card" to="/practice"><span><small>Next rep</small><strong>Apply one coaching note</strong></span><ArrowRight size={19} /></Link>
        </aside>
      </section>
    </div>
  );
}
