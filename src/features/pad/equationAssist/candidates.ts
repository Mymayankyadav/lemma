import {insertPadText, padEdit, scanPad, type PadEdit} from '../padEdit';
import {normalizeLatex} from './upstreamDecoder.js';

export const EQUATION_SELECTION_LIMIT = 128;

export interface EquationSelection {
  text: string;
  context: string;
  start: number;
  end: number;
  inMath: boolean;
}

export interface EquationCandidate {
  label: string;
  latex: string;
  lead?: string;
}

export function equationSelection(edit: PadEdit): EquationSelection | null {
  const raw = edit.text.slice(edit.start, edit.end);
  const text = raw.trim();
  if (!text || text.length > EQUATION_SELECTION_LIMIT || /[\r\n]/.test(text)) return null;
  let start = edit.start + raw.indexOf(text), end = start + text.length, offset = 0;
  for (const segment of scanPad(edit.text)) {
    const boundary = offset + segment.source.length;
    if (start >= offset && end <= boundary) {
      if (segment.kind === 'math') {
        const delimiter = (segment.source.length - segment.tex.length) / 2;
        if (start === offset && end === boundary) {
          start += delimiter;
          end -= delimiter;
        } else if (start < offset + delimiter || end > boundary - delimiter) return null;
      }
      if (segment.kind === 'unfinished') return null;
      const selected = edit.text.slice(start, end).trim();
      if (!selected) return null;
      const before = edit.text.slice(Math.max(0, edit.start - 160), edit.start).split(/\n/).at(-1) ?? '';
      const after = edit.text.slice(edit.end, edit.end + 160).split(/\n/)[0];
      return {text:selected, context:before + ' ' + after, start, end, inMath:segment.kind === 'math'};
    }
    offset = boundary;
  }
  return null;
}

export function applyEquationCandidate(edit: PadEdit, selection: EquationSelection, candidate: EquationCandidate): PadEdit {
  const {latex, lead = ''} = candidate;
  const insertion = selection.inMath ? (lead ? '\\text{' + lead + '}' : '') + latex : lead + '\\(' + latex + '\\)';
  return insertPadText(padEdit(edit.text, selection.start, selection.end), insertion);
}

const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numbers = new RegExp('\\b(' + numberWords.join('|') + ')\\b', 'gi');
const numeral = '\\d+(?:\\.\\d+)?';
const atom = '[A-Za-z](?:[\\^_](?:[-+]?\\d+|[A-Za-z]|\\{[-+]?[A-Za-z0-9]+\\}))?';
const term = '(?:' + numeral + '(?:' + atom + ')?|' + atom + ')';
const expression = '[+-]?' + term + '(?:[+-]' + term + ')*';
const complete = new RegExp('^' + expression + '(?:(?:<=|>=|!=|=|<|>)' + expression + ')?$');
const termOnly = new RegExp('^' + term + '$');
const ambiguousTerm = '(?:[A-Za-z]\\d{1,3}|' + term + ')';
const ambiguousExpression = '[+-]?' + ambiguousTerm + '(?:[+-]' + ambiguousTerm + ')*';
const ambiguousComplete = new RegExp('^' + ambiguousExpression + '(?:(?:<=|>=|!=|=|<|>)' + ambiguousExpression + ')?$');
const trailingDigit = /(?<![A-Za-z0-9^_])([A-Za-z])(\d{1,3})(?![\d.])/g;

const relations: Readonly<Record<string, string>> = {'<=': '\\le ', '>=': '\\ge ', '!=': '\\ne '};
function typeset(text: string) {
  return text.replace(/<=|>=|!=/g, relation => relations[relation])
    .replace(/([\^_])([-+]\d+|\d{2,})/g, '$1{$2}');
}

function mathText(text: string) {
  return text.replace(numbers, (_, word: string) => String(numberWords.indexOf(word.toLowerCase())))
    .replace(/\b(?:greater than or equal to|at least)\b/gi, '>=')
    .replace(/\b(?:less than or equal to|at most)\b/gi, '<=')
    .replace(/\b(?:greater than|bigger than)\b/gi, '>')
    .replace(/\b(?:less than|smaller than)\b/gi, '<')
    .replace(/\b(?:is not equal to|not equal to)\b/gi, '!=')
    .replace(/\b(?:is equal to|equals|equal to|is)\b/gi, '=')
    .replace(/\b(?:plus|adds?)\b/gi, '+')
    .replace(/\b(?:minus|negative)\b/gi, '-')
    .replace(/\bsquared\b/gi, '^2').replace(/\bcubed\b/gi, '^3')
    .replace(/[≤≥≠−²³]/g, char => ({'≤':'<=', '≥':'>=', '≠':'!=', '−':'-', '²':'^2', '³':'^3'})[char]!)
    .replace(/\s+/g, '');
}

