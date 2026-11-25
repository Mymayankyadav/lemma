/**
 * N249 · Mapping a chip the learner opened through the edits a settling drawing applied in front of it (the drawing's
 * symbol and the keys queued behind it). Each step is recorded as the range it replaced in the text before it, so
 * identity comes from the edits themselves, not from matching text: two identical `$x$` stay distinct, and an
 * inserted `[` is not mistaken for the start of an image reference.
 */
export type TextEdit = Readonly<{start: number; end: number; delta: number}>;
type Snapshot = Readonly<{text: string; start: number; end: number}>;

/**
 * The range one keyboard step replaced. A step edits at its selection and never past its end (an insertion replaces
 * the selection; Delete removes it, or what is just before the caret), so the text after the selection is unchanged
 * and the change starts at the selection's start or earlier. Matching text is never used to widen it.
 */
export function editBetween(before: Snapshot, after: Snapshot): TextEdit | null {
  if (before.text === after.text) return null;
  const delta = after.text.length - before.text.length;
  let prefix = 0;
  const shortest = Math.min(before.text.length, after.text.length);
  while (prefix < shortest && before.text[prefix] === after.text[prefix]) prefix++;
  const start = Math.min(before.start, prefix);
  const tail = before.text.length - before.end;
  // Normally the text after the selection is untouched: the step replaced [start, selection end).
  if (tail <= after.text.length - start && before.text.slice(before.end) === after.text.slice(after.text.length - tail)) {
    return {start, end: before.end, delta};
  }
  // Otherwise, conservatively, everything from the first difference to the last one.
  let suffix = 0;
  while (suffix < shortest - prefix && before.text[before.text.length - 1 - suffix] === after.text[after.text.length - 1 - suffix]) suffix++;
  return {start: Math.min(start, prefix), end: Math.max(before.end, before.text.length - suffix), delta};
}

/** Where the span [start, start + length) is after the edits, or null when one of them removed or overwrote it. */
export function mapSpan(edits: readonly TextEdit[], start: number, length: number): number | null {
  let at = start;
  for (const edit of edits) {
    if (at + length <= edit.start && length > 0) continue;
    if (at >= edit.end) {at += edit.delta; continue;}
    return null;
  }
  return at;
}
