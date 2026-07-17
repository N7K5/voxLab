import { ArrowUpRight, Clock3, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PracticeAttempt } from '../types';
import { ScoreRing } from './ScoreRing';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function AttemptCard({ attempt, onDelete, compact = false }: { attempt: PracticeAttempt; onDelete?: () => void; compact?: boolean }) {
  return (
    <article className={`attempt-card${compact ? ' compact' : ''}`}>
      <ScoreRing score={attempt.report.scores.overall} size="small" />
      <div className="attempt-main">
        <div className="attempt-meta">
          <span className={`difficulty-pill ${attempt.topic.difficulty}`}>{attempt.topic.difficulty}</span>
          <span className={`stance-pill ${attempt.stance}`}>{attempt.stance}</span>
          <span><Clock3 size={12} /> {formatDate(attempt.createdAt)}</span>
        </div>
        <h3>{attempt.topic.prompt}</h3>
        {!compact && <p>{attempt.report.feedback.summary}</p>}
      </div>
      <div className="attempt-actions">
        {onDelete && (
          <button className="icon-button danger-quiet" type="button" onClick={onDelete} aria-label="Delete attempt"><Trash2 size={17} /></button>
        )}
        <Link className="icon-button" to={`/results/${attempt.id}`} aria-label="Open analysis"><ArrowUpRight size={18} /></Link>
      </div>
    </article>
  );
}
