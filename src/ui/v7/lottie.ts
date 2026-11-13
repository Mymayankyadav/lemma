/**
 * N129 · A3 theming for the code-drawn Lottie animations (scripts/lottie/build.mjs). Every fill and stroke in them is
 * named after a theme role; `themeLottie` returns a copy with those colours filled in, so one file serves Day, Night,
 * high contrast and every subject colour. Pure (unit-tested); `roleColours` reads the roles from the page.
 */
export type LottieRole = 'bg' | 'ink' | 'muted' | 'paper' | 'accent' | 'onAccent';
export type Rgb = [number, number, number];
export type LottieName = 'inbox-zero' | 'round-complete' | 'day-closed';
/** LT8: the frame each ending lands on (its ✓ or ∎ finishes), where `haptic('complete')` is felt. */
export const LOTTIE_LANDS: Readonly<Record<LottieName, number>> = {'inbox-zero': 66, 'round-complete': 72, 'day-closed': 80};

type Connection = {saveData?: boolean; effectiveType?: string} | undefined;
/**
 * LT7 (Owner decision E22, 13 Nov 2026): the player (about 0.5 MB compressed) is skipped when the browser asks to save
 * data or the connection is 2G; the still shows instead.
 */
export function lottieAllowed(connection: Connection = typeof navigator === 'undefined' ? undefined : (navigator as {connection?: Connection}).connection): boolean {
  if (!connection) return true;
  return !connection.saveData && !/^(slow-)?2g$/.test(connection.effectiveType ?? '');
}

type Json = unknown;
/** A deep copy of the animation with every role-named fill (`fl`) and stroke (`st`) coloured from `colours`. */
export function themeLottie<T extends Json>(data: T, colours: Record<LottieRole, Rgb>): T {
  const walk = (node: Json): Json => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const object = node as Record<string, Json>;
    const copy: Record<string, Json> = {};
    for (const [key, value] of Object.entries(object)) copy[key] = walk(value);
    if ((object.ty === 'fl' || object.ty === 'st') && typeof object.nm === 'string' && object.nm in colours) {
      const [r, g, b] = colours[object.nm as LottieRole];
      copy.c = {a: 0, k: [r / 255, g / 255, b / 255, 1]};
    }
    return copy;
  };
  return walk(data) as T;
}

/** Any CSS colour as RGB, through a 1 × 1 canvas (handles hex, rgb() and the newer colour spaces alike). */
export function cssColourToRgb(value: string, fallback: Rgb = [128, 128, 128]): Rgb {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context || !value.trim()) return fallback;
    context.fillStyle = '#000';
    context.fillStyle = value.trim();
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  } catch {
    return fallback;
  }
}

/** The theme colours as seen from `element` (so a subject class on an ancestor sets the accent). The paper is the
 *  illustrations' own object fill (`--v7-il-paper`, P1: lighter than the disc in Day and Night). */
export function roleColours(element: Element, parse: (value: string) => Rgb = cssColourToRgb): Record<LottieRole, Rgb> {
  const style = getComputedStyle(element);
  const value = (name: string) => style.getPropertyValue(name).trim();
  const read = (name: string, fallback: string) => parse(value(name) || fallback);
  return {
    bg: read('--v7-role-surface-muted', '#E9E4DC'),
    ink: read('--v7-role-text-primary', '#121B31'),
    muted: read('--v7-role-text-tertiary', '#7A8294'),
    paper: parse(value('--v7-il-paper') || value('--v7-role-surface-raised') || '#FFFFFF'),
    accent: parse(value('--v7-subject') || value('--v7-role-selection-fg') || '#3738AC'),
    onAccent: read('--v7-role-surface-page', '#F8F5F0'),
  };
}
