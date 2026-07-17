import { Headphones, Play, ShieldAlert, Square, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  coachingSections,
  defaultSpokenCoachPreferences,
  languageLabel,
  normalizeSpokenCoachPreferences,
  previewText,
  rankSpeechVoices,
  segmentCoachingSections,
  speechLocale,
  spokenCoachPreferencesKey,
  type SpeechSegment,
  type SpokenCoachPreferences,
} from '../lib/spokenCoach';
import type { CoachFeedback, SpeechLanguage } from '../types';

const LEGACY_VOICE_KEY = 'voxlab.coachVoice';

type PlaybackMode = 'idle' | 'preview' | 'coaching';

function readPreferences(language: SpeechLanguage): SpokenCoachPreferences {
  const defaults = defaultSpokenCoachPreferences(language);
  if (typeof window === 'undefined') return defaults;
  try {
    const stored = window.localStorage.getItem(spokenCoachPreferencesKey(language));
    if (stored) return normalizeSpokenCoachPreferences(JSON.parse(stored), language);
    const legacyVoice = window.localStorage.getItem(LEGACY_VOICE_KEY);
    return legacyVoice ? { ...defaults, voiceUri: legacyVoice } : defaults;
  } catch {
    return defaults;
  }
}

function writePreferences(language: SpeechLanguage, preferences: SpokenCoachPreferences): void {
  try {
    window.localStorage.setItem(spokenCoachPreferencesKey(language), JSON.stringify(preferences));
  } catch {
    // Speech still works when storage is disabled; only the preference will be session-local.
  }
}

function playbackErrorMessage(language: SpeechLanguage, code: string): string {
  return language === 'bn'
    ? `কণ্ঠস্বর চালু করা যায়নি (${code})। অন্য একটি কণ্ঠস্বর চেষ্টা করুন।`
    : `The voice could not speak this coaching (${code}). Try another voice.`;
}

