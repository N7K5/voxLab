import { Pause, Play, RotateCcw } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

export interface AudioPlayerProps {
  src: string;
  fallbackDuration: number;
  compact?: boolean;
  className?: string;
}

type ProgressStyle = CSSProperties & { '--audio-progress': string };

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function mediaErrorMessage(mediaError: MediaError | null): string {
  switch (mediaError?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Audio loading was interrupted.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'The recording could not be loaded from storage.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'This browser could not decode the recording.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'This recording format is not supported by this browser.';
    default:
      return 'The recording could not be played.';
  }
}

export function AudioPlayer({
  src,
  fallbackDuration,
  compact = false,
  className = '',
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const durationProbeRef = useRef<{ active: boolean; restoreTime: number }>({ active: false, restoreTime: 0 });
  const durationProbeTimerRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(() => positiveFinite(fallbackDuration) ? fallbackDuration : 0);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const cancelAnimationFrameLoop = () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  };

  const clearDurationProbeTimer = () => {
    if (durationProbeTimerRef.current !== null) window.clearTimeout(durationProbeTimerRef.current);
    durationProbeTimerRef.current = null;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const fallback = positiveFinite(fallbackDuration) ? fallbackDuration : 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(fallback);
    setError(src ? null : 'No recording source is available.');
    durationProbeRef.current = { active: false, restoreTime: 0 };
    clearDurationProbeTimer();

    const syncCurrentTime = () => {
      if (durationProbeRef.current.active) return;
      const nextTime = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
      setCurrentTime(nextTime);
      if (!positiveFinite(audio.duration) && nextTime > fallback) setDuration(nextTime);
    };

    const finishDurationProbe = (): boolean => {
      if (!positiveFinite(audio.duration)) return false;
      const resolvedDuration = audio.duration;
      setDuration(resolvedDuration);
      if (durationProbeRef.current.active) {
        const restoreTime = clamp(durationProbeRef.current.restoreTime, 0, resolvedDuration);
        durationProbeRef.current.active = false;
        clearDurationProbeTimer();
        try {
          audio.currentTime = restoreTime;
        } catch {
          // Some engines reject seeking until a seekable range exists; playback can still begin at zero.
        }
        setCurrentTime(restoreTime);
      }
      return true;
    };

    const probeIndefiniteBlobDuration = () => {
      if (finishDurationProbe() || durationProbeRef.current.active || audio.readyState < HTMLMediaElement.HAVE_METADATA) return;
      // MediaRecorder blobs can report Infinity/NaN until the media element seeks once.
      durationProbeRef.current = {
        active: true,
        restoreTime: Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0,
      };
      try {
        audio.currentTime = Number.MAX_SAFE_INTEGER;
        if (finishDurationProbe()) return;
      } catch {
        durationProbeRef.current.active = false;
        return;
      }

      durationProbeTimerRef.current = window.setTimeout(() => {
        if (!durationProbeRef.current.active) return;
        const restoreTime = durationProbeRef.current.restoreTime;
        durationProbeRef.current.active = false;
        try {
          audio.currentTime = restoreTime;
        } catch {
          // The fallback duration still keeps the controls usable when seeking is unavailable.
        }
        setCurrentTime(restoreTime);
      }, 750);
    };

    const syncDuration = () => {
      if (!finishDurationProbe()) {
        setDuration((current) => Math.max(current, fallback));
        probeIndefiniteBlobDuration();
      }
    };

    const handlePlay = () => {
      setError(null);
      setIsPlaying(true);
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      finishDurationProbe();
      const finalTime = positiveFinite(audio.duration) ? audio.duration : Math.max(audio.currentTime, fallback);
      setCurrentTime(finalTime);
      setDuration((current) => Math.max(current, finalTime));
    };
    const handleError = () => {
      setIsPlaying(false);
      setError(mediaErrorMessage(audio.error));
    };
    const handleCanPlay = () => {
      setError(null);
      syncDuration();
    };
    const handleTimeUpdate = () => {
      if (durationProbeRef.current.active) {
        finishDurationProbe();
        return;
      }
      syncCurrentTime();
    };

    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('loadeddata', syncDuration);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('seeking', syncCurrentTime);
    audio.addEventListener('seeked', syncCurrentTime);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    if (src) audio.load();

    return () => {
      cancelAnimationFrameLoop();
      clearDurationProbeTimer();
      durationProbeRef.current.active = false;
      audio.pause();
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('loadeddata', syncDuration);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('seeking', syncCurrentTime);
      audio.removeEventListener('seeked', syncCurrentTime);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [src, fallbackDuration]);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrameLoop();
      return;
    }

    const update = () => {
      const audio = audioRef.current;
      if (audio && !durationProbeRef.current.active) {
        const nextTime = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
        setCurrentTime(nextTime);
        if (!positiveFinite(audio.duration) && nextTime > duration) setDuration(nextTime);
      }
      animationFrameRef.current = requestAnimationFrame(update);
    };
    animationFrameRef.current = requestAnimationFrame(update);
    return cancelAnimationFrameLoop;
  }, [isPlaying, duration]);

  const effectiveDuration = Math.max(0, duration, currentTime);
  const boundedCurrentTime = effectiveDuration > 0 ? clamp(currentTime, 0, effectiveDuration) : 0;
  const progress = effectiveDuration > 0 ? (boundedCurrentTime / effectiveDuration) * 100 : 0;
  const progressStyle = useMemo<ProgressStyle>(() => ({
    '--audio-progress': `${clamp(progress, 0, 100)}%`,
  }), [progress]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || error || !src) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (effectiveDuration > 0 && audio.currentTime >= effectiveDuration - 0.05) {
      audio.currentTime = 0;
      setCurrentTime(0);
    }
    try {
      await audio.play();
    } catch (playError) {
      setIsPlaying(false);
      setError(playError instanceof Error ? playError.message : 'Playback could not start.');
    }
  };

  const restart = () => {
    const audio = audioRef.current;
    if (!audio || error || !src) return;
    try {
      audio.currentTime = 0;
      setCurrentTime(0);
    } catch {
      setError('This recording is not seekable yet.');
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || error || effectiveDuration <= 0) return;
    const nextTime = clamp(value, 0, effectiveDuration);
    try {
      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
    } catch {
      setError('This recording is not seekable yet.');
    }
  };

  const rootClassName = [
    'audio-player',
    compact ? 'audio-player--compact' : '',
    error ? 'audio-player--error' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} data-state={error ? 'error' : isPlaying ? 'playing' : 'paused'}>
      <audio ref={audioRef} className="audio-player__media" src={src || undefined} preload="metadata" hidden />
      <div className="audio-player__controls">
        <button
          className="audio-player__button audio-player__button--toggle icon-button"
          type="button"
          onClick={() => void togglePlayback()}
          disabled={!src || Boolean(error)}
          aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
        >
          {isPlaying ? <Pause size={compact ? 15 : 17} fill="currentColor" /> : <Play size={compact ? 15 : 17} fill="currentColor" />}
        </button>

        <span className="audio-player__time audio-player__time--current" aria-label={`Current time ${formatTime(boundedCurrentTime)}`}>
          {formatTime(boundedCurrentTime)}
        </span>
        <input
          className="audio-player__seek"
          type="range"
          min={0}
          max={effectiveDuration || 0}
          step={0.01}
          value={boundedCurrentTime}
          onChange={(event) => seek(Number(event.currentTarget.value))}
          disabled={!src || Boolean(error) || effectiveDuration <= 0}
          aria-label="Seek recording"
          aria-valuetext={`${formatTime(boundedCurrentTime)} of ${formatTime(effectiveDuration)}`}
          aria-describedby={error ? errorId : undefined}
          style={progressStyle}
        />
        <span className="audio-player__time audio-player__time--duration" aria-label={`Duration ${formatTime(effectiveDuration)}`}>
          {formatTime(effectiveDuration)}
        </span>

        <button
          className="audio-player__button audio-player__button--restart icon-button"
          type="button"
          onClick={restart}
          disabled={!src || Boolean(error) || boundedCurrentTime <= 0}
          aria-label="Restart recording"
          title="Restart"
        >
          <RotateCcw size={compact ? 14 : 16} />
        </button>
      </div>
      {error && <p id={errorId} className="audio-player__error" role="alert">{error}</p>}
    </div>
  );
}
