/**
 * N220 · tap correction (key-target resizing, as Gboard does it). A touch in the outer part of a letter key also counts
 * for the neighbouring key it is near. The touched letter wins unless it cannot continue any word in the dictionary
 * while the nearby letter can; the first letter of a word is never changed. The dictionary loads once, on demand.
 */
let words: string[] | null = null;
let loading: Promise<void> | null = null;

export function prepareTapCorrection(): Promise<void> {
  if (words) return Promise.resolve();
  return loading ??= import('./writingAid/vendor/wordlist.txt?raw')
    .then(module => {words = module.default.split('\n').map(word => word.trim().toLowerCase()).filter(Boolean).sort();})
    .catch(() => {loading = null;});
}

/** For tests: use a known word list. */
export function setTapCorrectionWords(list: readonly string[] | null): void {
  words = list ? [...list].map(word => word.toLowerCase()).sort() : null;
  loading = null;
}

/** Whether some dictionary word starts with `prefix` (lower case). Unknown (still loading) counts as yes. */
export function isWordPrefix(prefix: string): boolean {
  if (!words) return true;
  let low = 0, high = words.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (words[middle] < prefix) low = middle + 1;
    else high = middle;
  }
  return low < words.length && words[low].startsWith(prefix);
}

export interface KeyBox {letter: string; x: number; y: number; width: number; height: number}

/** The touch's likelihood for a key: a Gaussian around the key's centre, half a key wide and a little taller. */
function likelihood(key: KeyBox, point: {x: number; y: number}): number {
  const dx = (point.x - (key.x + key.width / 2)) / Math.max(1, key.width / 2);
  const dy = (point.y - (key.y + key.height / 2)) / Math.max(1, key.height * .6);
  return Math.exp(-(dx * dx + dy * dy) / 2);
}

/** A first letter or an already-valid word prefix does not need neighbour geometry. */
export function needsTapCorrection(pressed: string, before: string): boolean {
  const prefix = before.toLowerCase(), letter = pressed.toLowerCase();
  return Boolean(words && /^[a-z]+$/.test(prefix) && /^[a-z]$/.test(letter) && !isWordPrefix(prefix + letter));
}

/** The letter to type for a touch at `point` on `pressed`, given the word typed so far (`before`). */
export function correctTap(pressed: string, point: {x: number; y: number}, keys: readonly KeyBox[], before: string): string {
  const prefix = before.toLowerCase(), lower = pressed.toLowerCase();
  if (!needsTapCorrection(pressed, before)) return pressed;
  const own = keys.find(key => key.letter === lower);
  if (!own) return pressed;
  const ownScore = likelihood(own, point);
  let best: {letter: string; score: number} | null = null;
  for (const key of keys) {
    if (key.letter === lower) continue;
    const score = likelihood(key, point);
    if (score < ownScore * .35 || !isWordPrefix(prefix + key.letter)) continue;
    if (!best || score > best.score) best = {letter: key.letter, score};
  }
  if (!best) return pressed;
  return pressed === lower ? best.letter : best.letter.toUpperCase();
}
