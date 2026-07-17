// AudioWorklet globals are intentionally not part of TypeScript's regular DOM lib because
// worklet modules run in their own global scope.
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(inputs: Float32Array[][]): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

const CHUNK_SIZE = 4096;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  private chunk = new Float32Array(CHUNK_SIZE);
  private length = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type !== 'flush') return;
      this.emitChunk();
      this.port.postMessage({ type: 'flushed' });
    };
  }

  private emitChunk(): void {
    if (!this.length) return;
    const pcm = this.chunk.slice(0, this.length);
    this.port.postMessage({ type: 'pcm', pcm }, [pcm.buffer]);
    this.length = 0;
  }

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0];
    if (!channels?.length || !channels[0]?.length) return true;

    const frameLength = channels[0].length;
    for (let frame = 0; frame < frameLength; frame += 1) {
      let sample = 0;
      for (const channel of channels) sample += channel[frame] ?? 0;
      this.chunk[this.length] = sample / channels.length;
      this.length += 1;
      if (this.length === this.chunk.length) this.emitChunk();
    }
    return true;
  }
}

registerProcessor('speakeasy-pcm-capture', PcmCaptureProcessor);

export {};
