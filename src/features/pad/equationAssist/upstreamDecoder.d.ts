import type {InferenceSession, Tensor} from 'onnxruntime-web/wasm';

export interface Vocabulary {
  input_chars: string[];
  output_tokens: string[];
  eos_id: number;
  max_input: number;
  max_output: number;
}

export class OrtStepper {
  constructor(runtime: {Tensor: typeof Tensor}, encoder: InferenceSession, decoder: InferenceSession);
}

export function encodeInput(text: string, vocabulary: Vocabulary): number[];
export function normalizeLatex(latex: string): string;
export interface SourceConstraint {
  transitions(state: number): Int32Array;
}
export function beamSearch(stepper: OrtStepper, input: number[], vocabulary: Vocabulary, options: {
  k: number;
  maxLen: number;
  shouldAbort?: () => boolean;
  source?: SourceConstraint;
  finishKey?: (latex: string) => string | null;
  nReturn?: number;
  maxStepsAfterFinish?: number;
}): Promise<{latex: string; score: number}[] | null>;
