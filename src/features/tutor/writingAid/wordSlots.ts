/** In prose the left slot keeps the learner's spelling. At a boundary the best prediction still sits in the middle. */
export function wordSlots<T>(ranked: readonly T[], typed: string | undefined, label: (item: T) => string): (T | undefined)[] {
  if (!typed) return [ranked[1], ranked[0], ranked[2]];
  const slots: (T | undefined)[] = [undefined, undefined, undefined];
  const seen = new Set([typed.toLowerCase()]);
  let position = 1;
  for (const item of ranked) {
    const word = label(item).toLowerCase();
    if (seen.has(word)) continue;
    slots[position++] = item;
    if (position === slots.length) break;
    seen.add(word);
  }
  return slots;
}
