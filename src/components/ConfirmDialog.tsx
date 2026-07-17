import { AlertTriangle, X } from 'lucide-react';
import { type ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  dangerous?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  confirmDisabled = false,
  dangerous = true,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button dialog-close" type="button" onClick={onCancel} aria-label="Close dialog"><X size={18} /></button>
        <span className={`dialog-icon${dangerous ? ' danger' : ''}`}><AlertTriangle size={22} /></span>
        <h2 id="dialog-title">{title}</h2>
        <div className="dialog-description">{description}</div>
        <div className="dialog-actions">
          <button className="button secondary" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`button${dangerous ? ' danger' : ' primary'}`} type="button" onClick={onConfirm} disabled={busy || confirmDisabled}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
