import {
  ArrowLeft,
  ArrowRight,
  AlignLeft,
  AudioLines,
  BookOpenCheck,
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
  Trophy,
  TriangleAlert,
  UsersRound,
  Volume2,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AudioPlayer } from '../components/AudioPlayer';
import { MetricBar } from '../components/MetricBar';
import { ScoreRing } from '../components/ScoreRing';
import { SpokenCoach } from '../components/SpokenCoach';
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
  const duel = report.duel;
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
      {report.analysisWarning && <div className="analysis-warning"><TriangleAlert size={17} /><span>{report.analysisWarning}</span></div>}

      {duel && (
        <section className="duel-result-card">
          <div className="duel-result-heading"><div><span className="eyebrow"><Trophy size={14} /> Local 1v1 result</span><h2>{duel.verdict}</h2><p>This compares speaking performance on the same demanding rubric—not which real-world position is objectively correct.</p></div><span className="duel-margin">{duel.winner === 'tie' ? 'Draw' : `${duel.margin}-point margin`}</span></div>
          <div className="duel-scoreboard">
            {[duel.speaker1, duel.speaker2].map((speaker, index) => {
              const slot = (index + 1) as 1 | 2;
              const won = duel.winner === slot;
              return (
                <div key={speaker.attemptId} className={`duel-speaker${won ? ' winner' : ''}${duel.currentSpeaker === slot ? ' current' : ''}`}>
                  <div><span>{won ? <Trophy size={14} /> : <UsersRound size={14} />} Speaker {slot}{duel.currentSpeaker === slot ? ' · this report' : ''}</span><strong>{speaker.name}</strong><small className={`stance-pill ${speaker.stance}`}>{speaker.stance}</small></div>
                  <ScoreRing score={speaker.scores.overall} size="small" />
                </div>
              );
            })}
          </div>
          <div className="duel-category-grid">
            {scoreLabels.map(({ key, label }) => (
              <div key={key}><span>{label}</span><strong>{duel.speaker1.scores[key]}</strong><i><b style={{ width: `${Math.max(4, duel.speaker1.scores[key])}%` }} /><b style={{ width: `${Math.max(4, duel.speaker2.scores[key])}%` }} /></i><strong>{duel.speaker2.scores[key]}</strong></div>
            ))}
          </div>
          <div className="duel-swing-factors">{duel.swingFactors.map((factor) => <span key={factor}><CheckCircle2 size={14} /> {factor}</span>)}</div>
          <div className="duel-report-links"><Link className="button secondary" to={`/results/${duel.speaker1.attemptId}`}>{duel.speaker1.name}’s full report</Link><Link className="button secondary" to={`/results/${duel.speaker2.attemptId}`}>{duel.speaker2.name}’s full report</Link></div>
        </section>
      )}

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

          {!!report.feedback.weaknesses?.length && (
            <article className="result-card weakness-card">
              <div className="card-heading"><span className="card-icon"><Target size={18} /></span><div><span className="eyebrow">Weakness lab</span><h2>What held this speech back</h2></div></div>
              <p className="section-intro">These are observable speaking habits, not judgments about personality or confidence.</p>
              <div className="weakness-list">
                {report.feedback.weaknesses.map((weakness, index) => (
                  <section key={`${weakness.title}-${index}`}>
                    <span className="weakness-rank">{index + 1}</span>
                    <div><h3>{weakness.title}</h3><dl><div><dt>Evidence noticed</dt><dd>{weakness.evidence}</dd></div><div><dt>Why it matters</dt><dd>{weakness.whyItMatters}</dd></div><div className="weakness-action"><dt>How to improve</dt><dd>{weakness.howToImprove}</dd></div></dl></div>
                  </section>
                ))}
              </div>
            </article>
          )}

          {!!report.feedback.reframes?.length && (
            <article className="result-card reframe-card">
              <div className="card-heading"><span className="card-icon"><WandSparkles size={18} /></span><div><span className="eyebrow">Sentence workshop</span><h2>Keep the idea. Sharpen the wording.</h2></div></div>
              <div className="reframe-list">
                {report.feedback.reframes.map((item, index) => (
                  <section key={`${item.original}-${index}`}>
                    <div className="reframe-original"><span>You said</span><blockquote>“{item.original}”</blockquote></div>
                    <div className="reframe-arrow"><ArrowRight size={18} /></div>
                    <div className="reframe-revised"><span>A tighter version</span><blockquote>“{item.revised}”</blockquote></div>
                    <p><strong>What changed:</strong> {item.issue} {item.principle}</p>
                  </section>
                ))}
              </div>
            </article>
          )}

          {report.feedback.topicStrategy && (
            <article className="result-card strategy-card">
              <div className="card-heading"><span className="card-icon"><BookOpenCheck size={18} /></span><div><span className="eyebrow">Think through the motion</span><h2>A stronger route for your next take</h2></div></div>
              <div className="strategy-question"><span>Core question</span><strong>{report.feedback.topicStrategy.coreQuestion}</strong></div>
              <div className="strategy-columns"><div><h3>Three lenses</h3>{report.feedback.topicStrategy.angles.map((angle) => <p key={angle}><Target size={14} /> {angle}</p>)}</div><div><h3>Strongest counterargument</h3><p>{report.feedback.topicStrategy.strongestCounterargument}</p></div></div>
              <div className="strategy-outline"><h3>Next outline</h3><ol>{report.feedback.topicStrategy.nextOutline.map((line) => <li key={line}>{line}</li>)}</ol></div>
            </article>
          )}

          <article className="result-card transcript-card">
            <div className="card-heading"><span className="card-icon"><FileText size={18} /></span><div><span className="eyebrow">Transcript</span><h2>Your argument in words</h2></div></div>
            <blockquote lang={attempt.topic.language === 'bn' ? 'bn' : undefined}>{attempt.transcript}</blockquote>
            <div className="transcript-footer"><span>{report.text.wordCount} words</span><span>{report.text.sentenceCount} sentences</span><span>{report.transcriptionEngine}</span></div>
          </article>
        </div>

        <aside className="results-aside-column">
          <article className="result-card spoken-coach-card"><div className="card-heading"><span className="card-icon"><Volume2 size={18} /></span><div><span className="eyebrow">Spoken coaching</span><h2>Hear the first priority</h2></div></div><SpokenCoach key={id} feedback={report.feedback} language={attempt.topic.language ?? report.feedback.language ?? 'en'} /></article>

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
              <div><span><CheckCircle2 size={15} /> Stance match</span><strong className={`stance-match ${report.text.stanceSignal}`}>{report.text.stanceSignal}{report.text.stanceConfidence ? ` · ${Math.round(report.text.stanceConfidence * 100)}%` : ''}</strong></div>
              <div><span><Link2 size={15} /> Reasoning links</span><strong>{report.text.reasoningMarkerCount ?? 0}</strong></div>
              <div><span><Quote size={15} /> Example cues</span><strong>{report.text.exampleMarkerCount ?? 0}</strong></div>
              <div><span><Shuffle size={15} /> Transition variety</span><strong>{report.text.transitionVariety ?? report.text.transitionCount}</strong></div>
              <div><span><FileText size={15} /> Content words</span><strong>{Math.round((report.text.contentWordRatio ?? 0) * 100)}%</strong></div>
              <div><span><AlignLeft size={15} /> Sentence rhythm</span><strong>{metric(report.text.averageSentenceWords ?? 0, ' avg', 1)}</strong></div>
            </div>
            <p className="local-analysis-note">Stance: {report.text.stanceEngine ?? 'legacy phrase signals'}. {attempt.topic.language === 'bn' ? 'Bengali currently uses phrase and topic signals; explicitly stating পক্ষে or বিপক্ষে gives the checker stronger evidence.' : 'Semantic NLI compares the transcript with the motion, but can still miss sarcasm, mixed rebuttals, or transcription errors.'}</p>
          </article>

          <Link className="next-practice-card" to="/practice"><span><small>Next rep</small><strong>Apply one coaching note</strong></span><ArrowRight size={19} /></Link>
        </aside>
      </section>
    </div>
  );
}
