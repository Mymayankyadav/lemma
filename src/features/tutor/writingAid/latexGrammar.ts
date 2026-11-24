/**
 * N235 · next-token suggestions inside $…$, behind the typeaheadV2 flag.
 *
 *   P'(t | h, σ) = P(t | h) · 1[t ∈ A(σ)] / Σ_t' P(t' | h) · 1[t' ∈ A(σ)]
 *
 * P is the LaTeX-token trigram (public/models/typeahead/latex-v1); σ is the state of a small pushdown automaton over the
 * math typed so far (open braces, brackets, \left, \begin, and the arguments a command still wants); A(σ) are the tokens
 * σ allows. The automaton can only remove tokens. The model never invents an identifier: its <latin> class is filled from
 * the variables the learner and the question already use.
 */
import {latexModel, ngramLog, ngramNext, type NgramModel} from './decoder/kn';
import {decoderSymbols} from './decoder/ngramSpatial';
import {scanPad, type PadEdit} from '../../pad/padEdit';

const TOKEN = /\\[A-Za-z]+|\\.|[A-Za-z]|\d+|\S/gu;
/** Tokens as the model was trained: a single letter is <latin>, digits <num>. */
export function latexTokens(math: string): string[] {
  return math.match(TOKEN) ?? [];
}
const modelToken = (token: string) => /^[A-Za-z]$/.test(token) ? '<latin>' : /^\d+$/.test(token) ? '<num>' : token;

/** How many brace-group arguments each command takes (an unlisted command takes none). */
const ARGUMENTS: Readonly<Record<string, number>> = {
  '\\frac': 2, '\\dfrac': 2, '\\tfrac': 2, '\\binom': 2, '\\sqrt': 1, '\\overline': 1, '\\underline': 1, '\\hat': 1, '\\tilde': 1,
  '\\bar': 1, '\\vec': 1, '\\dot': 1, '\\ddot': 1, '\\widehat': 1, '\\widetilde': 1, '\\mathbb': 1, '\\mathcal': 1, '\\mathbf': 1,
  '\\mathrm': 1, '\\mathfrak': 1, '\\mathscr': 1, '\\text': 1, '\\textbf': 1, '\\operatorname': 1, '\\boldsymbol': 1,
  '\\stackrel': 2, '\\overset': 2, '\\underset': 2, '\\begin': 1, '\\end': 1,
};
const RELATIONS = new Set(['=', '<', '>', '\\le', '\\leq', '\\ge', '\\geq', '\\ne', '\\neq', '\\in', '\\notin', '\\subset',
  '\\subseteq', '\\supset', '\\supseteq', '\\equiv', '\\approx', '\\sim', '\\cong', '\\to', '\\mapsto', '\\Rightarrow',
  '\\Leftarrow', '\\Leftrightarrow', '\\implies', '\\iff', '\\leftarrow', '\\rightarrow']);
const BINARY = new Set(['*', '/', '\\cdot', '\\times', '\\cup', '\\cap', '\\wedge', '\\vee', '\\circ', '\\oplus', '\\otimes', '\\setminus']);
const CLOSERS: Readonly<Record<string, string>> = {'}': '{', ')': '(', ']': '['};

export interface LatexState {
  /** Open groups, innermost last: "{", "(", "[", "\\left", "\\begin". */
  readonly stack: readonly string[];
  /** Arguments the last command or script operator still needs (each one a { group or a single token). */
  readonly pending: number;
  /** The command awaiting its arguments, if any. */
  readonly command: string;
  readonly last: string;
  readonly beforeLast: string;
}

interface Frame {readonly open: string; readonly arg: boolean}
interface Need {readonly command: string; remaining: number; readonly depth: number}

