import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  LoaderCircle,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StorageBadge } from '../components/StorageBadge';
import { useApp } from '../context/AppContext';
import type { AiProvider, UserSettings } from '../types';

export function SettingsPage() {
  const { user, settings, storageStatus, saveSettings, deleteAccount } = useApp();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<UserSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    if (storageStatus?.kind === 'browser') {
      setDraft((current) => current?.ollamaViaServer ? { ...current, ollamaViaServer: false } : current);
    }
  }, [storageStatus]);
  if (!draft) return <div className="page-loading"><LoaderCircle className="spin" size={24} /> Loading settings…</div>;

  const update = <Key extends keyof UserSettings>(key: Key, value: UserSettings[Key]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setSaved(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveSettings(draft);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const chooseProvider = (provider: AiProvider) => {
    setDraft((current) => current ? {
      ...current,
      aiProvider: provider,
      ollamaViaServer: provider === 'ollama' && storageStatus?.kind === 'browser' ? false : current.ollamaViaServer,
    } : current);
    setSaved(false);
  };
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      navigate('/auth', { replace: true });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the account.');
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page settings-page">
      <div className="page-header">
        <span className="eyebrow"><Settings2 size={14} /> Model and privacy controls</span>
        <h1>Settings</h1>
        <p>Choose where coaching runs and what VoxLab keeps after each practice.</p>
      </div>

      <form className="settings-layout" onSubmit={(event) => void submit(event)}>
        <div className="settings-main">
          <section className="settings-card">
            <div className="settings-card-heading"><span className="settings-icon"><BrainCircuit size={19} /></span><div><h2>Coaching provider</h2><p>Voice metrics always run in this browser. This setting controls the written coaching.</p></div></div>
            <div className="provider-grid">
              <button type="button" className={`provider-card${draft.aiProvider === 'browser' ? ' selected' : ''}`} onClick={() => chooseProvider('browser')}>
                <span className="provider-icon"><Cpu size={21} /></span>
                <span><strong>Browser coach</strong><small>Fast, deterministic feedback with no LLM request.</small></span>
                {draft.aiProvider === 'browser' && <CheckCircle2 size={18} />}
              </button>
              <button type="button" className={`provider-card${draft.aiProvider === 'ollama' ? ' selected' : ''}`} onClick={() => chooseProvider('ollama')}>
                <span className="provider-icon"><Bot size={21} /></span>
                <span><strong>Ollama coach</strong><small>Use a local model for richer, personalized suggestions.</small></span>
                {draft.aiProvider === 'ollama' && <CheckCircle2 size={18} />}
              </button>
            </div>

            {draft.aiProvider === 'ollama' && (
              <div className="settings-fields inset-fields">
                <label><span>Ollama endpoint</span><input value={draft.ollamaEndpoint} onChange={(event) => update('ollamaEndpoint', event.target.value)} placeholder="http://localhost:11434" required /></label>
                <label><span>Model</span><input value={draft.ollamaModel} onChange={(event) => update('ollamaModel', event.target.value)} placeholder="qwen3:4b" required /></label>
                <label className="toggle-row">
                  <span><strong>Route through app server</strong><small>Recommended; avoids browser CORS restrictions.</small></span>
                  <input className="toggle-input" type="checkbox" checked={storageStatus?.kind === 'browser' ? false : draft.ollamaViaServer} disabled={storageStatus?.kind === 'browser'} onChange={(event) => update('ollamaViaServer', event.target.checked)} />
                </label>
                {storageStatus?.kind === 'browser' ? (
                  <p className="settings-note warning">Browser storage has no authenticated app-server proxy, so Ollama connects directly. Allow this site’s origin in Ollama (for example with <code>OLLAMA_ORIGINS</code>).</p>
                ) : !draft.ollamaViaServer ? (
                  <p className="settings-note warning">Direct browser access requires Ollama to allow this site’s origin.</p>
                ) : null}
              </div>
            )}
          </section>

          <section className="settings-card">
            <div className="settings-card-heading"><span className="settings-icon"><Cpu size={19} /></span><div><h2>Speech transcription</h2><p>The first run downloads the selected Whisper model and caches it in your browser.</p></div></div>
            <div className="settings-fields two-column">
              <label><span>Whisper model</span><select value={draft.whisperModel} onChange={(event) => update('whisperModel', event.target.value)}><option value="onnx-community/whisper-tiny.en">Whisper tiny.en · fastest</option><option value="onnx-community/whisper-base.en">Whisper base.en · more accurate</option></select></label>
              <label><span>Compute device</span><select value={draft.whisperDevice} onChange={(event) => update('whisperDevice', event.target.value as UserSettings['whisperDevice'])}><option value="auto">Auto detect</option><option value="webgpu">WebGPU</option><option value="wasm">WASM / CPU</option></select></label>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading"><span className="settings-icon"><ShieldCheck size={19} /></span><div><h2>Recording privacy</h2><p>Analytics and transcripts are kept with history. Audio is optional.</p></div></div>
            <label className="toggle-row">
              <span><strong>Save voice recordings</strong><small>Turn this off to save only the transcript, metrics, and coaching.</small></span>
              <input className="toggle-input" type="checkbox" checked={draft.saveRecordings} onChange={(event) => update('saveRecordings', event.target.checked)} />
            </label>
          </section>

          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="settings-save-row">
            <button className="button primary" type="submit" disabled={saving}>{saving ? <><LoaderCircle size={17} className="spin" /> Saving…</> : <><Save size={17} /> Save settings</>}</button>
            {saved && <span className="save-success"><CheckCircle2 size={16} /> Saved</span>}
          </div>
        </div>

        <aside className="settings-aside">
          <section className="settings-card sticky-card">
            <div className="settings-card-heading compact"><span className="settings-icon">{storageStatus?.kind === 'database' ? <Database size={18} /> : <HardDrive size={18} />}</span><div><h2>Storage</h2><StorageBadge /></div></div>
            <p className="storage-detail">{storageStatus?.detail}</p>
            <div className="config-hint"><code>public/app.config.json</code><span>controls browser vs database mode. Database credentials stay in the server config.</span></div>
          </section>
          <section className="settings-card account-card">
            <span className="eyebrow">Account</span>
            <h2>{user?.username}</h2>
            <p>Created {user ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(user.createdAt)) : ''}</p>
            <button className="button danger-outline full" type="button" onClick={() => { setDeleteText(''); setDeleteOpen(true); }}><Trash2 size={16} /> Delete account</button>
          </section>
        </aside>
      </form>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete your VoxLab account?"
        description={<><p>This permanently removes your account, practice history, analytics, and saved recordings.</p><label className="confirm-input-label"><span>Type <strong>{user?.username}</strong> to confirm</span><input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} autoFocus /></label></>}
        confirmLabel="Delete everything"
        busy={deleting}
        confirmDisabled={deleteText !== user?.username}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
