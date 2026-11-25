/**
 * N248 · Symbols as n × n occupancy grids.
 *
 * Each catalogue glyph is rendered once (scripts/latent-ink-grids.mjs) into a fixed em box: centred on its ink
 * horizontally and on the baseline vertically, so that `<` and the `<` inside `≤` land on the same cells. The box is
 * cut into n × n cells and a cell is on when ink covers at least `MIN_CELL_COVERAGE` of it.
 *
 * n is the smallest size at which no two different-looking glyphs share a grid (glyphs that render identically,
 * such as `∣` and `|`, are aliases and are allowed to share one). Larger n would distinguish more, but every
 * extra cell makes a hand-drawn part less likely to sit inside the cells of the symbol it belongs to.
 *
 * A symbol whose cells are a strict subset of another's is extendable: the learner may still be drawing the
 * larger one (`<` → `≤`, `=` → `≠`, `∖` → `×`, `∨` → `∀`), so the Pad never inserts it the moment the pen
 * lifts. The policy is in latentInkPolicy.ts.
 */

export const MIN_CELL_COVERAGE = .06;

export type Grid = Readonly<{n: number; cells: readonly boolean[]}>;

/** A square greyscale bitmap (values 0–255, ink > 0) cut into n × n cells. */
export function occupancyGrid(bitmap: ArrayLike<number>, size: number, n: number, minCoverage = MIN_CELL_COVERAGE): Grid {
  if (!Number.isInteger(size) || size < 1 || bitmap.length !== size * size) throw new Error('Bitmap must be size × size');
  if (!Number.isInteger(n) || n < 1 || n > size) throw new Error('Grid size must be between 1 and the bitmap size');
  const ink = new Float64Array(n * n), area = new Float64Array(n * n);
  for (let y = 0; y < size; y++) {
    const row = Math.min(n - 1, Math.floor(y * n / size));
    for (let x = 0; x < size; x++) {
      const cell = row * n + Math.min(n - 1, Math.floor(x * n / size));
      area[cell]++;
      ink[cell] += bitmap[y * size + x] / 255;
    }
  }
  return {n, cells: Array.from(ink, (value, cell) => value / area[cell] >= minCoverage)};
}

export function gridKey(grid: Grid) {
  let bits = '';
  for (const on of grid.cells) bits += on ? '1' : '0';
  // Hex keeps the generated table small and diffable.
  let hex = '';
  for (let index = 0; index < bits.length; index += 4) hex += parseInt(bits.slice(index, index + 4).padEnd(4, '0'), 2).toString(16);
  return hex;
}

export function gridFromKey(key: string, n: number): Grid {
  const bits = [...key].map(digit => parseInt(digit, 16).toString(2).padStart(4, '0')).join('');
  if (bits.length < n * n || /[^01]/.test(bits)) throw new Error('Grid key does not fit n × n');
  return {n, cells: [...bits.slice(0, n * n)].map(bit => bit === '1')};
}

export const cellCount = (grid: Grid) => grid.cells.reduce((count, on) => count + (on ? 1 : 0), 0);

/** Every cell of `part` is on in `whole`, and `whole` has more cells. */
export function isStrictSubGrid(part: Grid, whole: Grid) {
  if (part.n !== whole.n) return false;
  let extra = 0;
  for (let index = 0; index < part.cells.length; index++) {
    if (part.cells[index] && !whole.cells[index]) return false;
    if (whole.cells[index] && !part.cells[index]) extra++;
  }
  return extra > 0 && cellCount(part) > 0;
}

export type GlyphBitmap = Readonly<{id: string; bitmap: ArrayLike<number>}>;

/** Glyphs whose full-resolution bitmaps are identical render the same and form one alias group. */
export function aliasGroups(glyphs: readonly GlyphBitmap[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const glyph of glyphs) {
    const key = Array.from(glyph.bitmap, value => value > 0 ? 1 : 0).join('');
    groups.set(key, [...(groups.get(key) ?? []), glyph.id]);
  }
  return [...groups.values()];
}

export type GridCollision = Readonly<{n: number; ids: readonly string[]}>;

/** Different-looking glyphs that share a grid at size n. */
export function collisionsAt(glyphs: readonly GlyphBitmap[], size: number, n: number): GridCollision[] {
  const representatives = aliasGroups(glyphs).map(group => glyphs.find(glyph => glyph.id === group[0])!);
  const byKey = new Map<string, string[]>();
  for (const glyph of representatives) {
    const key = gridKey(occupancyGrid(glyph.bitmap, size, n));
    byKey.set(key, [...(byKey.get(key) ?? []), glyph.id]);
  }
  return [...byKey.values()].filter(ids => ids.length > 1).map(ids => ({n, ids}));
}

/** The smallest n (from `from` up to `to`) at which no two different-looking glyphs share a grid. */
export function smallestInjectiveN(glyphs: readonly GlyphBitmap[], size: number, from = 2, to = 24) {
  for (let n = from; n <= Math.min(to, size); n++) if (!collisionsAt(glyphs, size, n).length) return n;
  return undefined;
}

/** A part must hold at least this share of the whole's cells: a dot is not the start of every symbol. */
export const MINIMUM_PART_SHARE = .3;

/** For each symbol, the symbols whose grid strictly contains its grid with at least `minimumShare` of their cells. */
export function extensionTable(grids: Readonly<Record<string, Grid>>, minimumShare = MINIMUM_PART_SHARE): Record<string, string[]> {
  const table: Record<string, string[]> = {};
  const ids = Object.keys(grids).sort();
  for (const part of ids) {
    const supersets = ids.filter(whole => whole !== part && isStrictSubGrid(grids[part], grids[whole])
      && cellCount(grids[part]) / cellCount(grids[whole]) >= minimumShare);
    if (supersets.length) table[part] = supersets;
  }
  return table;
}
