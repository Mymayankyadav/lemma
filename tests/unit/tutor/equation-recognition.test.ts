import {describe, expect, test} from 'vitest';
import {EQUATION_MODEL, EQUATION_MODEL_BYTES, equationModelUrl} from '../../../src/features/tutor/input/equationModel';
import {cleanLatex, decodeTokens, greedyDecode, pixelsToTensor, vocabularyFrom} from '../../../src/features/tutor/input/equationRecognition';

// N221 (Owner task): handwritten equation recognition in the scratch pad (Pix2Text MFR, on the device).
describe('equation recognition', () => {
  test('the model is pinned: one revision, three files with their sizes and checksums', () => {
    expect(EQUATION_MODEL.license).toBe('MIT');
    expect(EQUATION_MODEL_BYTES).toBe(87_496_990 + 30_114_937 + 39_161);
    for (const file of Object.values(EQUATION_MODEL.files)) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(equationModelUrl(file)).toBe(`https://huggingface.co/breezedeus/pix2text-mfr/resolve/${EQUATION_MODEL.revision}/${file.path}`);
    }
  });

  test('pixels become a CHW tensor normalised to -1..1', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 127.5, 255, 0, 255, 0, 255]);
    const tensor = pixelsToTensor(rgba, 2);
    expect(Array.from(tensor)).toEqual([1, -1, 1, -1, 1, -1, -1, 1, 1, -1, 0, -1].map(value => expect.closeTo(value, 2)));
    expect(() => pixelsToTensor(new Uint8ClampedArray(12), 2)).toThrow();
  });

  test('byte-level tokens decode to LaTeX; special tokens are dropped', () => {
    const vocabulary = ['<pad>', '<s>', '</s>', '<unk>', '<mask>', 'x', 'Ġ^', 'Ġ{', 'Ġ2', 'Ġ}', 'Ġ\\', 'sqrt', 'Ġ=', 'Ġ1', 'Ã©'];
    expect(decodeTokens([5, 6, 7, 8, 9, 2], vocabulary)).toBe('x ^ { 2 }');
    expect(decodeTokens([10, 11, 7, 8, 9, 12, 13], vocabulary)).toBe(' \\sqrt { 2 } = 1');
    expect(decodeTokens([14], vocabulary)).toBe('é');
  });

  test('the tokenizer must be the model\'s, 1,200 entries', () => {
    const vocab = Object.fromEntries([...Array(1195).keys()].map(index => ['t' + index, index + 5]));
    const added = ['<pad>', '<s>', '</s>', '<unk>', '<mask>'].map((content, id) => ({id, content}));
    expect(vocabularyFrom({model: {vocab}, added_tokens: added})).toHaveLength(1200);
    expect(() => vocabularyFrom({model: {vocab: {a: 0}}})).toThrow();
  });

  test('cleans the model\'s spacing and wrappers, and reads a × in an operand\'s place as x', () => {
    expect(cleanLatex('x ^ { 2 } + y ^ { 2 } = 1')).toBe('x^{2}+y^{2}=1');
    expect(cleanLatex('\\int f ( x ) \\ d x')).toBe('\\int f(x)dx');
    expect(cleanLatex('\\mathrm { a + b } = \\mathbf { c }')).toBe('a+b=c');
    expect(cleanLatex('\\frac { 1 } { 2 }')).toBe('\\frac{1}{2}');
    expect(cleanLatex('\\times ^ { 2 } + y ^ { 2 } = 1')).toBe('x^{2}+y^{2}=1');
    expect(cleanLatex('a = \\times _ { 1 }')).toBe('a=x_{1}');
    expect(cleanLatex('2 \\times 3')).toBe('2\\times3');
  });

  test('greedy decoding stops at </s> and at the token limit', async () => {
    const script = [7, 8, EQUATION_MODEL.endToken];
    const logits = (best: number) => Float32Array.from({length: EQUATION_MODEL.vocabSize}, (_, index) => index === best ? 1 : 0);
    const seen: number[][] = [];
    expect(await greedyDecode(async ids => {seen.push([...ids]); return logits(script[ids.length - 1]);})).toEqual([7, 8]);
    expect(seen[0]).toEqual([EQUATION_MODEL.startToken]);
    expect(await greedyDecode(async () => logits(9), 4)).toEqual([9, 9, 9, 9]);
  });
});
