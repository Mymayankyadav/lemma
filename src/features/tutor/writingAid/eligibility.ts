import type {AidRole, TutorAnswerAid} from '../../../../supabase/functions/_shared/tutor-answer-aids';

const CHOICE = /^(?:no|not|or|if|only|all|some|any|neither|never|contradiction|contrapositive|induction|injective|surjective|bijective|infinite|finite|nonempty|empty|zero|nonzero|positive|negative|unique|uniqueness|compact|compactness|continuous|discontinuous|unbounded|bounded|converges?|convergent|convergence|diverges?|divergent|divergence|contradicts|witness|true|false|greater|less|every|exists|inverse|proof|prove[sd]?|proving|prime|composite|property|properties|counterexample|theorem|lemma|sufficient|necessary|equivalent|implies|integer|rational|irrational|even|odd|commutative|associative|distributive|invertible|singular|nonsingular|symmetric|antisymmetric|reflexive|transitive|irreflexive|countable|uncountable|measurable|monotone|increasing|decreasing|differentiable|integrable|closed|open|dense|separable|complete|completeness|connected|disconnected|distinct|equal|unequal|idempotent|coprime|independent|dependent|linear|nonlinear|convex|concave)$/iu;
const STEERING = /^(?:because|by|as|since|so|hence|thus|therefore|then|consequently|implies|implying|whence|thereby|follows|clearly|obviously|trivially|suppose|assume|assuming|wlog)$/iu;
const OPERAND = /(?:\b(?:take|choose|witness|there exists|equals?|by|implies|belongs to|is a subset of)|[=<>≤≥∈∉⊆⊂≠∀∃⇒⇔¬]|\\(?:in|notin|subset|subseteq|supset|supseteq|neq|ne|eq|le|leq|ge|geq|lt|gt|approx|sim|equiv|implies|Rightarrow|to|mapsto|forall|exists))\s*$/u;
const CHOICE_WORDS = CHOICE.source.slice(4, -2).split('|').filter(word => /^\p{L}+$/u.test(word));

export const aidWords = (value: string): string[] =>
  value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];

function withheldAcrossInsertion(text: string, start: number, end: number, insert: string, withheld: readonly string[]): boolean {
  if (!withheld.length) return false;
  // Token adjacency can span arbitrary spaces or punctuation in the bounded
  // draft. Only compare token sequences whose source span touches the edit.
  const tokens = [...(text.slice(0, start) + insert + text.slice(end)).matchAll(/[\p{L}\p{M}\p{N}]+/gu)];
  const from = start, to = start + insert.length;
  return withheld.some(entry => {
    const wanted = aidWords(entry);
    if (!wanted.length) return false;
    for (let i = 0; i + wanted.length <= tokens.length; i++) {
      const first = tokens[i], last = tokens[i + wanted.length - 1];
      if (first.index >= to || last.index + last[0].length <= from) continue;
      if (wanted.every((word, offset) => aidWords(tokens[i + offset][0])[0] === word)) return true;
    }
    return false;
  });
}

export interface InsertionContext {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly insert: string;
  readonly mode: 'prose' | 'equation';
  readonly aid?: TutorAnswerAid | null;
  /** Text in the replacement span independently typed by the learner. */
  readonly authoredPrefix?: string;
  readonly role?: AidRole;
  readonly tagged?: boolean;
  readonly notation?: boolean;
}

/** Run this on the exact editor insertion, independently of its source or score. */
export function insertionEligible(context: InsertionContext): boolean {
  const {text, start, end, insert, aid, role, mode} = context;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || end > text.length ||
      !insert || aid?.guardsUnavailable || withheldAcrossInsertion(text, start, end, insert, aid?.withhold ?? [])) return false;
  const prior = text.slice(0, start);
  const authored = context.authoredPrefix ?? '';
  const written = aidWords(authored);
  const proposed = aidWords(insert);
  if ((mode === 'equation' || context.notation) && OPERAND.test(prior) && !/[\p{L}\p{N}]/u.test(authored) &&
      /[\p{L}\p{N}]/u.test(insert) && !/^(?:\{\}|\\(?:right|end)\b)/u.test(insert)) return false;
  if (mode === 'prose' && OPERAND.test(prior) && !authored.trim() && proposed.length) return false;
  if (mode === 'equation' || context.notation) {
    if (role !== 'alternative' && role !== 'goal') return true;
    const typed = authored.trim(), offered = insert.trim().replace(/^\$|\$$/gu, '');
    return offered === typed && typed.length > 0 ||
      typed.length >= 3 && offered.startsWith(typed) && typed.length / offered.length >= .75;
  }

  // Recognize the full resulting word when a ghost extends an already-typed
  // stem. Independently supported later words can survive a rewrite unchanged.
  const stem = start === end ? /[\p{L}\p{M}]+$/u.exec(prior)?.[0] : undefined;
  const join = stem && authored.endsWith(stem) && /^[\p{L}\p{M}]/u.test(insert) ? stem : '';
  const words = join ? aidWords(join + insert) : proposed;
  return words.every((word, index) => {
    const typed = written[index] ?? '';
    if (typed === word) return true;
    if (role === 'alternative' || role === 'goal') {
      return Boolean(typed && word.startsWith(typed) && typed.length >= 3 && typed.length / word.length >= .75);
    }
    if (STEERING.test(word)) return word.startsWith(typed) && typed.length >= 5 && typed.length / word.length >= .8;
    if (!CHOICE.test(word) && !(index === 0 && context.tagged)) return true;
    return Boolean(typed && word.startsWith(typed) && (
      typed.length >= 5 && typed.length / word.length >= .8 ||
      typed.length >= 3 && !CHOICE_WORDS.some(other => other !== word && other.startsWith(typed))
    ));
  });
}

const SOURCED_LINE = /(?:^|\s)(?:tutor|teacher|instructor|assistant|solution|system|code|prompt|quotation)\s*:|\b(?:tutor|teacher|assistant|book|solution|prompt)\s+(?:said|says|wrote|asked|suggested|mentions?|mentioned|gives?|gave)\b/iu;
const LITERAL_LINE = /(?:search|identifier|code|literal|verbatim|product|brand|named|called)\b[^.!?\n]*$/iu;

export function hasOpenLiteral(text: string): boolean {
  const line = text.slice(text.lastIndexOf('\n') + 1);
  return (text.match(/(?<!\\)`/gu)?.length ?? 0) % 2 === 1 ||
    (line.match(/(?<!\\)"/gu)?.length ?? 0) % 2 === 1 ||
    (line.match(/“/gu)?.length ?? 0) > (line.match(/”/gu)?.length ?? 0) ||
    (line.match(/‘/gu)?.length ?? 0) > (line.match(/’/gu)?.length ?? 0) ||
    /(?:^|\s)'[^']*$/u.test(line) || SOURCED_LINE.test(line) || LITERAL_LINE.test(line);
}
