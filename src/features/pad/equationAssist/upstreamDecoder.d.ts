import type {InferenceSession, Tensor} from 'onnxruntime-web/wasm';

export interface Vocabulary {
  input_chars: string[];
  max_input: number;
  max_output: number;
}

export class OrtStepper {
  constructor(runtime: {Tensor: typeof Tensor}, encoder: InferenceSession, decoder: InferenceSession);
}

export function encodeInput(text: string, vocabulary: Vocabulary): number[];
export function normalizeLatex(latex: string): string;
export function beamSearch(stepper: OrtStepper, input: number[], vocabulary: Vocabulary, options: {
  k: number;
  maxLen: number;
  shouldAbort: () => boolean;
}): Promise<{latex: string; score: number}[] | null>;
