/**
 * N221 (Owner task) · auto-equation: in equation mode the answer keyboard turns what people type for maths into its
 * symbols as each piece is finished, the way Gboard autocorrects a word. Only in prose (inside $…$ the learner writes
 * LaTeX, where x^2 is already right), one change per keystroke, and a Backspace straight after puts the typed text back.
 *
 *   root 2 → √2   sqrt(x+1) → √(x+1)   cube root 8 → ∛8   x^2 → x²   x squared → x²   a_n → aₙ   x1 → x₁
 *   ... → …   -> → →   <= → ≤   != → ≠   +- → ±   2*3 → 2·3   1/2 → ½   alpha → α   infinity → ∞   in → ∈   RR → ℝ
 */
import {padEdit, type PadEdit} from '../../pad/padEdit';
import {tutorMathContext} from './symbolEdit';
import {SYMBOL_CATALOG} from './symbolCatalog';

export interface AutoEquationChange {
  /** The range of the text (before the character just typed) that is replaced. */
  readonly start: number;
  readonly end: number;
  readonly from: string;
  readonly replacement: string;
}

const SUPERSCRIPT: Readonly<Record<string, string>> = Object.fromEntries([...'0123456789+-=()niTabcdefghjklmoprstuvwxyz']
  .map((char, index) => [char, '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱᵀᵃᵇᶜᵈᵉᶠᵍʰʲᵏˡᵐᵒᵖʳˢᵗᵘᵛʷˣʸᶻ'[index]]));
const SUBSCRIPT: Readonly<Record<string, string>> = Object.fromEntries([...'0123456789+-=()aehijklmnoprstuvx']
  .map((char, index) => [char, '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ'[index]]));
const script = (text: string, table: Readonly<Record<string, string>>) =>
  [...text].every(char => table[char]) ? [...text].map(char => table[char]).join('') : null;

/** Operators, longest first; converted once the next character shows the run is finished. */
const OPERATORS: readonly (readonly [string, string])[] = [
  ['<=>', '⇔'], ['<->', '↔'], ['|->', '↦'], ['...', '…'], ['->', '→'], ['<-', '←'], ['=>', '⇒'], ['<=', '≤'], ['>=', '≥'],
  ['!=', '≠'], ['/=', '≠'], ['~~', '≈'], ['~=', '≅'], ['==', '≡'], ['+-', '±'], ['-+', '∓'],
];
const OPERATOR_CHAR = /[-=<>!~|+./*]/u;

/** Names written out in equations. Greek letters and catalog commands come from the symbol catalog. */
const WORDS = new Map<string, string>([
  ['infinity', '∞'], ['inf', '∞'], ['infty', '∞'], ['oo', '∞'], ['in', '∈'], ['notin', '∉'], ['to', '→'], ['mapsto', '↦'],
  ['implies', '⇒'], ['iff', '⇔'], ['forall', '∀'], ['exists', '∃'], ['sum', '∑'], ['prod', '∏'], ['int', '∫'],
  ['integral', '∫'], ['oint', '∮'], ['partial', '∂'], ['nabla', '∇'], ['grad', '∇'], ['union', '∪'], ['cup', '∪'],
  ['intersect', '∩'], ['intersection', '∩'], ['cap', '∩'], ['subset', '⊂'], ['subseteq', '⊆'], ['supset', '⊃'],
  ['supseteq', '⊇'], ['emptyset', '∅'], ['empty', '∅'], ['setminus', '∖'], ['times', '×'], ['cdot', '·'], ['div', '÷'],
  ['pm', '±'], ['mp', '∓'], ['approx', '≈'], ['neq', '≠'], ['leq', '≤'], ['geq', '≥'], ['equiv', '≡'], ['cong', '≅'],
  ['deg', '°'], ['degrees', '°'], ['circ', '∘'], ['perp', '⊥'], ['parallel', '∥'], ['angle', '∠'], ['therefore', '∴'],
  ['because', '∵'], ['qed', '∎'], ['dots', '…'], ['ldots', '…'], ['cdots', '⋯'], ['aleph', 'ℵ'], ['ell', 'ℓ'],
  ['RR', 'ℝ'], ['NN', 'ℕ'], ['ZZ', 'ℤ'], ['QQ', 'ℚ'], ['CC', 'ℂ'],
]);
for (const symbol of SYMBOL_CATALOG) {
  const name = symbol.tex.slice(1);
  if (symbol.category === 'Greek' && /^[A-Za-z]+$/u.test(name) && !name.startsWith('var')) WORDS.set(name, symbol.glyph);
}
// The upright ε and φ (\varepsilon, \varphi) are what learners mean by epsilon and phi.
WORDS.set('eps', 'ε').set('epsilon', 'ε').set('phi', 'φ');

const FRACTIONS = new Map([['1/2', '½'], ['1/3', '⅓'], ['2/3', '⅔'], ['1/4', '¼'], ['3/4', '¾'], ['1/8', '⅛']]);
/** What a root may apply to: a number, a single variable or a bracketed group. */
const OPERAND = /^(?:[0-9]+(?:\.[0-9]+)?|[A-Za-z]|[α-ωΑ-Ω]|\([^()]{1,40}\))$/u;
const FINISHES = /[\s,;:)\]}+\-=*/<>]/u;

