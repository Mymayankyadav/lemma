import type {SourceConstraint, Vocabulary} from './upstreamDecoder.js';

const equivalent: Readonly<Record<string, string>> = {
  '\\le': '<=', '\\leq': '<=', '\\ge': '>=', '\\geq': '>=', '\\ne': '!=', '\\neq': '!=', '\\pm': '+-',
};
const decoration = new Set([
  '*', '^', '_', '{', '}', '(', ')', '[', ']', ' ', '\\left', '\\right', '\\big', '\\Big',
  '\\mathrm', '\\mathit', '\\cdot', '\\times', '\\,', '\\;', '\\!', '\\ ', '\\displaystyle',
]);
const division = new Set(['/', '\\frac', '\\dfrac', '\\tfrac']);
const copiedToken = /^[A-Za-z0-9.+\-!=<>]$/;

export function plainAlgebra(text: string): string | undefined {
  const source = text.replace(/[−×·≤≥≠±]/g, c => ({
    '−':'-', '×':'*', '·':'*', '≤':'<=', '≥':'>=', '≠':'!=', '±':'+-',
  })[c]!).replace(/\s+/g, '');
  const math = /^[A-Za-z0-9.+\-!=<>*/^_{}()[\]]+$/;
  const aliases = /[A-Za-z]{3}|sq|pi|ln|oo|RR|NN|ZZ|QQ|CC|\d[eE][+-]?\d|\.\.|->|=>|==|!(?!=)/;
  return math.test(source) && /[A-Za-z0-9]/.test(source) && !aliases.test(source) ? source : undefined;
}

/**
 * For simple typed algebra, the visible token order and number of divisions
 * survive a change in LaTeX structure, including different fraction scopes.
 * Named operators, scientific notation and unfamiliar input use the regular
 * decoder. Each visited state caches one vocabulary-sized transition table.
 */
export function algebraSourceConstraint(text: string, vocabulary: Vocabulary): SourceConstraint | undefined {
  const source = plainAlgebra(text);
  if (!source) return undefined;
  const copied = source.replace(/[^A-Za-z0-9.+\-!=<>]/g, '');

  const divisions = (source.match(/\//g) ?? []).length, stride = divisions + 1;
  const projections = vocabulary.output_tokens.map(token => Object.hasOwn(equivalent, token) ? equivalent[token]
    : copiedToken.test(token) ? token
    : decoration.has(token) || division.has(token) ? '' : null);
  const cache = new Map<number, Int32Array>();
  return {
    transitions(state) {
      const cached = cache.get(state);
      if (cached) return cached;
      const offset = Math.floor(state / stride), used = state % stride;
      const table = new Int32Array(projections.length).fill(-1);
      for (let id = 0; id < table.length; id++) {
        if (id === vocabulary.eos_id) {
          if (offset === copied.length && used === divisions) table[id] = state;
          continue;
        }
        const part = projections[id];
        if (part === null || !copied.startsWith(part, offset)) continue;
        const count = used + Number(division.has(vocabulary.output_tokens[id]));
        if (count <= divisions) table[id] = (offset + part.length) * stride + count;
      }
      cache.set(state, table);
      return table;
    },
  };
}
