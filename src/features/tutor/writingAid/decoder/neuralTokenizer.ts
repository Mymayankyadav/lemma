const RESERVED = {pad: 0, bos: 1, eos: 2, question: 3, aids: 4, draft: 5} as const;
const OFFSET = 6;
const MERGE_START = 262;
const CHUNK = /\\[A-Za-z]+|[\p{L}\p{M}]+|[\p{N}]+|\s+|[^]/gu;

export interface NeuralTokenizer {
  readonly size: number;
  encode(text: string): number[];
  piece(id: number): string;
}

export function readNeuralTokenizer(value: unknown): NeuralTokenizer {
  const data = value as {version?: unknown; algorithm?: unknown; byteOffset?: unknown; reserved?: Record<string, unknown>; merges?: unknown};
  if (!data || data.version !== 1 || data.algorithm !== 'utf8-bpe' || data.byteOffset !== OFFSET ||
      !data.reserved || Object.entries(RESERVED).some(([role, id]) => data.reserved?.[role] !== id) ||
      !Array.isArray(data.merges) || data.merges.length > 16384 - MERGE_START) throw new Error('Bad typeahead tokenizer');
  const ranks = new Map<string, number>();
  const pieces = Array.from({length: 256}, (_, i) => Uint8Array.of(i));
  for (const [index, merge] of data.merges.entries()) {
    const id = MERGE_START + index;
    if (!Array.isArray(merge) || merge.length !== 2 ||
        merge.some(piece => !Number.isInteger(piece) || piece < OFFSET || piece >= id)) throw new Error('Bad tokenizer merge');
    const key = merge.join(',');
    if (ranks.has(key)) throw new Error('Repeated tokenizer merge');
    const [left, right] = merge.map(piece => pieces[piece - OFFSET]);
    if (left.length + right.length > 512) throw new Error('Overlong tokenizer piece');
    const bytes = new Uint8Array(left.length + right.length);
    bytes.set(left); bytes.set(right, left.length);
    pieces.push(bytes);
    ranks.set(key, id);
  }
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true});
  return {
    size: OFFSET + pieces.length,
    piece(id) {
      const bytes = pieces[id - OFFSET];
      try {return bytes ? decoder.decode(bytes) : '';} catch {return '';}
    },
    encode(text) {
      const out: number[] = [];
      for (const match of text.matchAll(CHUNK)) {
        const tokens = Array.from(encoder.encode(match[0]), byte => byte + OFFSET);
        for (;;) {
          let lowest = Infinity, at = -1;
          for (let i = 0; i + 1 < tokens.length; i++) {
            const rank = ranks.get(tokens[i] + ',' + tokens[i + 1]);
            if (rank !== undefined && rank < lowest) {lowest = rank; at = i;}
          }
          if (at < 0) break;
          // Merge every nonoverlapping instance of the selected pair. Revisit
          // ranks after this pass, matching training's BPE tokenizer.
          const left = tokens[at], right = tokens[at + 1];
          for (let i = at; i + 1 < tokens.length; i++) {
            if (tokens[i] === left && tokens[i + 1] === right) tokens.splice(i, 2, lowest);
          }
        }
        out.push(...tokens);
      }
      return out;
    },
  };
}

export interface NeuralPrompt {
  readonly question: string;
  readonly aids: string;
  readonly draft: string;
}

export function promptIds(tokenizer: NeuralTokenizer, prompt: NeuralPrompt, capacity: number): number[] {
  const metaBudget = Math.floor(capacity / 4);
  const question = tokenizer.encode(prompt.question.slice(0, 4096)).slice(0, metaBudget - 1);
  const aids = tokenizer.encode(prompt.aids.slice(0, 4096)).slice(0, metaBudget - 1);
  const draft = tokenizer.encode(prompt.draft.slice(-8192)).slice(-(capacity - 4 - question.length - aids.length));
  return [RESERVED.bos, RESERVED.question, ...question, RESERVED.aids, ...aids, RESERVED.draft, ...draft];
}

/** BPE can rewrite a partially typed chunk. Score whole candidates at a common preceding boundary. */
export function neuralWordPrompt(prompt: NeuralPrompt, prefix: string): NeuralPrompt {
  return prefix && prompt.draft.endsWith(prefix) ? {...prompt, draft: prompt.draft.slice(0, -prefix.length)} : prompt;
}

export interface WordTrie {
  readonly edges: Map<number, WordTrie>;
  readonly words: string[];
}
export function wordTrie(tokenizer: NeuralTokenizer, words: readonly string[], prefix: string, remaining: number): WordTrie {
  const root: WordTrie = {edges: new Map(), words: []};
  for (const word of new Set(words)) {
    if (!/^[\p{L}\p{M}]+(?:['’\p{Pd}][\p{L}\p{M}]+)*$/u.test(word) ||
        !word.toLowerCase().startsWith(prefix.toLowerCase()) || word.toLowerCase() === prefix.toLowerCase()) continue;
    const path = tokenizer.encode(word);
    if (!path.length || path.length > remaining) continue;
    let node = root;
    for (const token of path) {
      let child = node.edges.get(token);
      if (!child) {child = {edges: new Map(), words: []}; node.edges.set(token, child);}
      node = child;
    }
    node.words.push(word);
  }
  return root;
}


export const isNeuralBoundary = (id: number, piece: string): boolean =>
  id === 2 || /^\s+$/u.test(piece) || /^[.,;:!?()[\]{}]$/u.test(piece);