/** Run the automaton over complete tokens. Unbalanced closers are ignored (the learner may be editing mid-formula). */
export function latexState(tokens: readonly string[]): LatexState {
  const stack: Frame[] = [];
  const needs: Need[] = [];
  let last = '', beforeLast = '';
  const due = (): Need | undefined => {
    const need = needs[needs.length - 1];
    return need && need.depth === stack.length && need.remaining > 0 ? need : undefined;
  };
  const trim = () => {while (needs.length && needs[needs.length - 1].depth > stack.length) needs.pop();};
  /** One argument of the innermost waiting command is complete. */
  function satisfy() {
    const need = needs[needs.length - 1];
    if (!need) return;
    need.remaining--;
    if (need.remaining > 0) return;
    needs.pop();
    if (need.command === '\\begin') stack.push({open: '\\begin', arg: false});
    if (need.command === '\\end') {
      const at = stack.map(frame => frame.open).lastIndexOf('\\begin');
      if (at >= 0) {stack.length = at; trim();}
    }
  }
  for (const token of tokens) {
    const need = due();
    if (token !== '{' && need) satisfy();
    if (token === '{') stack.push({open: '{', arg: Boolean(need)});
    else if (token in CLOSERS) {
      const at = stack.map(frame => frame.open).lastIndexOf(CLOSERS[token]);
      if (at >= 0) {
        const frame = stack[at];
        stack.length = at;
        trim();
        if (frame.arg) satisfy();
      }
    } else if (token === '(' || token === '[') stack.push({open: token, arg: false});
    else if (token === '\\left') stack.push({open: '\\left', arg: false});
    else if (token === '\\right') {
      const at = stack.map(frame => frame.open).lastIndexOf('\\left');
      if (at >= 0) {stack.length = at; trim();}
    } else if (token === '^' || token === '_') needs.push({command: token, remaining: 1, depth: stack.length});
    else if (token in ARGUMENTS) needs.push({command: token, remaining: ARGUMENTS[token], depth: stack.length});
    beforeLast = last;
    last = token;
  }
  const waiting = due();
  return {stack: stack.map(frame => frame.open), pending: waiting?.remaining ?? 0, command: waiting?.command ?? '', last, beforeLast};
}

/** Whether `token` may come next after `state`. Returns false only for clear violations. */
export function latexAllows(state: LatexState, token: string): boolean {
  const {stack, pending, last} = state;
  const top = stack[stack.length - 1];
  if (pending > 0) {
    // An argument is due: a group, or (for a script) one atom. Never a closer, a relation, an operator or another script.
    if (token === '{') return true;
    if (state.command === '\\begin' || state.command === '\\end') return false;
    if (state.command === '^' || state.command === '_' || state.command === '\\sqrt') {
      return !RELATIONS.has(token) && !BINARY.has(token) && !(token in CLOSERS) && token !== '^' && token !== '_' && token !== '&' &&
        token !== '\\\\' && token !== '\\right' && token !== '\\end' && token !== '+' && !(token in ARGUMENTS);
    }
    return false;
  }
  if (token in CLOSERS) return top === CLOSERS[token];
  if (token === '\\right') return stack.includes('\\left');
  if (token === '\\end') return stack.includes('\\begin');
  if (token === '&' || token === '\\\\') return stack.includes('\\begin');
  if ((token === '^' || token === '_') && (last === '' || last === '{' || last === '(' || last === '[' || RELATIONS.has(last) ||
      BINARY.has(last) || last === '^' || last === '_' || last === '+' || last === '-' || last === '\\left')) return false;
  if (RELATIONS.has(token) && (RELATIONS.has(last) || BINARY.has(last) || last === '' || last === '{' || last === '(' || last === '[' || last === '\\left')) return false;
  if (BINARY.has(token) && (RELATIONS.has(last) || BINARY.has(last) || last === '' || last === '{' || last === '(' || last === '[' || last === '+' || last === '-')) return false;
  return true;
}

export interface LatexSuggestion {
  /** The text to put at the caret, replacing the typed part of the command. */
  readonly insert: string;
  /** Where the caret ends, counted from the start of `insert` (inside a pair of braces, say). */
  readonly caret: number;
  readonly label: string;
  readonly score: number;
}

