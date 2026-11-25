/**
 * N235 · next-token suggestions inside math.
 * Grammar removes impossible continuations. Language scores rank the
 * surviving tokens alongside structural templates and scoped tutor evidence.
 */
import {historyLog, historyNext, historyWidth, latexModel, type NgramModel} from './decoder/kn';
import {decoderSymbols} from './decoder/ngramSpatial';
import type {DeclaredSymbol} from '../../../../supabase/functions/_shared/tutor-answer-aids';
import {scanPad, type PadEdit} from '../../pad/padEdit';
import {latexCommandEnd, latexControlWordPrefix} from '../input/latexCommand';

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
const RELATIONS = new Set(['=', '<', '>', '≤', '≥', '≠', '∈', '∉', '⊂', '⊆', '⊃', '⊇', '→', '↦', '⇒', '⇔', '\\le', '\\leq', '\\ge', '\\geq', '\\ne', '\\neq', '\\in', '\\notin', '\\subset',
  '\\subseteq', '\\supset', '\\supseteq', '\\equiv', '\\approx', '\\sim', '\\cong', '\\to', '\\mapsto', '\\Rightarrow',
  '\\Leftarrow', '\\Leftrightarrow', '\\implies', '\\iff', '\\leftarrow', '\\rightarrow']);
const BINARY = new Set(['*', '/', '\\cdot', '\\times', '\\cup', '\\cap', '\\wedge', '\\vee', '\\circ', '\\oplus', '\\otimes', '\\setminus']);
const CLOSERS: Readonly<Record<string, string>> = {'}': '{', ')': '(', ']': '['};

const ENVIRONMENTS = ['matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix', 'array',
  'cases', 'aligned', 'alignedat', 'gathered', 'split'] as const;
const DELIMITERS = new Set(['(', ')', '[', ']', '.', '|', '\\{', '\\}', '\\langle', '\\rangle', '\\lvert', '\\rvert', '\\lVert', '\\rVert', '\\|']);
const ROW = '\\\\';
const ALIGNMENT = new Set(['aligned', 'alignedat', 'split']);
type Environment = typeof ENVIRONMENTS[number];

export interface LatexState {
  readonly stack: readonly string[];
  readonly pending: number;
  readonly command: string;
  readonly last: string;
  readonly beforeLast: string;
  readonly malformed: boolean;
  readonly environment?: Readonly<{name: Environment; columns: number; expectedColumns?: number; cell: boolean}>;
  readonly name?: Readonly<{command: '\\begin' | '\\end'; prefix: string}>;
  readonly delimiter?: '\\left' | '\\right';
}

interface Frame {
  readonly open: string;
  readonly argument?: boolean;
  readonly name?: Environment;
  columns?: number;
  expectedColumns?: number;
  cell?: boolean;
}
interface Need {readonly command: string; remaining: number; readonly depth: number; index?: boolean}
const isEnvironment = (name: string): name is Environment => (ENVIRONMENTS as readonly string[]).includes(name);
const isSeparator = (token: string) => token === '&' || token === ROW;
const isStart = (token: string) => !token || ['{', '(', '[', '\\left'].includes(token) || isSeparator(token);
const cellComplete = (token: string) => !isStart(token) && !RELATIONS.has(token) && !BINARY.has(token) && !['^', '_', '+', '-'].includes(token);
const isAtom = (token: string) => !isStart(token) && !RELATIONS.has(token) && !BINARY.has(token) &&
  !(token in CLOSERS) && !(token in ARGUMENTS) && !['^', '_', '+', '-', '\\right'].includes(token);

