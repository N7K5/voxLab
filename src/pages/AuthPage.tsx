import {
  Activity,
  ArrowRight,
  AudioWaveform,
  BrainCircuit,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Brand } from '../components/Brand';
import { StorageBadge } from '../components/StorageBadge';
import { useApp } from '../context/AppContext';

type AuthMode = 'login' | 'signup';

export function AuthPage() {
  const { signUp, logIn, storageStatus } = useApp();
  const [mode, setMode] = useState<AuthMode>('signup');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setPassword('');
    setConfirmPassword('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') await signUp(username, password);
      else await logIn(username, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not continue.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-story-inner">
          <Brand />
          <div className="auth-kicker"><Activity size={14} /> Private practice. Measurable progress.</div>
          <h1>Make your next point <em>land.</em></h1>
          <p className="auth-lede">Record a short argument, see what your voice is doing, and leave with one concrete thing to improve.</p>

          <div className="auth-preview" aria-hidden="true">
            <div className="preview-topline"><span>Live delivery</span><strong>01:00</strong></div>
            <div className="preview-wave">
              {[18, 44, 62, 31, 76, 52, 89, 35, 71, 48, 65, 28, 84, 57, 40, 72, 51, 32].map((height, index) => (
                <span key={index} style={{ height: `${height}%`, animationDelay: `${index * 45}ms` }} />
              ))}
            </div>
            <div className="preview-scores">
              <span><small>Pacing</small><strong>82</strong></span>
              <span><small>Structure</small><strong>76</strong></span>
              <span><small>Delivery</small><strong>88</strong></span>
            </div>
          </div>

          <div className="auth-points">
            <span><AudioWaveform size={17} /> Acoustic pause, pitch, and energy signals</span>
            <span><BrainCircuit size={17} /> Browser coaching or your Ollama model</span>
            <span><ShieldCheck size={17} /> Browser storage unless a database is configured</span>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand"><Brand compact /></div>
          <StorageBadge />
          <div className="auth-heading">
            <span className="eyebrow">{mode === 'signup' ? 'Start practicing' : 'Welcome back'}</span>
            <h2>{mode === 'signup' ? 'Create your account' : 'Sign in to VoxLab'}</h2>
            <p>{mode === 'signup' ? 'No email or verification needed.' : 'Your practice history is waiting.'}</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')}>Create account</button>
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>Sign in</button>
          </div>

          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label>
              <span>Username</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} autoComplete="username" placeholder="Your practice name" required />
            </label>
            <label>
              <span>Password</span>
              <div className="password-input">
                <LockKeyhole size={16} />
                <input value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="At least 8 characters" required />
                <button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {mode === 'signup' && (
              <label>
                <span>Confirm password</span>
                <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Repeat your password" required />
              </label>
            )}

            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button primary auth-submit" type="submit" disabled={busy}>
              {busy ? <><LoaderCircle size={17} className="spin" /> Please wait…</> : <>{mode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></>}
            </button>
          </form>

          {mode === 'signup' && (
            <div className="auth-fineprint">
              <Check size={14} />
              <span>{storageStatus?.kind === 'database' ? 'Your credentials are handled by your configured server.' : 'Your password is salted and hashed before it is saved in this browser.'}</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
