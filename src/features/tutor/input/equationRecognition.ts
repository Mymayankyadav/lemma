/**
 * N221 · the pure parts of handwritten equation recognition (see equationModel.ts): the drawing as the model's input
 * tensor, greedy decoding, the byte-level tokenizer and a light clean-up of the LaTeX it writes.
 */
import {EQUATION_MODEL} from './equationModel';

/** RGBA pixels of a size × size image as the model's CHW float tensor, rescaled and normalised (mean 0.5, std 0.5). */
export function pixelsToTensor(rgba: Uint8ClampedArray, size: number = EQUATION_MODEL.inputSize): Float32Array {
  const plane = size * size;
  if (rgba.length !== plane * 4) throw new Error('Unexpected image size');
  const tensor = new Float32Array(plane * 3);
  for (let pixel = 0; pixel < plane; pixel++) {
    for (let channel = 0; channel < 3; channel++) tensor[channel * plane + pixel] = rgba[pixel * 4 + channel] / 127.5 - 1;
  }
  return tensor;
}

/** The tokenizer's vocabulary as id → token, from tokenizer.json (BPE vocab and added special tokens). */
export function vocabularyFrom(tokenizer: unknown): string[] {
  const model = (tokenizer as {model?: {vocab?: Record<string, number>}})?.model;
  const added = (tokenizer as {added_tokens?: {id: number; content: string}[]})?.added_tokens ?? [];
  if (!model?.vocab) throw new Error('Invalid tokenizer');
  const vocabulary: string[] = [];
  for (const [token, id] of Object.entries(model.vocab)) vocabulary[id] = token;
  for (const {id, content} of added) vocabulary[id] = content;
  if (vocabulary.length !== EQUATION_MODEL.vocabSize) throw new Error('Unexpected tokenizer size');
  return vocabulary;
}

/** GPT-2's byte-level alphabet: the printable character standing for each byte. */
const BYTES = (() => {
  const bytes = [...Array(94).keys()].map(i => i + 33).concat([...Array(12).keys()].map(i => i + 161), [...Array(82).keys()].map(i => i + 174));
  const table = new Map<string, number>();
  let extra = 0;
  for (let byte = 0; byte < 256; byte++) {
    table.set(String.fromCharCode(bytes.includes(byte) ? byte : 256 + extra++), byte);
  }
  return table;
})();

/** Token ids to text: special tokens dropped, byte-level characters back to UTF-8. */
export function decodeTokens(ids: readonly number[], vocabulary: readonly string[]): string {
  const text = ids.filter(id => id >= EQUATION_MODEL.specialTokens).map(id => vocabulary[id] ?? '').join('');
  return new TextDecoder().decode(Uint8Array.from([...text].map(char => BYTES.get(char) ?? 63)));
}

const UPRIGHT = /\\(?:mathrm|mathbf|boldsymbol|mathit|textrm|text)\s*\{([A-Za-z0-9+\-=<>(),.\s]*)\}/gu;

/**
 * The model writes LaTeX with a space between tokens (x ^ { 2 }). Keep a space only where LaTeX needs it, after a
 * command before a letter (\int f), drop upright or bold wrappers a learner's handwriting does not mean, and read a
 * × that starts an expression or carries an exponent as the letter x.
 */
export function cleanLatex(latex: string): string {
  let text = latex.replace(/\s+/gu, ' ').trim();
  for (let i = 0; i < 3; i++) text = text.replace(UPRIGHT, (_, inner: string) => inner);
  // A lone backslash is LaTeX's explicit space (\ ); it only spaces the output, so it goes.
  const parts = text.split(' ').filter(part => part !== '\\');
  const joined = parts.reduce((out, part) => out + (/\\[A-Za-z]+$/u.test(out) && /^[A-Za-z]/u.test(part) ? ' ' : '') + part, '');
  // A handwritten x drawn as two strokes reads as ×; a times sign cannot start an expression or take an exponent.
  return joined.replace(/(^|[=+\-(,<>{]|\\(?:le|ge|ne|in|to)\b)\\times(?=\s*[\^_]|\s*$)|^\\times/gu,
    (_, before: string | undefined) => (before ?? '') + 'x');
}

/** Greedy decoding: `step` returns the logits for the next token after `ids`. */
export async function greedyDecode(step: (ids: readonly number[]) => Promise<Float32Array>,
  maxTokens: number = EQUATION_MODEL.maxTokens): Promise<number[]> {
  const ids: number[] = [EQUATION_MODEL.startToken];
  while (ids.length <= maxTokens) {
    const logits = await step(ids);
    let best = 0;
    for (let index = 1; index < logits.length; index++) if (logits[index] > logits[best]) best = index;
    if (best === EQUATION_MODEL.endToken) break;
    ids.push(best);
  }
  return ids.slice(1);
}
