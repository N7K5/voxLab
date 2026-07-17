import { AudioLines } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" to="/dashboard" aria-label="VoxLab dashboard">
      <span className="brand-mark"><AudioLines size={20} strokeWidth={2.4} /></span>
      <span className="brand-name">VoxLab</span>
      {!compact && <span className="brand-tagline">Speech practice, made visible</span>}
    </Link>
  );
}
