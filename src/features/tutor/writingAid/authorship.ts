import {readTutorAcceptedSpans, type TutorAcceptedSpan} from '../../../../supabase/functions/_shared/tutor-answer';

function spanAt(text: string, original: TutorAcceptedSpan, start: number, end: number): TutorAcceptedSpan | undefined {
  // Do not place a provenance boundary inside a UTF-16 surrogate pair.
  if (/[\uDC00-\uDFFF]/u.test(text.charAt(start))) start++;
  if (/[\uD800-\uDBFF]/u.test(text.charAt(end - 1))) end--;
  if (end <= start) return;
  const kept = text.slice(start, end);
  return /\S/u.test(kept) ? {...original, start, end, text: kept} : undefined;
}

export function moveAcceptedSpans(previous: string, next: string, spans: readonly TutorAcceptedSpan[],
  edit?: {start: number; end: number; nextEnd: number}, limit = ACCEPTED_SPAN_LIMIT): TutorAcceptedSpan[] {
  if (!spans.length || previous === next) return [...spans];
  let first = 0, suffix = 0;
  if (edit && edit.start <= edit.end && edit.start <= edit.nextEnd &&
      previous.slice(0, edit.start) === next.slice(0, edit.start) &&
      previous.slice(edit.end) === next.slice(edit.nextEnd)) {
    first = edit.start;
    suffix = previous.length - edit.end;
  } else {
    while (first < previous.length && first < next.length && previous[first] === next[first]) first++;
    while (suffix < previous.length - first && suffix < next.length - first &&
      previous[previous.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
  }
  const shift = next.length - previous.length;
  const oldEnd = previous.length - suffix;
  const groups = spans.map(span => [
    spanAt(next, span, span.start, Math.min(span.end, first)),
    spanAt(next, span, Math.max(span.start, oldEnd) + shift, span.end + shift),
  ].filter((part): part is TutorAcceptedSpan => part !== undefined));
  const exact = groups.flat();
  if (exact.length <= limit) return exact;
  // Only one range can straddle both sides of a single edit. At the cap,
  // retain its origin for the whole amended span rather than classifying
  // its unchanged assisted characters as learner-authored.
  return groups.flatMap(group => {
    if (group.length < 2) return group;
    const [left, right] = group;
    return [{...left, end: right.end, text: next.slice(left.start, right.end)}];
  });
}

const DRAFT_MARKER = '\u0000lemma-accepted-v1\n';
export const ACCEPTED_SPAN_LIMIT = 32;

export function encodeAuthoredDraft(text: string, spans: readonly TutorAcceptedSpan[] = []): string {
  const valid = readTutorAcceptedSpans(text, spans);
  return valid.length ? DRAFT_MARKER + JSON.stringify({text, spans: valid}) : text;
}

export function decodeAuthoredDraft(raw: string): {text: string; spans: TutorAcceptedSpan[]} {
  if (raw.startsWith(DRAFT_MARKER)) {
    try {
      const restored = JSON.parse(raw.slice(DRAFT_MARKER.length)) as {text?: unknown; spans?: unknown};
      if (typeof restored?.text === 'string') return {text: restored.text, spans: readTutorAcceptedSpans(restored.text, restored.spans)};
    } catch {/* An older raw draft may begin with any characters. */}
  }
  return {text: raw, spans: []};
}

export function addAuthoredSpan(text: string, prior: readonly TutorAcceptedSpan[], span: TutorAcceptedSpan): TutorAcceptedSpan[] | null {
  const surrounding = prior.flatMap(item => [
    spanAt(text, item, item.start, Math.min(item.end, span.start)),
    spanAt(text, item, Math.max(item.start, span.end), item.end),
  ].filter((part): part is TutorAcceptedSpan => part !== undefined));
  const spans = [...surrounding, span].sort((a, b) => a.start - b.start);
  const merged: TutorAcceptedSpan[] = [];
  for (const item of spans) {
    const preceding = merged.at(-1);
    if (preceding && preceding.end === item.start && item.end - preceding.start <= 2000 &&
        preceding.source === item.source && preceding.aidId === item.aidId && preceding.aidVersion === item.aidVersion) {
      merged[merged.length - 1] = {...preceding, end: item.end, text: preceding.text + item.text};
    } else merged.push(item);
  }
  return merged.length <= ACCEPTED_SPAN_LIMIT && readTutorAcceptedSpans(text, merged).length === merged.length ? merged : null;
}
