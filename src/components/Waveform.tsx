interface WaveformProps {
  levels: number[];
  active?: boolean;
  label?: string;
}

export function Waveform({ levels, active = false, label = 'Live microphone level' }: WaveformProps) {
  const bars = levels.length ? levels : Array.from({ length: 48 }, (_, index) => 0.06 + ((index * 7) % 11) / 90);
  return (
    <div className={`waveform${active ? ' active' : ''}`} role="img" aria-label={label}>
      {bars.slice(-48).map((level, index) => {
        const normalized = Math.min(1, Math.max(0.06, level * 9));
        return <span key={`${index}-${bars.length}`} style={{ height: `${10 + normalized * 78}%` }} />;
      })}
    </div>
  );
}
