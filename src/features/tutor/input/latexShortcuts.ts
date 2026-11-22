/**
 * N221 (Owner task) · symbol suggestions from LaTeX commands and short forms, by dictionary matching and fuzzy matching
 * over the existing symbol catalog. Nothing changes until a suggestion is tapped; inside $…$ a tapped symbol inserts its
 * LaTeX command (so `\alp` completes to `\alpha`), in prose its glyph (α).
 *
 * - `\name`: a LaTeX command being typed. Exact and prefix matches first, then commands one or two typos away
 *   (`\aplha` → α), using the catalog's own ranked search.
 * - ASCII short forms, as in LaTeX/Unicode input methods: `->` → `<=` `>=` `!=` `~~` `==` `+-` `...` `|->` `<=>`,
 *   doubled capitals for number sets (`RR` → ℝ) and `^2` `^3` `^n`.
 * - A bare command name typed in full (`lambda`, `forall`, `infty`, `Gamma`), except names that are ordinary English
 *   words (in, to, sum, cup, partial…), and, once the word list has loaded, a near-miss of one (`lamda` → λ) that is not
 *   the start of any English word. Bare names are often the start of a word (mu → much), so they are `kind: 'name'`:
 *   the strip shows only the best symbol beside the word suggestions instead of replacing them.
 */
import type {PadEdit} from '../../pad/padEdit';
import {isWordPrefix} from '../tapCorrection';
import {SYMBOL_CATALOG, searchSymbols, symbolByGlyph, type SymbolDefinition} from './symbolCatalog';

export interface SymbolOption {
  readonly symbol: SymbolDefinition;
  /** `command` (`\alp`) and `short` (`->`) take the word slots; `name` (`alpha`) sits beside the words. */
  readonly kind: 'command' | 'short' | 'name';
  /** The typed short form this option replaces. */
  readonly start: number;
  readonly end: number;
  readonly token: string;
}

const SHORT_FORMS: readonly (readonly [string, readonly string[]])[] = [
  ['<=>', ['⇔']], ['<->', ['↔', '⇔']], ['|->', ['↦']], ['...', ['…']],
  ['->', ['→', '↦', '⇒']], ['<-', ['←', '⇐']], ['=>', ['⇒', '≥']], ['<=', ['≤', '⇐']], ['>=', ['≥']],
  ['!=', ['≠']], ['/=', ['≠']], ['~~', ['≈']], ['~=', ['≅', '≃']], ['==', ['≡']], ['+-', ['±']], ['-+', ['∓']],
  ['^2', ['²']], ['^3', ['³']], ['^n', ['ⁿ']],
  ['RR', ['ℝ']], ['NN', ['ℕ']], ['ZZ', ['ℤ']], ['QQ', ['ℚ']], ['CC', ['ℂ']], ['PP', ['ℙ']], ['EE', ['𝔼', '∃']], ['AA', ['∀']],
];
/** Command names that are also ordinary words or abbreviations in prose; only `\name` offers these. */
const ENGLISH = new Set(['in', 'to', 'top', 'bot', 'mid', 'sim', 'cap', 'cup', 'sum', 'int', 'div', 'ast', 'angle', 'prime',
  'circ', 'ni', 'neg', 'wedge', 'vee', 'degree', 'parallel', 'perp', 'because', 'therefore', 'implies', 'iff', 'partial',
  'surd', 'Re', 'Im', 'ell', 'land', 'lor', 'mp', 'pm', 'times', 'not', 'prod', 'Vert', 'top', 'cdot', 'ldots', 'Pi']);
/** Variants a learner may want instead (ε or ϵ, φ or ϕ), and the capital Greek letter. */
const VARIANTS: Readonly<Record<string, readonly string[]>> = {
  epsilon: ['ε', 'ϵ'], eps: ['ε', 'ϵ'], varepsilon: ['ε', 'ϵ'], phi: ['ϕ', 'φ'], varphi: ['φ', 'ϕ'], theta: ['θ', 'ϑ'],
  pi: ['π', 'ϖ'], rho: ['ρ', 'ϱ'], sigma: ['σ', 'ς'], kappa: ['κ', 'ϰ'],
};
const BARE = new Map<string, SymbolDefinition[]>();
for (const symbol of SYMBOL_CATALOG) {
  const names = [symbol.tex, ...symbol.aliases].filter(name => /^\\[A-Za-z]+$/.test(name)).map(name => name.slice(1));
  for (const name of names) if (!ENGLISH.has(name)) BARE.set(name, [...BARE.get(name) ?? [], symbol]);
}
BARE.set('eps', [symbolByGlyph('ε')!]);
BARE.set('emptyset', [symbolByGlyph('∅')!]);