function expressionCandidates(source: string, context: string): EquationCandidate[] {
  const text = mathText(source);
  if (ambiguousComplete.test(text) && [...text.matchAll(trailingDigit)].length) {
    const squares = {label:'Powers', latex: typeset(text.replace(trailingDigit, '$1^{$2}'))};
    const indices = {label:'Subscripts', latex: typeset(text.replace(trailingDigit, '$1_{$2}'))};
    const linear = {label:'Trailing coefficients', latex: typeset(text.replace(trailingDigit, '$2$1'))};
    if (/\b(?:trailing coefficients?|linear equation|trailing digits are coefficients)\b/i.test(context)) return [linear, squares, indices];
    if (/\b(?:sequences?|indices|indexed|subscripts?|(?:second|third|fourth|nth) (?:terms?|components?))\b/i.test(context)) {
      return [indices, squares, ...(/[=<>]/.test(text) ? [linear] : [])];
    }
    const powers = /\b(?:circle|quadratic|squares?|squared|powers?)\b/i.test(context);
    return [...(powers ? [squares, indices] : [indices, squares]), ...(/[=<>]/.test(text) ? [linear] : [])];
  }
  // Reject words that would fuse into implicit multiplication during whitespace removal.
  if (complete.test(text) && !/\b[A-Za-z]\s+[A-Za-z]\b/.test(source)) {
    return [{label:'Expression', latex:typeset(text)}];
  }
  return [];
}

const fieldWords: Readonly<Record<string, string>> = {real:'R', rational:'Q', integer:'Z', natural:'N', complex:'C'};
function fieldName(source: string): string | undefined {
  const glyph = 'ℝℚℤℕℂ'.indexOf(source);
  if (source.length === 1 && glyph >= 0) return 'RQZNC'[glyph];
  const tex = source.match(/^\\mathbb\{([RNZQC])\}$/);
  if (tex) return tex[1];
  const word = source.toLowerCase().replace(/(?: numbers|s)$/g, '');
  return Object.hasOwn(fieldWords, word) ? fieldWords[word] : /^[RNZQC]$/.test(source) ? source : undefined;
}

function polynomial(text: string, context: string): EquationCandidate[] {
  const phrase = text.match(/^(let )?([a-z]) (?:be|is) (?:a )?polynomials?(?: in ([a-z]))? with (?:(real|rational|integer|complex) coefficients|coefficients in (.+))$/i);
  if (!phrase) return [];
  const [, lead, name, variable, adjectival, coefficientSet] = phrase;
  const field = fieldName(adjectival ?? coefficientSet);
  if (!field) return [];
  const domain = '\\mathbb{' + field + '}';
  const indeterminate = variable ?? /\bpolynomials? in ([a-zA-Z])\b/.exec(context)?.[1];
  const ring = (x: string, label: string) => ({label, latex:name + '\\in' + domain + '[' + x + ']', lead});
  return indeterminate
    ? [ring(indeterminate, 'Polynomial ring')]
    : [
      {label:'Unspecified variables', latex:name + '\\text{ ' + (lead ? 'be' : 'is') + ' a polynomial over }' + domain, lead},
      ring('X', 'Polynomial in one variable'),
    ];
}

