/**
 * N249 · Where a span [start, start + length) of `before` sits in `after`, when the one edit between them (a drawing
 * and the keys queued behind it going in) did not touch it; null when it did. Used to keep a chip the learner opened
 * pointing at the same occurrence after a pending drawing settles in front of it.
 */
export function rebaseSpan(before: string, after: string, start: number, length: number): number | null {
  if (before === after) return start;
  const shortest = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < shortest && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < shortest - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  if (start + length <= prefix) return start;
  if (start >= before.length - suffix) return start + after.length - before.length;
  return null;
}