/** Parse complete tokens to the caret. A closing token must address the innermost frame. */
export function latexState(tokens: readonly string[]): LatexState {
  const stack: Frame[] = [];
  const needs: Need[] = [];
  let last = '', beforeLast = '', malformed = false;
  let name: {command: '\\begin' | '\\end'; prefix: string} | undefined;
  let delimiter: LatexState['delimiter'];
  const top = () => stack.at(-1);
  const due = () => needs.at(-1)?.depth === stack.length ? needs.at(-1) : undefined;
  const markCell = () => {const frame = top(); if (frame?.name) frame.cell = true;};
  function satisfy() {
    const next = due();
    if (next && --next.remaining === 0) needs.pop();
  }
  function remember(token: string) {beforeLast = last; last = token;}
  for (const token of tokens) {
    const frame = top();
    const need = due();
    if (delimiter) {
      if (!DELIMITERS.has(token)) {malformed = true; break;}
      if (delimiter === '\\left') stack.push({open: '\\left'});
      else {stack.pop(); markCell();}
      remember(delimiter === '\\left' ? '\\left' : ')');
      delimiter = undefined;
      continue;
    }
    if (name) {
      if (token === '}') {
        const closing = name.command === '\\end';
        if (closing) {
          if (!frame?.name || name.prefix !== frame.name) {malformed = true; break;}
          stack.pop();
          markCell();
        } else {
          if (!isEnvironment(name.prefix)) {malformed = true; break;}
          const env = name.prefix;
          stack.push({open: '\\begin', name: env, columns: 1, cell: false});
          if (env === 'array' || env === 'alignedat') needs.push({command: '\\begin{' + env + '}', remaining: 1, depth: stack.length});
        }
        name = undefined;
        remember(closing ? '}' : '');
      } else {
        name.prefix += token;
        const names = name.command === '\\end' ? [frame?.name ?? ''] : ENVIRONMENTS;
        if (!names.some(env => env.startsWith(name!.prefix))) {malformed = true; break;}
      }
      continue;
    }
    if (need?.command === '\\begin' || need?.command === '\\end') {
      if (token !== '{') {malformed = true; break;}
      name = {command: need.command, prefix: ''};
      satisfy();
      continue;
    }
    if (need?.command === '\\sqrt' && !need.index && token === '[') {
      need.index = true;
      stack.push({open: '['});
    } else if (token === '{') {
      stack.push({open: '{', argument: !!need});
    } else if (need) {
      if (!['^', '_', '\\sqrt'].includes(need.command) || !isAtom(token)) {malformed = true; break;}
      satisfy();
      markCell();
    } else if (token in CLOSERS) {
      if (frame?.open !== CLOSERS[token]) {malformed = true; break;}
      stack.pop();
      if (frame?.argument) satisfy();
      markCell();
    } else if (token === '[' || token === '(') {
      stack.push({open: token});
    } else if (token === '\\left' || token === '\\right') {
      if (token === '\\right' && frame?.open !== '\\left') {malformed = true; break;}
      delimiter = token;
    } else if (token === '\\end') {
      if (!frame?.name || !canEnd(frame) || !cellComplete(last)) {malformed = true; break;}
      needs.push({command: token, remaining: 1, depth: stack.length});
    } else if (isSeparator(token)) {
      if (!canSeparate(frame, token) || !cellComplete(last)) {malformed = true; break;}
      if (token === '&') frame!.columns = (frame!.columns ?? 1) + 1;
      else {
        frame!.expectedColumns ??= frame!.columns;
        frame!.columns = 1;
      }
      frame!.cell = false;
    } else if (token === '^' || token === '_') {
      needs.push({command: token, remaining: 1, depth: stack.length});
    } else if (token in ARGUMENTS) {
      needs.push({command: token, remaining: ARGUMENTS[token], depth: stack.length});
    } else {
      markCell();
    }
    remember(token);
  }
  const waiting = due();
  const frame = top();
  return {stack: stack.map(item => item.open), pending: waiting?.remaining ?? 0, command: waiting?.command ?? '',
    last, beforeLast, malformed, name, delimiter,
    ...(frame?.name ? {environment: {name: frame.name, columns: frame.columns ?? 1, expectedColumns: frame.expectedColumns, cell: !!frame.cell}} : {})};
}

type Cell = {name?: Environment; columns?: number; expectedColumns?: number; cell?: boolean};
const canEnd = (env: Cell) => !!env.cell && (env.expectedColumns === undefined || env.columns === env.expectedColumns);
function canSeparate(env: Cell | undefined, token: string): boolean {
  if (!env?.name || !env.cell) return false;
  if (token === ROW) return canEnd(env);
  if (env.name === 'gathered') return false;
  const cap = env.expectedColumns ?? (env.name === 'cases' ? 2 : Infinity);
  return (env.columns ?? 1) < cap;
}

