import { HardDrive, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';

const DISMISSED_KEY = 'voxlab-local-banner-v1';

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function LocalModeBanner() {
  const { storageStatus } = useApp();
  const [dismissed, setDismissed] = useState(wasDismissed);

  if (storageStatus?.kind !== 'browser' || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'dismissed');
    } catch {
      // Dismissing still works for this tab when storage is unavailable.
    }
  };

  return (
    <div className="local-mode-banner" role="status">
      <div>
        <HardDrive size={15} />
        <p><strong>Running locally in your browser.</strong> Your account, history, analytics, and saved recordings stay on this device.</p>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss local mode notice" title="Dismiss">
        <X size={15} />
      </button>
    </div>
  );
}
