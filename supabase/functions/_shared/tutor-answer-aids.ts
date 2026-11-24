/**
 * N234 (Owner: "since tutor is aware of questions he can provide lot safe phrases that can act like boiler plate"): the
 * answer aids a tutor attaches to a reply it gave. The keyboard uses them while the learner writes the next answer.
 * These checks mirror the database's validators, so the tutor
 * hears about a problem before Lemma refuses it.
 */
export const ANSWER_AID_LEVELS = ['scaffold', 'light', 'none'] as const;
export type AnswerAidLevel = typeof ANSWER_AID_LEVELS[number];
export type AidEntryKind = 'word' | 'phrase' | 'symbol';
export type AidPriority = 'prefer' | 'neutral' | 'deemphasize';
export type AidRole = 'given' | 'learner' | 'neutral' | 'alternative' | 'goal';
export type AidScope = Readonly<{
  subject?: string; step?: string; mode?: 'prose' | 'equation';
  prefixes?: readonly string[]; phraseStates?: readonly string[];
}>;
export type AidHint = Readonly<{
  id: string; entry: string; kind: AidEntryKind; aliases?: readonly string[];
  priority: AidPriority; role: AidRole; scope?: AidScope;
}>;
export type DeclaredSymbol = Readonly<{
  symbol: string; role: 'set' | 'map' | 'ambient' | 'bound' | 'unknown';
  ambient?: string; domain?: string; codomain?: string;
  binder?: Readonly<{id: string; parent?: string}>;
}>;
export type AidRanking = Readonly<{
  version: 1; hints?: readonly AidHint[]; declaredSymbols?: readonly DeclaredSymbol[];
}>;
export type TutorAnswerAid = Readonly<{
  id: string; turnId: string; level: AnswerAidLevel;
  /** Prose scaffolding the learner may want (openers, connectives between given facts, closing lines). No maths markup. */
  wording: readonly string[];
  /** Words and short noun phrases of the question, offered once a letter is typed. */
  terms: readonly string[];
  /** Variables and short expressions of the question. */
  symbols: readonly string[];
  /** Terms that would reveal the method, a witness or the conclusion: never suggested, at any prefix. */
  withhold: readonly string[];
  ranking?: AidRanking; grantId?: string; guardsUnavailable?: true;
  version: number; createdAt?: string; updatedAt?: string;
}>;
export type AnswerAidDraft = Readonly<{level?: AnswerAidLevel; wording?: readonly string[]; terms?: readonly string[];
  symbols?: readonly string[]; withhold?: readonly string[]; ranking?: AidRanking}>;

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const WORDING = /^[^$\\^_={}<>]+$/u;
const TERM = /^[A-Za-z][A-Za-z -]*$/u;
const SYMBOL = /^[A-Za-z0-9\\{}^_()+*/=<>.,' -]+$/u;

function listIssues(name: string, value: unknown, items: number, chars: number, pattern: RegExp): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > items) return [name + ' must be a list of up to ' + items];
  const issues: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry, at) => {
    if (typeof entry !== 'string' || entry.length < 1 || [...entry].length > chars || !/\S/.test(entry) || pattern.exec(entry)?.[0] !== entry) {
      issues.push(name + '.' + at + ' must be 1 to ' + chars + ' characters' + (name === 'wording' ? ' with no maths markup ($ \\ ^ _ = { } < >)' : ''));
    } else if (seen.has(entry.toLowerCase())) issues.push(name + '.' + at + ' is repeated');
    else seen.add(entry.toLowerCase());
  });
  return issues;
}