/** Commands learners use most, so `\a` offers α before ℵ: exact, then common prefixes, then other prefixes, then typos. */
const COMMON = new Set(['alpha', 'beta', 'gamma', 'delta', 'varepsilon', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'sigma',
  'varphi', 'phi', 'omega', 'in', 'notin', 'infty', 'int', 'sum', 'forall', 'exists', 'to', 'rightarrow', 'Rightarrow',
  'leftarrow', 'Leftrightarrow', 'leq', 'geq', 'neq', 'subseteq', 'subset', 'cup', 'cap', 'varnothing', 'partial', 'nabla',
  'times', 'cdot', 'approx', 'equiv', 'mapsto', 'setminus', 'circ', 'pm', 'sqrt', 'prod', 'lim']);
function commandOrder(token: string, symbol: SymbolDefinition): number {
  const commands = [symbol.tex, ...symbol.aliases].filter(name => name.startsWith('\\'));
  if (commands.includes(token)) return 0;
  const prefix = commands.filter(name => name.startsWith(token));
  if (!prefix.length) return 3;
  return prefix.some(name => COMMON.has(name.slice(1))) ? 1 : 2;
}

const unique = (symbols: readonly (SymbolDefinition | undefined)[]) =>
  symbols.filter((symbol, index, list): symbol is SymbolDefinition => Boolean(symbol) && list.indexOf(symbol) === index);

function bare(name: string): SymbolDefinition[] {
  const exact = BARE.get(name) ?? [];
  const variants = (VARIANTS[name] ?? []).map(glyph => symbolByGlyph(glyph));
  // The capital or small Greek letter: Gamma ↔ gamma.
  const flipped = name[0] === name[0].toUpperCase() ? name.toLowerCase() : name[0].toUpperCase() + name.slice(1);
  const other = /^[A-Za-z]+$/.test(name) && exact.some(symbol => symbol.category === 'Greek') ? BARE.get(flipped) ?? [] : [];
  // A listed variant order wins (epsilon → ε before the lunate ϵ, as in the catalog's main epsilon).
  return unique([...variants, ...exact, ...other]);
}

/** Up to three symbols for the short form just before a collapsed caret, best first. */
export function latexSymbolOptions(edit: PadEdit, limit = 3): SymbolOption[] {
  if (edit.start !== edit.end || edit.end > 4000) return [];
  const before = edit.text.slice(Math.max(0, edit.end - 40), edit.end);
  const make = (kind: SymbolOption['kind'], token: string, symbols: readonly SymbolDefinition[]) => symbols.slice(0, limit)
    .map(symbol => ({symbol, kind, token, start: edit.end - token.length, end: edit.end}));

  const command = /\\([A-Za-z]{1,24})$/.exec(before);
  if (command) {
    const found = searchSymbols(command[0]).filter(symbol => symbol.glyph !== symbol.tex);
    const order = new Map(found.map(symbol => [symbol, commandOrder(command[0], symbol)]));
    return make('command', command[0], [...found].sort((a, b) => order.get(a)! - order.get(b)!));
  }

  for (const [form, glyphs] of SHORT_FORMS) {
    if (!before.endsWith(form)) continue;
    // A letter pair counts only on its own (RR, not ERR); an operator only when not part of a longer one (<=> vs =>).
    const previous = before.at(-form.length - 1) ?? '';
    if (/^[A-Z]{2}$/.test(form) ? /[A-Za-z]/.test(previous) : /[-=<>!~|+/.]/.test(previous)) continue;
    return make('short', form, unique(glyphs.map(glyph => symbolByGlyph(glyph))));
  }

  const word = /(?:^|[^A-Za-z\\])([A-Za-z]{2,24})$/.exec(before)?.[1];
  if (!word) return [];
  const exact = bare(word);
  if (exact.length) return make('name', word, exact);
  // A near-miss of a command name that cannot be the start of an English word (lamda → λ, but not thera → θ).
  if (word.length >= 5 && !isWordPrefix(word.toLowerCase())) {
    const near = searchSymbols('\\' + word).filter(symbol => BARE.has(symbol.tex.slice(1)));
    if (near.length) return make('name', word, near);
  }
  return [];
}
