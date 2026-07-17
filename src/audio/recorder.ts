import pcmCaptureWorkletUrl from './pcmCapture.worklet.ts?worker&url';

export interface RecordingResult {
  blob: Blob;
  pcm: Float32Array;
  sampleRate: number;
  durationSeconds: number;
  mimeType: string;
}

export interface RecorderCallbacks {
  onLevel?: (level: number, waveform: Float32Array) => void;
}

function supportedMimeType(): string | undefined {
  const choices = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/webm',
  ];
  return choices.find((type) => MediaRecorder.isTypeSupported(type));
}

async function decodeRecordedBlob(
  blob: Blob,
  audioContext: AudioContext,
): Promise<{ pcm: Float32Array; sampleRate: number } | null> {
  if (!blob.size) return null;
  try {
    const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
    if (!decoded.length || !decoded.numberOfChannels) return null;
    let strongestChannel = decoded.getChannelData(0);
    let strongestEnergy = -1;
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const values = decoded.getChannelData(channel);
      let energy = 0;
      for (const value of values) if (Number.isFinite(value)) energy += value * value;
      if (energy > strongestEnergy) {
        strongestEnergy = energy;
        strongestChannel = values;
      }
    }
    // A rare anti-phase stereo input can disappear when averaged. The strongest
    // recorded microphone channel is a safer mono source for speech recognition.
    const pcm = Float32Array.from(strongestChannel, (value) => Number.isFinite(value) ? value : 0);
    return { pcm, sampleRate: decoded.sampleRate };
  } catch {
    // Some browser/codec pairs can play a MediaRecorder blob without exposing it to
    // decodeAudioData. The parallel AudioWorklet capture remains a safe fallback.
    return null;
  }
}

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private mutedOutput: GainNode | null = null;
  private animationFrame = 0;
  private chunks: Blob[] = [];
  private pcmChunks: Float32Array[] = [];
  private startedAt = 0;

  constructor(private readonly callbacks: RecorderCallbacks = {}) {}

  async start(): Promise<void> {
    if (this.mediaRecorder || this.audioContext || this.stream) {
      throw new Error('A recording is already active.');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone recording is not supported in this browser.');
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Audio recording is not supported in this browser.');
    }

    this.chunks = [];
    this.pcmChunks = [];
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });

      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.75;
      this.source.connect(this.analyser);
      await this.connectPcmCapture();

      const mimeType = supportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.startedAt = performance.now();
      this.mediaRecorder.start(1000);
      this.drawLevels();
    } catch (error) {
      await this.releaseResources();
      throw error;
    }
  }

  private async connectPcmCapture(): Promise<void> {
    if (!this.audioContext || !this.source) return;
    this.mutedOutput = this.audioContext.createGain();
    this.mutedOutput.gain.value = 0;
    this.mutedOutput.connect(this.audioContext.destination);

    if (this.audioContext.audioWorklet) {
      try {
        await this.audioContext.audioWorklet.addModule(pcmCaptureWorkletUrl);
        this.worklet = new AudioWorkletNode(this.audioContext, 'speakeasy-pcm-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount: 1,
          channelCountMode: 'explicit',
        });
        this.worklet.port.onmessage = (event: MessageEvent<{ type?: string; pcm?: Float32Array }>) => {
          if (event.data?.type === 'pcm' && event.data.pcm?.length) this.pcmChunks.push(event.data.pcm);
        };
        this.source.connect(this.worklet);
        this.worklet.connect(this.mutedOutput);
        return;
      } catch {
        this.worklet?.disconnect();
        this.worklet = null;
      }
    }

    // Compatibility fallback for browsers without AudioWorklet.
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      this.pcmChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.mutedOutput);
  }

  private drawLevels = () => {
    if (!this.analyser) return;
    const waveform = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(waveform);
    let sum = 0;
    for (const value of waveform) sum += value * value;
    this.callbacks.onLevel?.(Math.sqrt(sum / waveform.length), waveform);
    this.animationFrame = requestAnimationFrame(this.drawLevels);
  };

  async stop(): Promise<RecordingResult> {
    if (!this.mediaRecorder || !this.audioContext) throw new Error('No recording is active.');
    const recorder = this.mediaRecorder;
    let sampleRate = this.audioContext.sampleRate;
    const elapsedSeconds = Math.max(0, (performance.now() - this.startedAt) / 1000);

    try {
      await new Promise<void>((resolve, reject) => {
        if (recorder.state === 'inactive') {
          resolve();
          return;
        }
        recorder.addEventListener('stop', () => resolve(), { once: true });
        recorder.addEventListener('error', () => reject(new Error('The browser could not finish the recording.')), { once: true });
        recorder.stop();
      });
    } catch (error) {
      await this.releaseResources();
      throw error;
    }

    cancelAnimationFrame(this.animationFrame);
    if (this.worklet && this.source) {
      this.source.disconnect(this.worklet);
      await this.flushWorklet();
    }

    const length = this.pcmChunks.reduce((total, chunk) => total + chunk.length, 0);
    let pcm = new Float32Array(length);
    let offset = 0;
    this.pcmChunks.forEach((chunk) => {
      pcm.set(chunk, offset);
      offset += chunk.length;
    });

    const mimeType = recorder.mimeType || this.chunks[0]?.type || 'audio/webm';
    const blob = new Blob(this.chunks, { type: mimeType });
    const decodedRecording = await decodeRecordedBlob(blob, this.audioContext);
    if (decodedRecording) {
      // Use the same encoded recording the user can replay as the source for analysis.
      // This avoids an audible blob and an empty parallel PCM capture disagreeing.
      pcm = decodedRecording.pcm;
      sampleRate = decodedRecording.sampleRate;
    }
    const result = {
      blob,
      pcm,
      sampleRate,
      durationSeconds: pcm.length ? pcm.length / sampleRate : elapsedSeconds,
      mimeType,
    };
    await this.releaseResources();
    return result;
  }

  private async flushWorklet(): Promise<void> {
    const worklet = this.worklet;
    if (!worklet) return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        worklet.port.removeEventListener('message', onMessage);
        resolve();
      };
      const onMessage = (event: MessageEvent<{ type?: string }>) => {
        if (event.data?.type !== 'flushed') return;
        finish();
      };
      const timeout = setTimeout(finish, 250);
      worklet.port.addEventListener('message', onMessage);
      worklet.port.postMessage({ type: 'flush' });
    });
  }

  private async releaseResources(): Promise<void> {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.worklet?.disconnect();
    this.processor?.disconnect();
    this.mutedOutput?.disconnect();
    if (this.audioContext && this.audioContext.state !== 'closed') await this.audioContext.close();
    this.mediaRecorder = null;
    this.stream = null;
    this.audioContext = null;
    this.source = null;
    this.worklet = null;
    this.processor = null;
    this.analyser = null;
    this.mutedOutput = null;
    this.startedAt = 0;
  }

  cancel(): void {
    if (this.mediaRecorder?.state && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    void this.releaseResources();
  }
}

