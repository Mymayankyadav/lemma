import type {TutorAcceptedSpan} from '../../../../supabase/functions/_shared/tutor-answer';
import {addAuthoredSpan} from './authorship';

export function equationFences(source: string) {
  const width = source.startsWith('$$') || source.startsWith('\\') ? 2 : 1;
  return {opening: source.slice(0, width), closing: source.slice(-width), tex: source.slice(width, -width), width};
}

function clip(text: string, span: TutorAcceptedSpan, start: number, end: number, shift = 0): TutorAcceptedSpan[] {
  const from = Math.max(start, span.start), to = Math.min(end, span.end);
  const kept = text.slice(from, to);
  return to > from && /\S/u.test(kept) ? [{...span, start: from + shift, end: to + shift, text: kept}] : [];
}

/** Project retained origins into the sheet's exact UTF-16 coordinates. */
export function equationOrigins(text: string, spans: readonly TutorAcceptedSpan[], source: string, offset: number) {
  const {width} = equationFences(source);
  const start = offset + width, end = offset + source.length - width;
  const inside = spans.flatMap(span => clip(text, span, start, end, -start));
  const outside = spans.flatMap(span => [...clip(text, span, 0, start), ...clip(text, span, end, text.length)]);
  return {inside, outsideCount: outside.length};
}

/** Rebuild the exact retained origins for the whole answer or fail before saving any edit. */
export function applyEquationOrigins(text: string, next: string, spans: readonly TutorAcceptedSpan[], source: string, offset: number,
  tex: string, sheetSpans: readonly TutorAcceptedSpan[]): TutorAcceptedSpan[] | null {
  const leading = tex.length - tex.trimStart().length, retained = tex.trim().length;
  const {width} = equationFences(source);
  const shift = next.length - text.length;
  const fences = retained ? width : 0;
  const start = offset + fences, end = offset + source.length - fences;
  const pieces = spans.flatMap(span => [...clip(text, span, 0, start), ...clip(text, span, end, text.length, shift)]);
  if (retained) pieces.push(...sheetSpans.flatMap(span => clip(tex, span, leading, leading + retained, start - leading)));
  let result: TutorAcceptedSpan[] = [];
  for (const piece of pieces.sort((a, b) => a.start - b.start)) {
    const updated = addAuthoredSpan(next, result, piece);
    if (!updated) return null;
    result = updated;
  }
  return result;
}