function rootOf(operand: string): string {
  return /^\(([0-9]+(?:\.[0-9]+)?|[A-Za-z])\)$/u.test(operand) ? operand.slice(1, -1) : operand;
}

/**
 * After a character is typed at `caret - 1` in `text`, the change to apply to the text before it, or null.
 * The character itself is kept; the caller replaces [start, end) and moves the caret by the length difference.
 */
export function autoEquation(text: string, caret: number): AutoEquationChange | null {
  if (caret < 2 || caret > text.length) return null;
  const typed = text[caret - 1];
  const before = text.slice(Math.max(0, caret - 1 - 60), caret - 1);
  const end = caret - 1;
  // Every change replaces the end of the text before the typed character.
  const suffix = (from: string, replacement: string | null): AutoEquationChange | null =>
    replacement && replacement !== from ? {start: end - from.length, end, from, replacement} : null;

  // An operator run is finished by the first character that cannot extend it: x<=y, a!=b, 1,2,... n.
  if (!OPERATOR_CHAR.test(typed)) {
    for (const [form, glyph] of OPERATORS) {
      if (before.endsWith(form) && !OPERATOR_CHAR.test(before.at(-form.length - 1) ?? '')) return suffix(form, glyph);
    }
    // 2*3 → 2·3 between two operands.
    if (/[0-9A-Za-z)]\*$/u.test(before) && /[0-9A-Za-z(]/u.test(typed)) return suffix('*', '·');
  }
  if (!FINISHES.test(typed)) return null;

  // Superscripts and subscripts after any base: x^2, x^{-1}, (a+b)^n, a_n, x_{12}.
  const sup = /\S(\^(?:\{([^{}]{1,8})\}|(-?[0-9]{1,3}|[A-Za-z])))$/u.exec(before);
  if (sup) return suffix(sup[1], script(sup[2] ?? sup[3], SUPERSCRIPT));
  const sub = /\S(_(?:\{([^{}]{1,8})\}|([0-9]{1,3}|[A-Za-z])))$/u.exec(before);
  if (sub) return suffix(sub[1], script(sub[2] ?? sub[3], SUBSCRIPT));
  // A single-letter variable with an index: x1 → x₁, a12 → a₁₂.
  const indexed = /(?:^|[^A-Za-z0-9])([A-Za-z])([0-9]{1,2})$/u.exec(before);
  if (indexed) return suffix(indexed[1] + indexed[2], indexed[1] + script(indexed[2], SUBSCRIPT));

  // Roots: root 2, sqrt 2, sqrt(x+1), square root of x, cube root 8, cbrt 8, fourth root of x.
  const root = /(?:^|[^A-Za-z])((?:(square|cube|fourth)\s+root(?:\s+of)?|sqrt|cbrt|root)\s*(\S+))$/iu.exec(before);
  if (root && OPERAND.test(root[3])) {
    const kind = root[2]?.toLowerCase() ?? (root[1].toLowerCase().startsWith('cbrt') ? 'cube' : 'square');
    return suffix(root[1], (kind === 'cube' ? '∛' : kind === 'fourth' ? '∜' : '√') + rootOf(root[3]));
  }
  // x squared, (a+b) cubed.
  const power = /(\S+)\s+(squared|cubed)$/iu.exec(before);
  if (power && /[0-9A-Za-z)α-ω]$/u.test(power[1])) {
    return suffix(power[0], power[1] + (power[2].toLowerCase() === 'squared' ? '²' : '³'));
  }
  const fraction = /(?:^|[^0-9/])([0-9]\/[0-9])$/u.exec(before);
  if (fraction) return suffix(fraction[1], FRACTIONS.get(fraction[1]) ?? null);
  // A written-out name: alpha → α, infinity → ∞, in → ∈.
  const word = /(?:^|[^A-Za-z\\])([A-Za-z]{2,14})$/u.exec(before)?.[1];
  return word ? suffix(word, WORDS.get(word) ?? null) : null;
}