/** What is wrong with answer aids the tutor sent; empty when they are valid. */
export function answerAidIssues(input: unknown): string[] {
  if (!record(input)) return ['the answer aids must be an object'];
  const issues: string[] = [];
  for (const key of Object.keys(input)) if (!['level', 'wording', 'terms', 'symbols', 'withhold', 'ranking'].includes(key)) issues.push('unexpected field ' + key);
  if (input.level !== undefined && !ANSWER_AID_LEVELS.includes(input.level as AnswerAidLevel)) issues.push('level must be one of ' + ANSWER_AID_LEVELS.join(', '));
  issues.push(...listIssues('wording', input.wording, 24, 80, WORDING), ...listIssues('terms', input.terms, 40, 40, TERM),
    ...listIssues('symbols', input.symbols, 16, 24, SYMBOL), ...listIssues('withhold', input.withhold, 24, 40, TERM));
  if (input.ranking !== undefined && !validAidRanking(input.ranking)) issues.push('invalid ranking version, entry, scope or symbol declaration');
  if (!issues.length) {
    const withheld = ((input.withhold as string[] | undefined) ?? []).map(word => word.toLowerCase());
    for (const entry of [...(input.wording as string[] | undefined ?? []), ...(input.terms as string[] | undefined ?? [])]) {
      const hit = withheld.find(word => entry.toLowerCase().includes(word));
      if (hit) issues.push('"' + entry + '" contains the withheld term "' + hit + '"');
    }
  }
  return issues;
}

const keys = (input: unknown, allowed: readonly string[]): input is Record<string, unknown> =>
  record(input) && Object.keys(input).every(key => allowed.includes(key));
const matches = (value: unknown, size: number, pattern: RegExp): value is string =>
  typeof value === 'string' && [...value].length <= size && pattern.exec(value)?.[0] === value;