export function SpokenCoach({
  feedback,
  language,
}: {
  feedback: CoachFeedback;
  language: SpeechLanguage;
}) {
  const supported = typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof SpeechSynthesisUtterance !== 'undefined';
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [preferences, setPreferences] = useState<SpokenCoachPreferences>(() => readPreferences(language));
  const [playback, setPlayback] = useState<PlaybackMode>('idle');
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);

  const sections = useMemo(() => coachingSections(feedback, language), [feedback, language]);
  const script = useMemo(() => sections.join(' '), [sections]);
  const segments = useMemo(() => segmentCoachingSections(sections, language), [language, sections]);
  const voices = useMemo(() => rankSpeechVoices(
    allVoices,
    language,
    preferences.voiceUri,
    preferences.allowNetworkVoices,
  ), [allVoices, language, preferences.allowNetworkVoices, preferences.voiceUri]);
  const matchingVoicesIncludingNetwork = useMemo(
    () => rankSpeechVoices(allVoices, language, preferences.voiceUri, true),
    [allVoices, language, preferences.voiceUri],
  );
  const selectedVoice = voices.find((voice) => voice.voiceURI === preferences.voiceUri) ?? voices[0] ?? null;

  const cancelPlayback = useCallback(() => {
    sessionRef.current += 1;
    if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = null;
    utteranceRef.current = null;
    if (supported) window.speechSynthesis.cancel();
    setPlayback('idle');
  }, [supported]);

  useEffect(() => {
    if (!supported) return undefined;
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      setAllVoices(synth.getVoices());
      setVoicesLoaded(true);
    };
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    return () => {
      sessionRef.current += 1;
      if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
      utteranceRef.current = null;
      synth.removeEventListener('voiceschanged', loadVoices);
      synth.cancel();
    };
  }, [supported]);

  useEffect(() => {
    cancelPlayback();
    setError(null);
    setPreferences(readPreferences(language));
  }, [cancelPlayback, language]);

  useEffect(() => {
    cancelPlayback();
    setError(null);
  }, [cancelPlayback, script]);

  const updatePreferences = (patch: Partial<SpokenCoachPreferences>) => {
    cancelPlayback();
    setError(null);
    setPreferences((current) => {
      const next = normalizeSpokenCoachPreferences({ ...current, ...patch }, language);
      writePreferences(language, next);
      return next;
    });
  };

  const beginPlayback = useCallback((nextSegments: readonly SpeechSegment[], mode: Exclude<PlaybackMode, 'idle'>) => {
    if (!supported || !selectedVoice || !nextSegments.length) return;
    cancelPlayback();
    setError(null);
    const session = sessionRef.current;
    const synth = window.speechSynthesis;
    setPlayback(mode);

    const finish = () => {
      if (session !== sessionRef.current) return;
      utteranceRef.current = null;
      pauseTimerRef.current = null;
      setPlayback('idle');
    };

    const speakSegment = (index: number) => {
      if (session !== sessionRef.current) return;
      if (index >= nextSegments.length) {
        finish();
        return;
      }

      const segment = nextSegments[index];
      const utterance = new SpeechSynthesisUtterance(segment.text);
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang || speechLocale(language);
      utterance.rate = preferences.rate;
      utterance.pitch = preferences.pitch;
      utterance.volume = 1;
      utterance.onend = () => {
        if (session !== sessionRef.current || utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        if (index === nextSegments.length - 1) {
          finish();
        } else {
          pauseTimerRef.current = window.setTimeout(
            () => speakSegment(index + 1),
            segment.pauseAfterMs,
          );
        }
      };
      utterance.onerror = (event) => {
        if (session !== sessionRef.current || utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
        setPlayback('idle');
        setError(playbackErrorMessage(language, event.error || 'synthesis failed'));
      };
      utteranceRef.current = utterance;
      try {
        if (synth.paused) synth.resume();
        synth.speak(utterance);
      } catch (speakError) {
        if (session !== sessionRef.current) return;
        utteranceRef.current = null;
        setPlayback('idle');
        setError(playbackErrorMessage(
          language,
          speakError instanceof Error ? speakError.message : 'synthesis failed',
        ));
      }
    };

    speakSegment(0);
  }, [cancelPlayback, language, preferences.pitch, preferences.rate, selectedVoice, supported]);

  const preview = () => beginPlayback(
    [{ text: previewText(language), pauseAfterMs: 0 }],
    'preview',
  );

  if (!supported) {
    return <p className="spoken-coach-unavailable">Spoken coaching is not supported by this browser.</p>;
  }

  const hasNetworkAlternative = matchingVoicesIncludingNetwork.some((voice) => !voice.localService);
  const selectedIsNetworkVoice = selectedVoice ? !selectedVoice.localService : false;

  return (
    <div className="spoken-coach" data-language={language}>
      <p className="spoken-coach-script" lang={speechLocale(language)}>{script}</p>

      <div className="spoken-coach-controls">
        {voicesLoaded && selectedVoice ? (
          <label>
            <span>{languageLabel(language)} voice</span>
            <select
              value={selectedVoice.voiceURI}
              onChange={(event) => updatePreferences({ voiceUri: event.target.value })}
            >
              {voices.map((voice, index) => (
                <option key={`${voice.voiceURI}-${voice.name}`} value={voice.voiceURI}>
                  {index === 0 ? 'Recommended · ' : ''}{voice.name} · {voice.lang} · {voice.localService ? 'On-device' : 'Network'}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="spoken-coach-unavailable" role="status">
            {!voicesLoaded
              ? 'Looking for speech voices…'
              : hasNetworkAlternative && !preferences.allowNetworkVoices
                ? `No on-device ${languageLabel(language)} voice was found. You can opt in to network voices below.`
                : `No ${languageLabel(language)} voice was reported by this browser.`}
          </p>
        )}

        <div className="spoken-coach-prosody">
          <label>
            <span>Speed · {preferences.rate.toFixed(2)}×</span>
            <input
              type="range"
              min="0.8"
              max="1.1"
              step="0.05"
              value={preferences.rate}
              onChange={(event) => updatePreferences({ rate: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Pitch · {preferences.pitch.toFixed(2)}</span>
            <input
              type="range"
              min="0.9"
              max="1.1"
              step="0.05"
              value={preferences.pitch}
              onChange={(event) => updatePreferences({ pitch: Number(event.target.value) })}
            />
          </label>
        </div>

        <label className="spoken-coach-access">
          <input
            type="checkbox"
            checked={preferences.allowNetworkVoices}
            onChange={(event) => updatePreferences({ allowNetworkVoices: event.target.checked })}
          />
          <span><strong>Allow network voices</strong><small>Off by default. Your browser’s provider may receive the coaching text.</small></span>
        </label>

        {error && <p className="spoken-coach-error" role="alert"><ShieldAlert size={13} /> {error}</p>}

        <div className="spoken-coach-actions">
          {playback === 'idle' ? (
            <>
              <button className="button secondary" type="button" onClick={preview} disabled={!selectedVoice}>
                <Headphones size={16} /> Preview
              </button>
              <button className="button primary" type="button" onClick={() => beginPlayback(segments, 'coaching')} disabled={!selectedVoice || !segments.length}>
                <Play size={17} fill="currentColor" /> Play coaching
              </button>
            </>
          ) : (
            <button className="button secondary spoken-coach-stop" type="button" onClick={cancelPlayback}>
              <Square size={16} fill="currentColor" /> Stop {playback === 'preview' ? 'preview' : 'coaching'}
            </button>
          )}
        </div>
      </div>

      {(preferences.allowNetworkVoices || selectedIsNetworkVoice) && (
        <span className="spoken-coach-privacy"><ShieldAlert size={13} /> Network voices may send coaching text to your browser’s speech provider.</span>
      )}
      <span className="spoken-coach-note"><Volume2 size={13} /> {selectedVoice ? (selectedIsNetworkVoice ? 'Uses your selected browser voice.' : 'Uses an installed local system voice.') : 'Speech starts only when a compatible voice is available.'} No generated coaching audio is saved.</span>
    </div>
  );
}
