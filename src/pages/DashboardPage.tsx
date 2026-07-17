import {
  ArrowRight,
  AudioLines,
  BarChart3,
  Clock3,
  Gauge,
  Mic2,
  Sparkles,
  Target,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AttemptCard } from '../components/AttemptCard';
import { useApp } from '../context/AppContext';

function average(values: number[]): number {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

export function DashboardPage() {
  const { user, attempts, settings } = useApp();
  const averageScore = average(attempts.map((attempt) => attempt.report.scores.overall));
  const totalMinutes = Math.round(attempts.reduce((sum, attempt) => sum + attempt.durationSeconds, 0) / 60);
  const bestScore = attempts.length ? Math.max(...attempts.map((attempt) => attempt.report.scores.overall)) : 0;
  const firstName = user?.username.split(/[\s._-]/)[0] ?? 'speaker';

  return (
    <div className="page dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="eyebrow"><Sparkles size={14} /> Daily speaking gym</span>
          <h1>Ready to make one clear point, <em>{firstName}</em>?</h1>
          <p>A focused minute is enough to reveal your pace, pauses, vocabulary, structure, and delivery.</p>
          <div className="hero-actions">
            <Link className="button primary large" to="/practice"><Mic2 size={19} /> Start a practice</Link>
            {attempts[0] && <Link className="button secondary large" to={`/results/${attempts[0].id}`}>Last analysis <ArrowRight size={18} /></Link>}
          </div>
        </div>
        <div className="dashboard-hero-visual">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="hero-mic"><AudioLines size={42} /></div>
          <span className="floating-stat stat-one"><small>AI coach</small><strong>{settings?.aiProvider === 'ollama' ? 'Ollama' : 'In browser'}</strong></span>
          <span className="floating-stat stat-two"><small>Session</small><strong>1 focused min</strong></span>
          <span className="floating-stat stat-three"><small>Signals</small><strong>Voice + words</strong></span>
        </div>
      </section>

      <section className="stats-grid" aria-label="Practice statistics">
        <article className="stat-card"><span className="stat-icon mint"><Target size={18} /></span><div><small>Practices</small><strong>{attempts.length}</strong><p>completed sessions</p></div></article>
        <article className="stat-card"><span className="stat-icon lilac"><Gauge size={18} /></span><div><small>Average</small><strong>{averageScore || '—'}</strong><p>overall score</p></div></article>
        <article className="stat-card"><span className="stat-icon gold"><Clock3 size={18} /></span><div><small>Speaking time</small><strong>{totalMinutes || '—'}</strong><p>{totalMinutes === 1 ? 'minute recorded' : 'minutes recorded'}</p></div></article>
        <article className="stat-card"><span className="stat-icon coral"><BarChart3 size={18} /></span><div><small>Personal best</small><strong>{bestScore || '—'}</strong><p>highest overall</p></div></article>
      </section>

      <section className="section-block">
        <div className="section-heading-row">
          <div><span className="eyebrow">Your progress</span><h2>Recent practices</h2></div>
          {attempts.length > 0 && <Link className="text-link" to="/history">View all <ArrowRight size={15} /></Link>}
        </div>
        {attempts.length ? (
          <div className="attempt-list">{attempts.slice(0, 3).map((attempt) => <AttemptCard key={attempt.id} attempt={attempt} compact />)}</div>
        ) : (
          <div className="empty-panel">
            <span className="empty-icon"><Mic2 size={25} /></span>
            <div><h3>Your first baseline starts here</h3><p>Record one short response. VoxLab will turn it into delivery metrics and practical coaching.</p></div>
            <Link className="button secondary" to="/practice">Create baseline <ArrowRight size={16} /></Link>
          </div>
        )}
      </section>

      <section className="how-grid">
        <article><span>01</span><h3>Draw a position</h3><p>Choose a difficulty and side, or let game mode surprise you.</p></article>
        <article><span>02</span><h3>Speak against the clock</h3><p>A live waveform and clean timer keep you in the moment.</p></article>
        <article><span>03</span><h3>Train one weakness</h3><p>See acoustic and language evidence, then leave with a drill.</p></article>
      </section>
    </div>
  );
}