const OPENERS: Readonly<Record<string, string>> = {'{': '{}', '(': '()', '[': '[]'};

/**
 * The next LaTeX tokens after `math` (the text of the unfinished $…$ before the caret). `typed` is a command being typed
 * (`\\fr`), which a suggestion must extend. Returns up to `limit`, best first. Empty until the LaTeX model has loaded.
 */
export function latexSuggestions(math: string, typed: string, before: string, limit = 3): LatexSuggestion[] {
  const model = latexModel();
  if (!model) return [];
  const complete = typed ? math.slice(0, math.length - typed.length) : math;
  const raw = latexTokens(complete);
  return rank(model, raw.map(modelToken), latexState(raw), typed, before, limit);
}

function rank(model: NgramModel, tokens: readonly string[], state: LatexState, typed: string, before: string, limit: number): LatexSuggestion[] {
  const ids = tokens.slice(-2).map(token => model.id.get(token) ?? 3);
  const context: [number, number] = [ids.length > 1 ? ids[0] : 0, ids.length ? ids[ids.length - 1] : 0];
  const out: LatexSuggestion[] = [];
  const variables = decoderSymbols(before).slice(0, 3);
  for (const id of ngramNext(model, context[0], context[1])) {
    const token = model.words[id];
    if (id <= 4 || !token || (typed && !token.startsWith(typed)) || token === typed) continue;
    const score = ngramLog(model, id, context[0], context[1]);
    if (token === '<latin>') {
      // A variable the learner or the question already uses; never an invented one.
      if (typed) continue;
      variables.forEach((symbol, index) => {
        if (latexAllows(state, symbol)) out.push({insert: symbol, caret: symbol.length, label: symbol, score: score + Math.log(1 / (index + 1))});
      });
      continue;
    }
    if (token === '<num>') continue;
    if (!latexAllows(state, token)) continue;
    const pair = OPENERS[token];
    // A command made of letters needs a separator before the next letter, unless it takes a { argument next.
    const spaced = token.startsWith('\\') && /[A-Za-z]$/.test(token) && !(token in ARGUMENTS) ? token + ' ' : token;
    out.push({insert: pair ?? spaced, caret: pair ? 1 : spaced.length, label: token, score});
  }
  // A due argument is the likeliest thing of all: offer its opening brace first.
  if (state.pending > 0 && !typed && latexAllows(state, '{') && !out.some(item => item.label === '{')) {
    out.push({insert: '{}', caret: 1, label: '{', score: 0});
  }
  const seen = new Set<string>();
  return out.sort((a, b) => b.score - a.score).filter(item => !seen.has(item.label) && seen.add(item.label)).slice(0, limit);
}

/**
 * The maths being typed: the text of the unfinished $…$ before a collapsed caret, and the command in progress at its end
 * (`\\fr`). `start` is where that command begins, so a suggestion replaces it. Null outside an unfinished or open maths span.
 */
export function unfinishedMath(edit: PadEdit): {math: string; typed: string; start: number} | null {
  if (edit.start !== edit.end) return null;
  let offset = 0;
  for (const segment of scanPad(edit.text)) {
    const start = offset;
    offset += segment.source.length;
    if (segment.kind === 'text' || edit.end < start || edit.end > offset) continue;
    const delimiter = segment.source.startsWith('$$') || segment.source.startsWith('\\') ? 2 : 1;
    const mathStart = start + delimiter, mathEnd = segment.kind === 'math' ? offset - delimiter : offset;
    if (edit.start < mathStart || edit.end > mathEnd) return null;
    const math = edit.text.slice(mathStart, edit.start);
    const typed = /\\[A-Za-z]*$/.exec(math)?.[0] ?? '';
    return {math, typed, start: edit.start - typed.length};
  }
  return null;
}
