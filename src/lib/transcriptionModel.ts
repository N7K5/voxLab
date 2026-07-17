export type TranscriptionDevice = 'webgpu' | 'wasm';

export type TranscriptionModelDtype = 'q8' | 'fp32' | {
  encoder_model: 'fp32';
  decoder_model_merged: 'q4';
};

const DISTIL_SMALL_ENGLISH_MODEL = 'distil-whisper/distil-small.en';

export function isDistilSmallEnglishModel(model: string): boolean {
  return model.trim().toLocaleLowerCase() === DISTIL_SMALL_ENGLISH_MODEL;
}

export function shouldTryWebGpuAutomatically(model: string): boolean {
  return !isDistilSmallEnglishModel(model);
}

export function transcriptionModelDtype(
  model: string,
  device: TranscriptionDevice,
): TranscriptionModelDtype {
  if (device === 'wasm') return 'q8';

  // This repository does not publish decoder_model_merged_q4.onnx. Explicit
  // WebGPU therefore uses its compatible fp32 encoder and decoder files.
  if (isDistilSmallEnglishModel(model)) return 'fp32';

  return { encoder_model: 'fp32', decoder_model_merged: 'q4' };
}