/** Apply a change to `text` (whose caret is at `caret`); returns the new text and caret. */
export function applyAutoEquation(text: string, caret: number, change: AutoEquationChange): {text: string; caret: number} {
  return {text: text.slice(0, change.start) + change.replacement + text.slice(change.end),
    caret: caret + change.replacement.length - (change.end - change.start)};
}

export interface EquationSuggestion {
  readonly label: string;
  /** Replace [start, end) of the text with `insert`. */
  readonly start: number;
  readonly end: number;
  readonly insert: string;
}

/**
 * The equation strip's three suggestions, best first: the usual next pieces of an equation for the text before the
 * caret. After a variable its square and indices, after a number or bracket an exponent, after a comma the ellipsis,
 * and otherwise the question's own variables and a number.
 */
export function equationSuggestions(text: string, caret: number, variables: readonly string[] = []): EquationSuggestion[] {
  const before = text.slice(0, caret);
  const at = (insert: string, label = insert): EquationSuggestion => ({label, start: caret, end: caret, insert});
  const variable = /(?:^|[^A-Za-z0-9α-ωΑ-Ω])([A-Za-zα-ωΑ-Ω])$/u.exec(before)?.[1];
  if (variable) {
    const swap = (insert: string): EquationSuggestion => ({label: insert, start: caret - variable.length, end: caret, insert});
    return [swap(variable + '²'), swap(variable + '₁'), swap(variable + 'ₙ')];
  }
  if (/[0-9)\]²³]$/u.test(before)) return [at('²'), at('⁻¹'), at('³')];
  if (/,\s*$/u.test(before)) return [at('…'), at(variables[0] ?? 'x'), at('n')];
  const usual = [...new Set([...variables, 'x', 'n', 'ε'])];
  return [at(usual[0]), at('0'), at('…')];
}

/** Single-letter variables in the tutor's question (x, n, ε, f), most frequent first. */
export function questionVariables(texts: readonly (string | undefined)[]): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) for (const match of text?.matchAll(/(?<![A-Za-zα-ωΑ-Ω])([a-zα-ω])(?![A-Za-zα-ωΑ-Ω])/gu) ?? []) {
    if (match[1] === 'a' || match[1] === 'i') continue;
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 3);
}

/**
 * The edit equation mode makes after a keystroke: `previous` → `typed` must insert exactly one character at a collapsed
 * caret in prose. Returns the converted edit, or null to keep what was typed.
 */
export function autoEquationAfterTyping(previous: PadEdit, typed: PadEdit): {edit: PadEdit; from: string} | null {
  if (typed.start !== typed.end || typed.text.length !== previous.text.length + 1 || tutorMathContext(typed) !== 'prose' ||
      typed.text.slice(0, typed.start - 1) + typed.text.slice(typed.start) !== previous.text) return null;
  const change = autoEquation(typed.text, typed.start);
  if (!change) return null;
  const applied = applyAutoEquation(typed.text, typed.start, change);
  return {edit: padEdit(applied.text, applied.caret), from: change.from};
}
