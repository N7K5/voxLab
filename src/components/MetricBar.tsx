export function MetricBar({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const score = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="metric-bar">
      <div className="metric-bar-header">
        <span>{label}</span>
        <strong>{score}</strong>
      </div>
      <div className="metric-track"><span style={{ width: `${score}%` }} /></div>
      {hint && <p>{hint}</p>}
    </div>
  );
}
