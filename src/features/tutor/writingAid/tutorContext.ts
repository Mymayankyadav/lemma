/** A bounded, current-turn view of tutor material. It is never stored by the keyboard. */
export type TutorWritingRole = 'prompt' | 'given' | 'suggested-wording' | 'hint' | 'proof' | 'solution' | 'unknown';
export interface TutorWritingSignal {
  readonly id: string;
  readonly sourceId: string;
  readonly role: TutorWritingRole;
  readonly text: string;
  readonly variables?: readonly string[];
  readonly symbols?: readonly string[];
}
export interface TutorWritingContext {
  readonly version: 1;
  readonly revision: string;
  readonly signals: readonly TutorWritingSignal[];
}
export interface TutorWritingEvidence {
  readonly kind: 'tutor-context';
  readonly sourceId: string;
  readonly signalId: string;
  readonly role: TutorWritingRole;
  readonly learnerStart: number;
  readonly learnerEnd: number;
  readonly matchedCharacters: number;
  readonly maxOutputCharacters: number;
  readonly maxOutputWords: number;
}
export interface TutorWritingOptions {
  readonly terms?: boolean;
  readonly wording?: boolean;
  readonly symbols?: boolean;
  readonly strategy?: 'frequency' | 'contextual';
}

const ROLES = new Set<TutorWritingRole>(['prompt', 'given', 'suggested-wording', 'hint', 'proof', 'solution', 'unknown']);
const ID = /^[^\u0000-\u001f\u007f]{1,128}$/u;
const VARIABLE = /^[\p{L}][\p{L}\p{M}\p{N}_]{0,31}$/u;
const SYMBOL = /^(?:\\[A-Za-z]{1,16}|\p{L}|[^\p{L}\p{N}\s\u0000-\u001f\u007f]{1,8})$/u;

/** Bind source IDs to the actual reply, not a source claimed by generated text. */
export function normalizeTutorWritingContext(raw: unknown, trustedSourceId?: string): TutorWritingContext | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      (trustedSourceId !== undefined && !ID.test(trustedSourceId))) return null;
  const input = raw as Record<string, unknown>;
  if (input.version !== 1 || typeof input.revision !== 'string' || !ID.test(input.revision) ||
      !Array.isArray(input.signals) || input.signals.length > 12) return null;
  const signals: TutorWritingSignal[] = [], ids = new Set<string>();
  let source = trustedSourceId;
  for (const rawSignal of input.signals) {
    if (!rawSignal || typeof rawSignal !== 'object' || Array.isArray(rawSignal)) return null;
    const item = rawSignal as Record<string, unknown>;
    const sourceId = trustedSourceId ?? item.sourceId;
    if (typeof item.id !== 'string' || !ID.test(item.id) || ids.has(item.id) ||
        typeof sourceId !== 'string' || !ID.test(sourceId) || (source && source !== sourceId) ||
        typeof item.role !== 'string' || !ROLES.has(item.role as TutorWritingRole) ||
        typeof item.text !== 'string' || !item.text.trim() || item.text.length > 240 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(item.text)) return null;
    const arrays = [item.variables, item.symbols];
    if (arrays.some(value => value !== undefined && (!Array.isArray(value) || value.length > 16))) return null;
    const variables = item.variables as unknown[] | undefined, symbols = item.symbols as unknown[] | undefined;
    if (variables?.some(value => typeof value !== 'string' || !VARIABLE.test(value)) ||
        symbols?.some(value => typeof value !== 'string' || !SYMBOL.test(value))) return null;
    ids.add(item.id); source = sourceId;
    signals.push({id: item.id, sourceId, role: item.role as TutorWritingRole, text: item.text.trim(),
      ...(variables ? {variables: [...variables] as string[]} : {}),
      ...(symbols ? {symbols: [...symbols] as string[]} : {})});
  }
  return {version: 1, revision: input.revision, signals};
}

/** Exact, canonical comparison avoids relying on a caller-provided revision alone. */
export function tutorWritingContextFingerprint(context: TutorWritingContext | null | undefined): string {
  const normalized = normalizeTutorWritingContext(context);
  return normalized ? JSON.stringify(normalized) : '';
}

export function eligibleTutorSignals(context: TutorWritingContext | null | undefined): readonly TutorWritingSignal[] {
  return normalizeTutorWritingContext(context)?.signals.filter(signal =>
    signal.role === 'prompt' || signal.role === 'given' || signal.role === 'suggested-wording') ?? [];
}
