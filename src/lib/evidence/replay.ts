// Pure candidate replay of owner-scoped, append-only evidence. The service, not
// this module or a client, authenticates the owner/source and assigns knownAt.
export type EvidenceJson =
  | null | boolean | number | string
  | readonly EvidenceJson[]
  | { readonly [key: string]: EvidenceJson };

type EvidenceIdentity = Readonly<{
  ownerId: string;
  eventId: string;
  source: string;
  lineageId: string;
  revision: number;
  occurredAt: string;
  reportedAt: string;
  knownAt: string;
}>;

export type EvidenceEvent<T extends EvidenceJson = EvidenceJson> = EvidenceIdentity &
  (Readonly<{ kind: 'record'; payload: T }> | Readonly<{ kind: 'void' }>);

export type EvidenceReplayErrorCode =
  | 'invalid-clock' | 'invalid-identity' | 'owner-mismatch'
  | 'event-id-conflict' | 'revision-conflict';

export class EvidenceReplayError extends Error {
  constructor(readonly code: EvidenceReplayErrorCode) {
    super(code);
    this.name = 'EvidenceReplayError';
  }
}

const NS_PER_MS = 1_000_000n;

// Require an offset and reject Date.parse's silent civil-date normalization.
// Keep fractional precision through cutoff comparisons (including Postgres µs).
function instant(value: string): bigint {
  if (typeof value !== 'string') throw new EvidenceReplayError('invalid-clock');
  const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!parts) throw new EvidenceReplayError('invalid-clock');
  const [, civil, fraction = '', zone] = parts;
  const local = Date.parse(civil + 'Z');
  const utc = Date.parse(civil + zone);
  if (!Number.isFinite(utc) || !Number.isFinite(local) ||
      new Date(local).toISOString() !== civil + '.000Z') {
    throw new EvidenceReplayError('invalid-clock');
  }
  return BigInt(utc) * NS_PER_MS + BigInt(fraction.padEnd(9, '0'));
}

function compare<T extends string | bigint>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isJsonArray(value: EvidenceJson): value is readonly EvidenceJson[] {
  return Array.isArray(value);
}

// Immutable JSON equality, independent of object key order, but not array order.
export function sameEvidenceJson(a: EvidenceJson, b: EvidenceJson): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (isJsonArray(a) || isJsonArray(b)) {
    return isJsonArray(a) && isJsonArray(b) && a.length === b.length &&
      a.every((value, index) => sameEvidenceJson(value, b[index]));
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length &&
    keys.every(key => Object.hasOwn(b, key) && sameEvidenceJson(a[key], b[key]));
}

function sameEvent(a: EvidenceEvent, b: EvidenceEvent): boolean {
  return a.kind === b.kind && a.ownerId === b.ownerId && a.eventId === b.eventId &&
    a.source === b.source && a.lineageId === b.lineageId && a.revision === b.revision &&
    a.occurredAt === b.occurredAt && a.reportedAt === b.reportedAt && a.knownAt === b.knownAt &&
    (a.kind === 'void' || (b.kind === 'record' && sameEvidenceJson(a.payload, b.payload)));
}

type Timed<T extends EvidenceJson> = {
  event: EvidenceEvent<T>;
  occurred: bigint;
  reported: bigint;
  known: bigint;
};

function readClocks<T extends EvidenceJson>(event: EvidenceEvent<T>, known = instant(event.knownAt)): Timed<T> {
  return {
    event, occurred: instant(event.occurredAt),
    reported: instant(event.reportedAt), known,
  };
}

function uniqueEvents<T extends EvidenceJson>(
  ownerId: string, entries: readonly Timed<T>[],
): Timed<T>[] {
  if (!ownerId.trim()) throw new EvidenceReplayError('invalid-identity');
  const ids = new Map<string, Timed<T>>();
  for (const entry of entries) {
    const event = entry.event;
    if (event.ownerId !== ownerId) throw new EvidenceReplayError('owner-mismatch');
    if (![event.eventId, event.source, event.lineageId].every(id => typeof id === 'string' && id.trim()) ||
        !Number.isSafeInteger(event.revision) || event.revision < 1) {
      throw new EvidenceReplayError('invalid-identity');
    }
    const prior = ids.get(event.eventId);
    if (prior) {
      if (!sameEvent(prior.event, event)) throw new EvidenceReplayError('event-id-conflict');
      continue;
    }
    ids.set(event.eventId, entry);
  }
  const revisions = new Set<string>();
  for (const {event} of ids.values()) {
    const revisionKey = JSON.stringify([event.source, event.lineageId, event.revision]);
    if (revisions.has(revisionKey)) throw new EvidenceReplayError('revision-conflict');
    revisions.add(revisionKey);
  }
  return [...ids.values()];
}

/** Candidate ingestion validation only, not a durable write or operation receipt. */
export function deduplicateEvidence<T extends EvidenceJson>(
  ownerId: string, events: readonly EvidenceEvent<T>[],
): EvidenceEvent<T>[] {
  return uniqueEvents(ownerId, events.map(event => readClocks(event))).map(({event}) => event);
}

/**
 * Replay the exact visible prefix. A later correction/void cannot rewrite a
 * prior view; same-ID conflicts known only later cannot invalidate it either.
 * Return both the visible history and latest non-void records for consumers.
 */
export function replayEvidence<T extends EvidenceJson>(
  ownerId: string, events: readonly EvidenceEvent<T>[], asOf: string,
): { history: EvidenceEvent<T>[]; active: EvidenceEvent<T>[] } {
  const cutoff = instant(asOf);
  // Even future input must be from the authenticated owner's segregated source.
  if (events.some(event => event.ownerId !== ownerId)) throw new EvidenceReplayError('owner-mismatch');
  const visible: Timed<T>[] = [];
  for (const event of events) {
    const known = instant(event.knownAt);
    if (known > cutoff) continue;
    const row = readClocks(event, known);
    if (row.occurred <= cutoff && row.reported <= cutoff) visible.push(row);
  }
  const history = uniqueEvents(ownerId, visible).sort((a, b) =>
    compare(a.known, b.known) || compare(a.reported, b.reported) ||
    compare(a.occurred, b.occurred) || compare(a.event.eventId, b.event.eventId),
  );
  const latest = new Map<string, Timed<T>>();
  for (const row of history) {
    const {source, lineageId, revision} = row.event;
    const key = JSON.stringify([source, lineageId]);
    const current = latest.get(key);
    if (!current || current.event.revision < revision) latest.set(key, row);
  }
  const active = [...latest.values()].filter(row => row.event.kind === 'record').sort((a, b) =>
    compare(a.occurred, b.occurred) || compare(a.event.eventId, b.event.eventId),
  );
  return {history: history.map(row => row.event), active: active.map(row => row.event)};
}
