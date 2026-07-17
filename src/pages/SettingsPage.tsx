import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  Languages,
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
import { modelForSpeechLanguage } from '../lib/speechLanguages';
import type { AiProvider, SpeechLanguage, UserSettings } from '../types';

const speechModelDetails: Record<string, { tier: string; detail: string; heavy?: boolean }> = {
  'onnx-community/whisper-tiny.en': { tier: 'Fast', detail: 'Smallest download; best for quick practice on most devices.' },
  'onnx-community/whisper-base.en': { tier: 'Balanced', detail: 'Better recognition with a moderate first-time download.' },
  'distil-whisper/distil-small.en': { tier: 'Accurate', detail: 'A larger distilled English model; WebGPU recommended.', heavy: true },
  'onnx-community/whisper-small.en': { tier: 'Maximum', detail: 'Highest browser tier; roughly 600 MB of model weights on WebGPU plus substantial runtime memory.', heavy: true },
  'onnx-community/whisper-tiny': { tier: 'Fast multilingual', detail: 'Smallest Bengali-capable model; quickest, but less accurate with accents and noisy rooms.' },
  'onnx-community/whisper-base': { tier: 'Balanced multilingual', detail: 'A moderate Bengali-capable model for everyday devices.' },
  'onnx-community/whisper-small': { tier: 'Accurate multilingual', detail: 'Best Bengali browser tier; roughly 250 MB with quantized browser CPU weights.', heavy: true },
};

const speechModels: Record<SpeechLanguage, Array<{ value: string; label: string }>> = {
  en: [
    { value: 'onnx-community/whisper-tiny.en', label: 'Fast · Whisper Tiny English' },
    { value: 'onnx-community/whisper-base.en', label: 'Balanced · Whisper Base English' },
    { value: 'distil-whisper/distil-small.en', label: 'Accurate · Distil Whisper Small English' },
    { value: 'onnx-community/whisper-small.en', label: 'Maximum · Whisper Small English' },
  ],
  bn: [
    { value: 'onnx-community/whisper-tiny', label: 'Fast · Whisper Tiny Multilingual' },
    { value: 'onnx-community/whisper-base', label: 'Balanced · Whisper Base Multilingual' },
    { value: 'onnx-community/whisper-small', label: 'Accurate · Whisper Small Multilingual' },
  ],
};

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
  const chooseSpeechLanguage = (speechLanguage: SpeechLanguage) => {
    setDraft((current) => current ? {
      ...current,
      speechLanguage,
      whisperModel: modelForSpeechLanguage(current.whisperModel, speechLanguage),
      stanceAnalysis: speechLanguage === 'bn' ? 'signals' : current.stanceAnalysis,
    } : current);
    setSaved(false);
  };
  const selectedSpeechModel = speechModelDetails[draft.whisperModel];
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
                <p className="settings-note">Ollama receives the topic, assigned side, transcript, measured analytics, and score to write feedback. VoxLab does not send the voice recording to Ollama.</p>
                {storageStatus?.kind === 'browser' ? (
                  <p className="settings-note warning">Browser storage has no authenticated app-server proxy, so Ollama connects directly. Allow this site’s origin in Ollama (for example with <code>OLLAMA_ORIGINS</code>).</p>
                ) : !draft.ollamaViaServer ? (
                  <p className="settings-note warning">Direct browser access requires Ollama to allow this site’s origin.</p>
                ) : null}
              </div>
            )}
          </section>

          <section className="settings-card">
            <div className="settings-card-heading"><span className="settings-icon"><Languages size={19} /></span><div><h2>Practice language and transcription</h2><p>Choose the language you will speak. The first run downloads a matching Whisper model and caches it in your browser.</p></div></div>
            <div className="settings-fields two-column">
              <label><span>Default practice language</span><select value={draft.speechLanguage} onChange={(event) => chooseSpeechLanguage(event.target.value as SpeechLanguage)}><option value="en">English</option><option value="bn">বাংলা · Bengali</option></select></label>
              <label><span>Whisper model</span><select value={draft.whisperModel} onChange={(event) => update('whisperModel', event.target.value)}>{speechModels[draft.speechLanguage].map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</select></label>
              <label><span>Compute device</span><select value={draft.whisperDevice} onChange={(event) => update('whisperDevice', event.target.value as UserSettings['whisperDevice'])}><option value="auto">Auto detect</option><option value="webgpu">WebGPU</option><option value="wasm">WASM / CPU</option></select></label>
            </div>
            {selectedSpeechModel && <div className={`speech-model-note${selectedSpeechModel.heavy ? ' heavy' : ''}`}><Cpu size={15} /><div><strong>{selectedSpeechModel.tier} local model</strong><span>{selectedSpeechModel.detail} Models download on first use and are cached when the browser allows it.</span></div></div>}
            <div className="stance-analysis-setting">
              <div><strong>Argument stance checker</strong><span>Checks whether the transcript actually supports the assigned side.</span></div>
              <select value={draft.speechLanguage === 'bn' ? 'signals' : draft.stanceAnalysis} disabled={draft.speechLanguage === 'bn'} onChange={(event) => update('stanceAnalysis', event.target.value as UserSettings['stanceAnalysis'])}><option value="semantic">Semantic local model · recommended</option><option value="signals">Fast phrase signals · no extra model</option></select>
            </div>
            <p className="settings-note">{draft.speechLanguage === 'bn' ? 'Bengali currently uses local Bengali phrase and topic signals for stance. Explicitly saying পক্ষে or বিপক্ষে can improve alignment detection; the English semantic model is not run on Bengali.' : 'The semantic option uses an English NLI model in this browser (about 100 MB on first use). It is much better at opposite-side detection, but mixed rebuttals, sarcasm, and transcription mistakes can still confuse it.'}</p>
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
