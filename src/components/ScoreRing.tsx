import type { CSSProperties } from 'react';

interface ScoreRingProps {
  score: number;
  size?: 'small' | 'large';
  label?: string;
}

export function ScoreRing({ score, size = 'large', label = 'Overall score' }: ScoreRingProps) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div className={`score-ring score-ring-${size}`} style={{ '--score': `${value}%` } as CSSProperties} aria-label={`${label}: ${value} out of 100`}>
      <div className="score-ring-inner">
        <strong>{value}</strong>
        {size === 'large' && <span>{label}</span>}
      </div>
    </div>
  );
}