export function latexAllows(state: LatexState, token: string): boolean {
  const {stack, pending, last} = state;
  const top = stack.at(-1);
  if (state.malformed) return false;
  if (state.delimiter) return DELIMITERS.has(token);
  if (state.name) {
    const names: readonly string[] = state.name.command === '\\end' ? [state.environment?.name ?? ''] : ENVIRONMENTS;
    return token === '}' ? names.includes(state.name.prefix) : names.some(name => name.startsWith(state.name!.prefix + token));
  }
  if (pending > 0) {
    if (token === '{') return true;
    return ['^', '_', '\\sqrt'].includes(state.command) && isAtom(token) ||
      state.command === '\\sqrt' && token === '[' && last === '\\sqrt';
  }
  if (token in CLOSERS) return top === CLOSERS[token];
  if (token === '\\right') return top === '\\left';
  if (token === '\\end') return !!state.environment && canEnd(state.environment) && cellComplete(last);
  if (isSeparator(token)) return canSeparate(state.environment, token) && cellComplete(last);
  if (last === '&' && state.environment && ALIGNMENT.has(state.environment.name) && RELATIONS.has(token)) return true;
  if (token === '^' || token === '_' || RELATIONS.has(token) || BINARY.has(token)) {
    return !isStart(last) && !RELATIONS.has(last) && !BINARY.has(last) && !['^', '_', '+', '-'].includes(last);
  }
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
const BINDERS = new Set(['\\forall', '\\exists', '\\lambda', '\\sum', '\\prod']);
const AMBIENT = new Set(['\\subset', '\\subseteq', '\\in', '⊂', '⊆', '∈']);
const IDENTIFIER = /^(?:[A-Za-zα-ωΑ-Ω]|\\[A-Za-z]+)(?:_(?:[A-Za-z0-9]|\{[A-Za-z0-9]+\}))?$/u;

const ROLE_TOKEN = /\\[A-Za-z]+(?:_(?:[A-Za-z0-9]|\{[A-Za-z0-9]+\}))?|[A-Za-zα-ωΑ-Ω](?:_(?:[A-Za-z0-9]|\{[A-Za-z0-9]+\}))?|\\.|[^\s]/gu;
function bodyTokens(math: string): string[] {
  return math.replace(/\\(?:begin|end)\{[A-Za-z]+\}/g, match => match.startsWith('\\begin') ? '{' : '}').match(ROLE_TOKEN) ?? [];
}

/** Quantifiers introduce a declared binder with the same symbol and active parent. Ambiguity carries no extra evidence. */
export function activeSymbolDeclarations(math: string, declarations: readonly DeclaredSymbol[]): DeclaredSymbol[] {
  const tokens = bodyTokens(math);
  const active: {id: string; depth: number}[] = [];
  let depth = 0;
  let binding: number | undefined;
  for (const token of tokens) {
    if (isSeparator(token) || token === ';') {
      while (active.length && active[active.length - 1].depth >= depth) active.pop();
      binding = undefined;
      continue;
    }
    if (token in CLOSERS || token === '\\right') {
      depth = Math.max(0, depth - 1);
      while (active.length && active[active.length - 1].depth > depth) active.pop();
      binding = undefined;
      continue;
    }
    if (token === '{' || token === '(' || token === '[' || token === '\\left') depth++;
    if (binding !== undefined && IDENTIFIER.test(token) && !BINDERS.has(token)) {
      const parent = active.at(-1)?.id;
      const matching = new Set(declarations.filter(item => item.symbol === token && item.binder && item.binder.parent === parent)
        .map(item => item.binder!.id));
      if (matching.size === 1) active.push({id: [...matching][0], depth: binding});
      binding = undefined;
    } else if (BINDERS.has(token)) binding = depth;
    else if (!['{', '_'].includes(token)) binding = undefined;
  }
  const rank = new Map<string | undefined, number>([[undefined, 0], ...active.map(({id}, index) => [id, index + 1] as const)]);
  const selected = new Map<string, {depth: number; values: DeclaredSymbol[]}>();
  for (const item of declarations) {
    const index = rank.get(item.binder?.id);
    if (index === undefined) continue;
    const previous = selected.get(item.symbol);
    if (!previous || previous.depth < index) selected.set(item.symbol, {depth: index, values: [item]});
    else if (previous.depth === index) previous.values.push(item);
  }
  return [...selected.values()].map(({values}) => {
    const first = values[0];
    const keys = ['role', 'ambient', 'domain', 'codomain'] as const;
    return values.every(value => keys.every(key => first[key] === value[key])) ? first : {symbol: first.symbol, role: 'unknown'};
  });
}

/** A declaration supplies ranking evidence for a relation the learner typed. */
export function declaredOperand(math: string, declarations: readonly DeclaredSymbol[]): string | undefined {
  const tokens = bodyTokens(math);
  const bySymbol = new Map(activeSymbolDeclarations(math, declarations).map(entry => [entry.symbol, entry]));
  const last = tokens.at(-1), subject = tokens.at(-2);
  if (AMBIENT.has(last ?? '') && subject) {
    const entry = bySymbol.get(subject);
    return entry?.role === 'set' || entry?.role === 'bound' ? entry.ambient : undefined;
  }
  if (last === ':' && subject) {
    const entry = bySymbol.get(subject);
    return entry?.role === 'map' ? entry.domain : undefined;
  }
  const map = bySymbol.get(tokens.at(-4) ?? '');
  return (last === '\\to' || last === '→') && tokens.at(-3) === ':' && map?.role === 'map' && map.domain === subject ? map.codomain : undefined;
}

export type LatexSuggestionOptions = Readonly<{
  after?: string;
  modelCandidates?: readonly LatexSuggestion[];
  declarations?: readonly DeclaredSymbol[];
  knownSymbols?: readonly string[];
  eligible?: (suggestion: LatexSuggestion) => boolean;
  adjustment?: (suggestion: LatexSuggestion) => number;
}>;

export function latexCommandPrefix(math: string, after = ''): string {
  const token = latexControlWordPrefix(math);
  return !/^[A-Za-z]/.test(after) && (token in ARGUMENTS || token === '\\left' || token === '\\right') ? '' : token;
}

/** Structural continuations plus model proposals, completed at the caret after any typed command prefix. */
export function latexSuggestions(math: string, typed: string, before: string, limit = 3, options: LatexSuggestionOptions = {}): LatexSuggestion[] {
  const complete = typed ? math.slice(0, -typed.length) : math;
  const raw = latexTokens(complete);
  const state = latexState(raw);
  if (state.malformed) return [];
  const out = structural(state, typed, options.after ?? '');
  const model = options.modelCandidates === undefined ? latexModel() : null;
  if (options.modelCandidates?.length) out.push(...options.modelCandidates);
  const expected = declaredOperand(complete, options.declarations ?? []);
  const variables = [...new Set([...(options.knownSymbols ?? []), ...decoderSymbols(before + ' ' + complete)])].slice(0, 12);
  if (model && !state.name) addModelCandidates(out, model, raw.map(modelToken), state, variables, typed, options.after ?? '');
  const seen = new Set<string>();
  return out.filter(item => options.eligible?.(item) ?? true)
    .map(item => ({...item, score: item.score + (item.insert.trim() === expected ? Math.log(2) : 0) + (options.adjustment?.(item) ?? 0)}))
    .sort((a, b) => b.score - a.score)
    .filter(item => !seen.has(item.insert) && seen.add(item.insert))
    .slice(0, limit);
}

function structural(state: LatexState, typed: string, after: string): LatexSuggestion[] {
  if (typed) return [];
  const names = state.name ?? (['\\begin', '\\end'].includes(state.command) ? {command: state.command, prefix: ''} : undefined);
  if (names) {
    if (state.name && /^[A-Za-z]/.test(after)) return [];
    const possible = names.command === '\\end' ? [state.environment?.name ?? ''] : ENVIRONMENTS;
    return possible.filter(name => name && name.startsWith(names.prefix)).map((name, index) => {
      const append = (state.name ? name.slice(names.prefix.length) : '{' + name) + (after.startsWith('}') ? '' : '}');
      const close = '\\end{' + name + '}';
      const insert = names.command === '\\begin' && !after.trimStart().startsWith(close) && !after.startsWith('}') ? append + close : append;
      return {insert, caret: append.length, label: '{' + name + '}', score: -index - .1};
    }).filter(({insert}) => !!insert);
  }
  if (state.delimiter) {
    const pairs = [['(', ')'], ['[', ']'], ['\\{', '\\}'], ['\\langle', '\\rangle'], ['|', '|']];
    if (state.delimiter === '\\right') return pairs.map(([, closer], index) => ({insert: closer, caret: closer.length, label: closer, score: -index - .2}));
    return pairs.map(([opener, closer], index) => ({insert: opener + '\\right' + closer, caret: opener.length, label: opener, score: -index - .2}));
  }
  if (state.pending && latexAllows(state, '{')) {
    return latexAllows(state, '[') ? [pairSuggestion('{', 0, after), pairSuggestion('[', -.4, after)]
      : [pairSuggestion('{', 0, after)];
  }
  return [];
}

function pairSuggestion(token: string, score: number, after: string): LatexSuggestion {
  const pair = OPENERS[token];
  const insert = after.trimStart().startsWith(pair[1]) ? token : pair;
  return {insert, caret: 1, label: token, score};
}

/** Allocate a lexical class's mass only once across its eligible identifiers. */
export function latexIdentifierWeights(count: number): number[] {
  const weights = Array.from({length: count}, (_, index) => 1 / (index + 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map(weight => weight / total);
}

function addModelCandidates(out: LatexSuggestion[], model: NgramModel, tokens: readonly string[], state: LatexState,
  variables: readonly string[], typed: string, after: string) {
  const width = historyWidth(model);
  const ids = tokens.slice(-width).map(token => model.id.get(token) ?? 3);
  while (ids.length < width) ids.unshift(0);
  for (const id of historyNext(model, ids)) {
    const token = model.words[id];
    if (id <= 4 || !token || (typed && !token.startsWith(typed)) || token === typed || token === '<num>') continue;
    const score = historyLog(model, id, ids);
    if (token === '<latin>') {
      if (!typed) {
        const eligible = variables.filter(symbol => IDENTIFIER.test(symbol) && latexAllows(state, symbol));
        const weights = latexIdentifierWeights(eligible.length);
        eligible.forEach((symbol, index) => {
          const insert = symbol.startsWith('\\') ? symbol + ' ' : symbol;
          out.push({insert, caret: insert.length, label: symbol, score: score + Math.log(weights[index])});
        });
      }
      continue;
    }
    if (state.delimiter || !latexAllows(state, token)) continue;
    if ((token in CLOSERS || token === '\\right' || token === '\\end') && after.trimStart().startsWith(token)) continue;
    if (token in OPENERS) {out.push(pairSuggestion(token, score, after)); continue;}
    const insert = token.startsWith('\\') && /[A-Za-z]$/.test(token) && !(token in ARGUMENTS) && token !== '\\left' && token !== '\\right'
      ? token + ' ' : token;
    out.push({insert, caret: insert.length, label: token, score});
  }
}

/**
 * The maths being typed: the text of the unfinished $…$ before a collapsed caret, and the command in progress at its end
 * (`\\fr`). The replacement range covers the full command around the caret. Null outside an unfinished or open maths span.
 */
export function unfinishedMath(edit: PadEdit): {math: string; typed: string; start: number; end: number} | null {
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
    const typed = latexCommandPrefix(math, edit.text.slice(edit.end, mathEnd));
    const end = typed ? latexCommandEnd(edit.text, edit.end) : edit.end;
    return {math, typed, start: edit.start - typed.length, end};
  }
  return null;
}
