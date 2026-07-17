import { describe, expect, it } from 'vitest';
import {
  isDistilSmallEnglishModel,
  shouldTryWebGpuAutomatically,
  transcriptionModelDtype,
} from './transcriptionModel';

describe('browser transcription model loading', () => {
  it('keeps Auto on WASM for Distil Whisper Small English', () => {
    expect(isDistilSmallEnglishModel('distil-whisper/distil-small.en')).toBe(true);
    expect(shouldTryWebGpuAutomatically('distil-whisper/distil-small.en')).toBe(false);
  });

  it('uses compatible fp32 files when WebGPU is explicitly selected for Distil Whisper', () => {
    expect(transcriptionModelDtype('distil-whisper/distil-small.en', 'webgpu')).toBe('fp32');
  });

  it('preserves the existing quantization choices for other models', () => {
    expect(shouldTryWebGpuAutomatically('onnx-community/whisper-tiny.en')).toBe(true);
    expect(transcriptionModelDtype('onnx-community/whisper-tiny.en', 'webgpu')).toEqual({
      encoder_model: 'fp32',
      decoder_model_merged: 'q4',
    });
    expect(transcriptionModelDtype('onnx-community/whisper-tiny.en', 'wasm')).toBe('q8');
  });
});
