import { Database, HardDrive } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function StorageBadge({ className = '' }: { className?: string }) {
  const { storageStatus } = useApp();
  if (!storageStatus) return null;
  const Icon = storageStatus.kind === 'database' ? Database : HardDrive;

  return (
    <span className={`storage-badge storage-${storageStatus.kind} ${className}`.trim()} title={storageStatus.detail}>
      <Icon size={13} />
      <span>{storageStatus.kind === 'database' ? 'Server storage' : 'On-device storage'}</span>
    </span>
  );
}