function quantified(text: string, context: string): EquationCandidate[] {
  const informal = text.match(/^(for all|for every|every|each|there exists|there is no|there isn't|some) (?:an? )?(real|rational|integer|natural|complex)(?: number)? ([a-z])(?:\s*[,;:]\s*|\s+)(?:(?:has|satisfies|such that) )?(.+)$/i);
  const explicit = text.match(/^(for all|forall|for every|there exists|exists|there is no) ([a-z]) in (.+?)\s*[,;:]\s*(.+)$/i);
  if (!informal && !explicit) return [];
  const [, binder, first, second, body] = (informal ?? explicit)!;
  const [variable, domain] = informal ? [second, first] : [first, second];
  const field = fieldName(domain);
  if (!field) return [];
  const kind = /every|all|each/i.test(binder) ? 'forall' : /no|n't/i.test(binder) ? 'nexists' : 'exists';
  const predicate = body.replace(/^whose square is /i, variable + ' squared equals ');
  const usesBoundVariable = new RegExp('\\b' + variable + '\\d+').test(mathText(predicate));
  return expressionCandidates(predicate, context + (usesBoundVariable ? ' powers' : '')).filter(candidate => /[=<>]|\\(?:le|ge|ne)\b/.test(candidate.latex))
    .map(candidate => ({
      label:candidate.label === 'Expression' ? 'Quantified statement' : candidate.label,
      latex:'\\' + kind + ' ' + variable + '\\in\\mathbb{' + field + '},\\;' + candidate.latex,
    }));
}

function spokenFraction(text: string, context: string): EquationCandidate[] {
  const words = text.match(/^(.+?) over (.+)$/i);
  if (!words) return [];
  const numerator = mathText(words[1]), denominator = mathText(words[2]);
  if (!termOnly.test(numerator)) return [];
  const grouped = '\\frac{' + numerator + '}{' + typeset(denominator) + '}';
  if (termOnly.test(denominator)) return [{label:'Fraction', latex:grouped}];
  const sum = denominator.match(new RegExp('^(' + term + ')([+-])(' + term + ')$'));
  if (!sum) return [];
  const fraction = {label:'Entire denominator', latex:grouped};
  const separate = {label:'Separate term', latex:'\\frac{' + numerator + '}{' + typeset(sum[1]) + '}' + sum[2] + typeset(sum[3])};
  return /\b(?:whole|entire) (?:sum|denominator)\b/i.test(context) ? [fraction, separate] : [separate, fraction];
}

export function localEquationCandidates(selection: EquationSelection): EquationCandidate[] {
  const text = selection.text.replace(/’/g, "'").replace(/[ \t]+/g, ' ').replace(/[.]$/, '');
  const root = text.match(/^(?:the )?(sqrt|square root|cube root|root)(?: of)?\s*(?:\(([^()]+)\)|([A-Za-z]+|\d+(?:\.\d+)?))$/i);
  if (root) {
    const argument = mathText(root[2] ?? root[3]);
    if (complete.test(argument) && !/[<>=!]/.test(argument)) {
      const cube = root[1].toLowerCase() === 'cube root';
      return [{label:cube ? 'Cube root' : 'Square root', latex:'\\sqrt' + (cube ? '[3]' : '') + '{' + typeset(argument) + '}'}];
    }
  }
  const proof = polynomial(text, selection.context);
  if (proof.length) return proof;
  const binders = quantified(text, selection.context);
  if (binders.length) return binders;
  const fractions = spokenFraction(text, selection.context);
  return fractions.length ? fractions : expressionCandidates(text, selection.context);
}

const notationWords = new Set('abs alpha approx beta binom cap cbrt ceil choose circ cos cosh cot cup deg del delta det dx dy dz ell eps epsilon exp frac gamma gcd grad inf infinity int lambda left lim ln log max min nabla neq norm nu partial phi pi pm prod psi right root rho sec sigma sin sinh sqrt subset sum sup tan tau theta times vec xi zeta'.split(' '));
export function autoeqInput(text: string): string | null {
  // The checkpoint is for written math. Full prose that did not match a
  // declaration stays editable instead of becoming an unrelated formula.
  return (
    /[0-9^_*/+=<>∫∑√∈∞…()[\]\\]|\.{3}/.test(text) &&
    (text.match(/[A-Za-z]{4,}/g) ?? []).every(word => notationWords.has(word.toLowerCase()))
  ) ? text : null;
}

function numericTokens(text: string) {
  return (text.replace(/\\times\s*10\^\{?([+-]?\d+)\}?/g, 'e$1')
    .match(/\d+(?:\.\d+)?/g) ?? []).join('|');
}

export function modelEquationCandidates(text: string, outputs: readonly string[]): EquationCandidate[] {
  const seen = new Set<string>();
  const facts = numericTokens(text);
  const equals = (value: string) => (value.match(/(?<![<>!=])=(?!=)/g) ?? []).length;
  const relations = equals(text);
  const candidates: EquationCandidate[] = [];
  for (const latex of outputs) {
    if (!latex.trim() || latex.length > 512 || /\{\s*\}|[\r\n$]|\\[()[\]]/.test(latex)) continue;
    if (facts !== numericTokens(latex) || relations !== equals(latex)) continue;
    const key = normalizeLatex(latex);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({label:'Interpretation ' + (candidates.length + 1), latex});
    if (candidates.length === 3) break;
  }
  return candidates;
}
