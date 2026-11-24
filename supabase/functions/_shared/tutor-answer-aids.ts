/**
 * N234 (Owner: "since tutor is aware of questions he can provide lot safe phrases that can act like boiler plate"): the
 * answer aids a tutor attaches to a reply it gave. The keyboard uses them while the learner writes the next answer.
 * These checks mirror the database's (tutor_answer_aid_valid in 20261218002700_n234_tutor_answer_aids.sql), so the tutor
 * hears about a problem before Lemma refuses it.
 */
export const ANSWER_AID_LEVELS = ['scaffold', 'light', 'none'] as const;
export type AnswerAidLevel = typeof ANSWER_AID_LEVELS[number];
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
  version: number; createdAt?: string; updatedAt?: string;
}>;
export type AnswerAidDraft = Readonly<{level?: AnswerAidLevel; wording?: readonly string[]; terms?: readonly string[];
  symbols?: readonly string[]; withhold?: readonly string[]}>;

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const WORDING = /^[^$\\^_={}<>]+$/u;
const TERM = /^[A-Za-z][A-Za-z -]*$/u;
const SYMBOL = /^[A-Za-z0-9\\{}^_()+*/=<>.,' -]+$/u;

function listIssues(name: string, value: unknown, items: number, chars: number, pattern: RegExp): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > items) return [name + ' must be a list of up to ' + items];
  const issues: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry, at) => {
    if (typeof entry !== 'string' || entry.length < 1 || entry.length > chars || !/\S/.test(entry) || !pattern.test(entry)) {
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
  for (const key of Object.keys(input)) if (!['level', 'wording', 'terms', 'symbols', 'withhold'].includes(key)) issues.push('unexpected field ' + key);
  if (input.level !== undefined && !ANSWER_AID_LEVELS.includes(input.level as AnswerAidLevel)) issues.push('level must be one of ' + ANSWER_AID_LEVELS.join(', '));
  issues.push(...listIssues('wording', input.wording, 24, 80, WORDING), ...listIssues('terms', input.terms, 40, 40, TERM),
    ...listIssues('symbols', input.symbols, 16, 24, SYMBOL), ...listIssues('withhold', input.withhold, 24, 40, TERM));
  if (!issues.length) {
    const withheld = ((input.withhold as string[] | undefined) ?? []).map(word => word.toLowerCase());
    for (const entry of [...(input.wording as string[] | undefined ?? []), ...(input.terms as string[] | undefined ?? [])]) {
      const hit = withheld.find(word => entry.toLowerCase().includes(word));
      if (hit) issues.push('"' + entry + '" contains the withheld term "' + hit + '"');
    }
  }
  return issues;
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