const optional = (value: unknown, size: number, pattern: RegExp) => value === undefined || matches(value, size, pattern);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u;
const WORD = /^\p{L}[\p{L}\p{M}'’‐‑-]*$/u;
const PHRASE = /^\p{L}[\p{L}\p{M}\p{Nd} ,.;!?'’‐‑-]*$/u;
const IDENTIFIER = /^(?:[A-Za-zα-ωΑ-Ω]|\\[A-Za-z]+)(?:_(?:[A-Za-z0-9]|\{[A-Za-z0-9]+\}))?$/u;
const PREFIX = /^[\p{L}\p{M}\p{Nd}\\{}^_()+*/=<>.,'’ ‐‑-]+$/u;
const RANK_SYMBOL = /^(?:(?:[A-Za-z]|\\[A-Za-z]+)(?:_(?:[A-Za-z0-9]|\{[A-Za-z0-9]+\}))?|[=<>+*/\-α-ωΑ-Ω←-⇿∀-⋿])$/u;
const patterns = {word: WORD, phrase: PHRASE, symbol: RANK_SYMBOL};

function validScope(input: unknown): boolean {
  return keys(input, ['subject', 'step', 'mode', 'prefixes', 'phraseStates']) &&
    optional(input.subject, 80, ID) && optional(input.step, 80, ID) &&
    (input.mode === undefined || input.mode === 'prose' || input.mode === 'equation') &&
    !listIssues('prefixes', input.prefixes, 12, 32, PREFIX).length &&
    !listIssues('phraseStates', input.phraseStates, 12, 80, PHRASE).length;
}

function validHint(input: unknown): input is AidHint {
  if (!keys(input, ['id', 'entry', 'kind', 'aliases', 'priority', 'role', 'scope']) ||
      !matches(input.id, 64, ID) ||
      (input.kind !== 'word' && input.kind !== 'phrase' && input.kind !== 'symbol') ||
      !['prefer', 'neutral', 'deemphasize'].includes(input.priority as string) ||
      !['given', 'learner', 'neutral', 'alternative', 'goal'].includes(input.role as string)) return false;
  const pattern = patterns[input.kind];
  return matches(input.entry, 80, pattern) && !listIssues('aliases', input.aliases, 8, 80, pattern).length &&
    (input.scope === undefined || validScope(input.scope));
}

function validDeclaration(input: unknown): input is DeclaredSymbol {
  return keys(input, ['symbol', 'role', 'ambient', 'domain', 'codomain', 'binder']) &&
    matches(input.symbol, 24, IDENTIFIER) && ['set', 'map', 'ambient', 'bound', 'unknown'].includes(input.role as string) &&
    optional(input.ambient, 24, IDENTIFIER) && optional(input.domain, 24, IDENTIFIER) && optional(input.codomain, 24, IDENTIFIER) &&
    (input.role !== 'bound' || input.binder !== undefined) &&
    (input.binder === undefined || (keys(input.binder, ['id', 'parent']) &&
      matches(input.binder.id, 64, ID) && optional(input.binder.parent, 64, ID) && input.binder.id !== input.binder.parent));
}

/** Stable identity for scoring repeated scoped hints. LaTeX identifiers are case-sensitive. */
export const aidEntryKey = (kind: AidEntryKind, entry: string): string =>
  kind + ':' + (kind === 'symbol' ? entry : entry.normalize('NFKC').toLowerCase().replace(/ +/g, ' ').trim());

export function validAidRanking(input: unknown): input is AidRanking {
  if (!keys(input, ['version', 'hints', 'declaredSymbols']) || input.version !== 1 ||
      (input.hints !== undefined && (!Array.isArray(input.hints) || input.hints.length > 32 || !input.hints.every(validHint))) ||
      (input.declaredSymbols !== undefined && (!Array.isArray(input.declaredSymbols) ||
        input.declaredSymbols.length > 32 || !input.declaredSymbols.every(validDeclaration))) ||
      new TextEncoder().encode(JSON.stringify(input)).length > 14_000) return false;
  const ids = new Map<string, string>();
  const entries = new Map<string, string>();
  for (const hint of (input.hints ?? []) as AidHint[]) {
    const entry = aidEntryKey(hint.kind, hint.entry);
    if (ids.has(hint.id) && ids.get(hint.id) !== entry || entries.has(entry) && entries.get(entry) !== hint.id) return false;
    ids.set(hint.id, entry);
    entries.set(entry, hint.id);
  }
  for (const hint of (input.hints ?? []) as AidHint[]) {
    for (const alias of hint.aliases ?? []) {
      const entry = aidEntryKey(hint.kind, alias);
      if (entries.has(entry) && entries.get(entry) !== hint.id) return false;
      entries.set(entry, hint.id);
    }
  }
  const binders = new Map<string, string | undefined>();
  for (const {binder} of (input.declaredSymbols ?? []) as DeclaredSymbol[]) {
    if (!binder) continue;
    if (binders.has(binder.id) && binders.get(binder.id) !== binder.parent) return false;
    binders.set(binder.id, binder.parent);
  }
  for (const id of binders.keys()) {
    const seen = new Set<string>();
    let key: string | undefined = id;
    while (key) {
      if (seen.has(key) || !binders.has(key)) return false;
      seen.add(key);
      key = binders.get(key);
    }
  }
  return true;
}

/** Read legacy and current records. A future or invalid ranking stays neutral, retaining legacy guard metadata. */
export function readAnswerAid(input: unknown): TutorAnswerAid | undefined {
  if (!record(input)) return undefined;
  const {id, turnId, level, wording, terms, symbols, withhold, version, ranking, grantId, createdAt, updatedAt} = input;
  if (typeof id !== 'string' || !id || typeof turnId !== 'string' || !turnId ||
      typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return undefined;
  const guardsValid = withhold !== undefined && !listIssues('withhold', withhold, 24, 40, TERM).length;
  const legacyValid = guardsValid && level !== undefined &&
    [wording, terms, symbols].every(Array.isArray) && !answerAidIssues({level, wording, terms, symbols, withhold}).length;
  return {id, turnId, level: legacyValid ? level as AnswerAidLevel : 'none',
    wording: legacyValid ? wording as string[] : [], terms: legacyValid ? terms as string[] : [],
    symbols: legacyValid ? symbols as string[] : [], withhold: guardsValid ? withhold as string[] : [], version,
    ...(!guardsValid ? {guardsUnavailable: true as const} : {}),
    ...(legacyValid && validAidRanking(ranking) ? {ranking} : {}),
    ...(typeof grantId === 'string' && UUID.test(grantId) ? {grantId} : {}),
    ...(typeof createdAt === 'string' ? {createdAt} : {}),
    ...(typeof updatedAt === 'string' ? {updatedAt} : {})};
}

/**
 * How much of the aids the keyboard may use, from how well the learner knows the concept (0 to 1, the Atlas's ability
 * estimate): the tutor's level is a ceiling that fades as mastery grows (the expertise-reversal effect).
 */
export function effectiveAidLevel(level: AnswerAidLevel, mastery: number | undefined): AnswerAidLevel {
  if (level === 'none' || mastery === undefined || !Number.isFinite(mastery)) return level;
  if (mastery >= .85) return 'none';
  if (mastery >= .6 && level === 'scaffold') return 'light';
  return level;
}
