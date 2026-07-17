import { Play, Square, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoachFeedback } from '../types';

const VOICE_KEY = 'voxlab.coachVoice';

function coachingScript(feedback: CoachFeedback): string {
  const weakness = feedback.weaknesses?.[0];
  const improvement = feedback.improvements[0];
  const focus = weakness
    ? `${weakness.title}. ${weakness.evidence} ${weakness.whyItMatters} To improve it, ${weakness.howToImprove}`
    : improvement
      ? `${improvement.title}. ${improvement.detail} Try this: ${improvement.drill}`
      : 'Choose one measured weakness and repeat the speech with a single change.';
  return `Here is your VoxLab coaching note. ${feedback.summary} Your first priority is: ${focus}`;
}

export function SpokenCoach({ feedback }: { feedback: CoachFeedback }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState(() => localStorage.getItem(VOICE_KEY) ?? '');
  const [rate, setRate] = useState(0.95);
  const [playing, setPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const script = useMemo(() => coachingScript(feedback), [feedback]);

  useEffect(() => {
    if (!supported) return undefined;
    const loadVoices = () => {
      const localVoices = window.speechSynthesis.getVoices().filter((voice) => voice.localService);
      setVoices(localVoices);
      setVoiceUri((current) => localVoices.some((voice) => voice.voiceURI === current)
        ? current
        : localVoices[0]?.voiceURI ?? '');
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
    };
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setPlaying(false);
  }, [script, supported]);

  const stop = () => {
    if (supported) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setPlaying(false);
  };

  const play = () => {
    if (!supported || !voiceUri) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(script);
    utterance.voice = voices.find((voice) => voice.voiceURI === voiceUri) ?? null;
    utterance.rate = rate;
    utterance.onend = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setPlaying(false);
      }
    };
    utterance.onerror = utterance.onend;
    utteranceRef.current = utterance;
    setPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  if (!supported) {
    return <p className="spoken-coach-unavailable">Spoken coaching is not supported by this browser.</p>;
  }

  if (!voices.length) {
    return <p className="spoken-coach-unavailable">No installed on-device speech voice was reported by this browser.</p>;
  }

  return (
    <div className="spoken-coach">
      <p>{script}</p>
      <div className="spoken-coach-controls">
        <label><span>On-device voice</span><select value={voiceUri} onChange={(event) => { setVoiceUri(event.target.value); localStorage.setItem(VOICE_KEY, event.target.value); stop(); }}>{voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select></label>
        <label><span>Speed · {rate.toFixed(2)}×</span><input type="range" min="0.75" max="1.2" step="0.05" value={rate} onChange={(event) => { setRate(Number(event.target.value)); stop(); }} /></label>
        {playing
          ? <button className="button secondary" type="button" onClick={stop}><Square size={16} fill="currentColor" /> Stop</button>
          : <button className="button primary" type="button" onClick={play}><Play size={17} fill="currentColor" /> Play coaching</button>}
      </div>
      <span className="spoken-coach-note"><Volume2 size={13} /> Uses an installed local system voice. No generated coaching audio is saved.</span>
    </div>
  );
}