export function resampleTo16Khz(input: Float32Array, sourceRate: number): Float32Array {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0) throw new RangeError('The source sample rate must be positive.');
  if (sourceRate === 16_000) return input;
  if (!input.length) return new Float32Array();
  const ratio = sourceRate / 16_000;
  const output = new Float32Array(Math.max(1, Math.round(input.length / ratio)));

  // Area averaging acts as a simple anti-alias filter for the usual 44.1/48 kHz
  // microphone input. Linear interpolation is retained for the less common upsample path.
  if (ratio > 1) {
    for (let index = 0; index < output.length; index += 1) {
      const start = index * ratio;
      const end = Math.min(input.length, (index + 1) * ratio);
      const first = Math.floor(start);
      const last = Math.min(input.length - 1, Math.ceil(end) - 1);
      let weightedSum = 0;
      let totalWeight = 0;
      for (let sourceIndex = first; sourceIndex <= last; sourceIndex += 1) {
        const weight = Math.max(0, Math.min(end, sourceIndex + 1) - Math.max(start, sourceIndex));
        weightedSum += input[sourceIndex] * weight;
        totalWeight += weight;
      }
      output[index] = totalWeight ? weightedSum / totalWeight : 0;
    }
    return output;
  }

  for (let index = 0; index < output.length; index += 1) {
    const position = Math.min(input.length - 1, index * ratio);
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const mix = position - left;
    output[index] = input[left] * (1 - mix) + input[right] * mix;
  }
  return output;
}
