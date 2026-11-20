import {addDays, DAY, wallTimeMatches} from '../calendar';

export type LocalCalendarTime = Readonly<{
  date: string;
  time: string;
  /** In a fold, 0 selects the earlier instant and 1 the later instant. */
  fold?: 0 | 1;
}>;
type Bound = Omit<LocalCalendarTime, 'date'>;
export type WeeklyFixedSeries = Readonly<{
  seriesId: string;
  zone: string;
  /** Inclusive original local dates. Limit candidate snapshots to one year. */
  firstDate: string;
  lastDate: string;
  /** Sunday = 0. */
  weekdays: readonly number[];
  start: Bound;
  end: Bound;
}>;
type Identity = Readonly<{seriesId: string; zone: string; originalDate: string}>;
type Times = Readonly<{start: LocalCalendarTime; end: LocalCalendarTime}>;
export type FixedRevision = Identity & Readonly<{revision: number}> &
  (Readonly<{kind: 'cancel'}> | Readonly<{kind: 'move'}> & Times);
export type FixedOccurrence = Identity & Readonly<{
  revision: number;
  startsAt: string;
  endsAt: string;
}>;
type IssueCode = 'invalid-input' | 'missing-original' | 'revision-conflict' |
  'ambiguous-time' | 'nonexistent-time' | 'invalid-interval';
export type FixedNormalization =
  | {status: 'ok'; occurrences: FixedOccurrence[]}
  | {status: 'blocked'; reason: IssueCode; key?: string};

class CalendarIssue extends Error {
  constructor(readonly reason: IssueCode, readonly key?: string) {
    super(reason);
  }
}

const datePart = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const clockPart = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const validFold = (fold: Bound['fold']) => fold === undefined || fold === 0 || fold === 1;
function dateStamp(date: string): number {
  const at = Date.parse(date + 'T00:00:00Z');
  if (!datePart.test(date) || date.slice(0, 4) < '0100' || !Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== date) {
    throw new CalendarIssue('invalid-input');
  }
  return at;
}

function resolveLocal(bound: LocalCalendarTime, zone: string, key: string): number {
  if (!clockPart.test(bound.time) || !validFold(bound.fold)) throw new CalendarIssue('invalid-input', key);
  const at = dateStamp(bound.date) + Number(bound.time.slice(0, 2)) * 3_600_000 +
    Number(bound.time.slice(3)) * 60_000;
  const matches = wallTimeMatches(at, zone);
  if (!matches.length) throw new CalendarIssue('nonexistent-time', key);
  if (matches.length > 1 && bound.fold === undefined) throw new CalendarIssue('ambiguous-time', key);
  return matches.length === 1 ? matches[0] : matches[bound.fold ?? 0];
}

const keyOf = ({seriesId, zone, originalDate}: Identity) => JSON.stringify([seriesId, zone, originalDate]);
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function sameLocal(a: LocalCalendarTime, b: LocalCalendarTime): boolean {
  return a.date === b.date && a.time === b.time && a.fold === b.fold;
}
function sameRevision(a: FixedRevision, b: FixedRevision): boolean {
  return a.kind === 'cancel' ? b.kind === 'cancel' :
    b.kind === 'move' && sameLocal(a.start, b.start) && sameLocal(a.end, b.end);
}

/** Reconcile before resolving wall times, so a valid move or cancellation can
 * replace a nonexistent original time. Callers may only admit flexible work
 * when the authoritative snapshot normalizes successfully. */
export function normalizeFixedOccurrences(
  series: readonly WeeklyFixedSeries[], revisions: readonly FixedRevision[],
): FixedNormalization {
  try {
    const original = new Map<string, Identity & Times>();
    for (const item of series) {
      const first = dateStamp(item.firstDate), last = dateStamp(item.lastDate);
      if (!item.seriesId.trim() || !/^[A-Za-z]/.test(item.zone) ||
          last < first || (last - first) / DAY >= 366 ||
          !item.weekdays.length || !item.weekdays.every(day => Number.isInteger(day) && day >= 0 && day < 7) ||
          !clockPart.test(item.start.time) || !clockPart.test(item.end.time) ||
          !validFold(item.start.fold) || !validFold(item.end.fold) || item.start.time === item.end.time) {
        throw new CalendarIssue('invalid-input');
      }
      // Validate even if no weekday in the supplied range matches this series.
      new Intl.DateTimeFormat('en-GB', {timeZone: item.zone});
      for (let at = first; at <= last; at += DAY) {
        if (!item.weekdays.includes(new Date(at).getUTCDay())) continue;
        const originalDate = new Date(at).toISOString().slice(0, 10);
        const identity = {seriesId: item.seriesId, zone: item.zone, originalDate};
        const key = keyOf(identity);
        if (original.has(key)) throw new CalendarIssue('invalid-input', key);
        const endDate = item.end.time < item.start.time ? addDays(originalDate, 1) : originalDate;
        original.set(key, {...identity, start: {...item.start, date: originalDate},
          end: {...item.end, date: endDate}});
      }
    }

    const latest = new Map<string, {record: FixedRevision; conflict: boolean}>();
    for (const revision of revisions) {
      const key = keyOf(revision);
      if (!original.has(key)) throw new CalendarIssue('missing-original', key);
      if (!Number.isSafeInteger(revision.revision) || revision.revision < 1) {
        throw new CalendarIssue('invalid-input', key);
      }
      const previous = latest.get(key);
      if (!previous || previous.record.revision < revision.revision) {
        latest.set(key, {record: revision, conflict: false});
      } else if (previous.record.revision === revision.revision && !sameRevision(previous.record, revision)) {
        previous.conflict = true;
      }
    }

    const occurrences: FixedOccurrence[] = [];
    for (const key of [...original.keys()].sort(compare)) {
      const entry = original.get(key)!;
      const revision = latest.get(key);
      if (revision?.conflict) throw new CalendarIssue('revision-conflict', key);
      const latestRecord = revision?.record;
      if (latestRecord?.kind === 'cancel') continue;
      const {start, end} = latestRecord ?? entry;
      const starts = resolveLocal(start, entry.zone, key), ends = resolveLocal(end, entry.zone, key);
      if (ends <= starts) throw new CalendarIssue('invalid-interval', key);
      const {seriesId, zone, originalDate} = entry;
      occurrences.push({seriesId, zone, originalDate, revision: latestRecord?.revision ?? 0,
        startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString()});
    }
    return {status: 'ok', occurrences: occurrences.sort((a, b) =>
      compare(a.startsAt, b.startsAt) || compare(keyOf(a), keyOf(b)),
    )};
  } catch (error) {
    if (error instanceof CalendarIssue) return {status: 'blocked', reason: error.reason, key: error.key};
    if (error instanceof RangeError) return {status: 'blocked', reason: 'invalid-input'};
    throw error;
  }
}
