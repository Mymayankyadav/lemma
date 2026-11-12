/**
 * N129 · A3 theming for the code-drawn Lottie animations (scripts/lottie/build.mjs). Every fill and stroke in them is
 * named after a theme role; `themeLottie` returns a copy with those colours filled in, so one file serves Day, Night,
 * high contrast and every subject colour. Pure (unit-tested); `roleColours` reads the roles from the page.
 */
export type LottieRole = 'bg' | 'ink' | 'muted' | 'paper' | 'accent' | 'onAccent';
export type Rgb = [number, number, number];
export type LottieName = 'inbox-zero' | 'round-complete' | 'day-closed';

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

/** The theme colours as seen from `element` (so a subject class on an ancestor sets the accent). */
export function roleColours(element: Element): Record<LottieRole, Rgb> {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => cssColourToRgb(style.getPropertyValue(name) || fallback);
  return {
    bg: read('--v7-role-surface-muted', '#E9E4DC'),
    ink: read('--v7-role-text-primary', '#121B31'),
    muted: read('--v7-role-text-tertiary', '#7A8294'),
    paper: read('--v7-role-surface-raised', '#FFFFFF'),
    accent: cssColourToRgb(style.getPropertyValue('--v7-subject') || style.getPropertyValue('--v7-role-selection-fg') || '#3738AC'),
    onAccent: read('--v7-role-surface-page', '#F8F5F0'),
  };
}
