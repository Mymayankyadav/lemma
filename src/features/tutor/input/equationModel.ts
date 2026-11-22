/**
 * N221 (Owner task) · handwritten equation recognition in the scratch pad: Pix2Text MFR (breezedeus/pix2text-mfr, MIT
 * licence), a DeiT encoder and a TrOCR-style decoder exported to ONNX, run on the device with the onnxruntime-web the
 * app already ships. The 118 MB of weights are too large for the app, so they download once, on the learner's request,
 * from the pinned Hugging Face revision, are checked against their SHA-256 and kept in the browser cache.
 */
export const EQUATION_MODEL = {
  name: 'Pix2Text MFR',
  source: 'https://huggingface.co/breezedeus/pix2text-mfr',
  license: 'MIT',
  revision: 'bea257edb2653f2ae413b084f2ac0e8299d08df0',
  files: {
    encoder: {path: 'encoder_model.onnx', bytes: 87_496_990, sha256: 'bd8d5c322792e9ec45793af5569e9748f82a3d728a9e00213dbfc56c1486f37d'},
    decoder: {path: 'decoder_model.onnx', bytes: 30_114_937, sha256: 'fd0f92d7a012f3dae41e1ac79421aea0ea888b5a66cb3f9a004e424f82f3daed'},
    tokenizer: {path: 'tokenizer.json', bytes: 39_161, sha256: '3e2ab757277d22639bec28c9d7972e352d3d1dba223051fa674002dc5ab64df3'},
  },
  /** DeiT image processor: 384 × 384 RGB, rescaled to 0–1 and normalised with mean 0.5 and std 0.5. */
  inputSize: 384,
  encoder: {input: 'pixel_values', output: 'last_hidden_state'},
  decoder: {ids: 'input_ids', hidden: 'encoder_hidden_states', output: 'logits'},
  /** Generation starts from and stops at </s> (id 2); special tokens are ids 0–4. */
  startToken: 2,
  endToken: 2,
  specialTokens: 5,
  vocabSize: 1200,
  maxTokens: 200,
} as const;

export type EquationModelFile = (typeof EQUATION_MODEL.files)[keyof typeof EQUATION_MODEL.files];
export const EQUATION_MODEL_CACHE = 'lemma-equation-model-' + EQUATION_MODEL.revision.slice(0, 12);
export const EQUATION_MODEL_BYTES = Object.values(EQUATION_MODEL.files).reduce((sum, file) => sum + file.bytes, 0);
export const equationModelUrl = (file: EquationModelFile) =>
  `https://huggingface.co/breezedeus/pix2text-mfr/resolve/${EQUATION_MODEL.revision}/${file.path}`;
