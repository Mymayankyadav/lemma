import {emblemKind, emblemStrokes, emblemTier, type EmblemKind, type EmblemStroke, type EmblemTier} from './emblem';

/**
 * N137 · G1 the emblem exporter (v7 UX plan r3, `04` §3.2 generator 2): one generator, three outputs, so an emblem
 * looks the same wherever it appears.
 *  - `emblemSvg`: a standalone SVG, identical in geometry to the `Emblem` component (for files, share pages, docs).
 *  - `emblemStrokeOrder`: the strokes in drawing order with their lengths and the share of a draw-in each takes
 *    (for animation: CSS stroke-dash, or an Android animated vector).
 *  - `emblemPng`: a PNG at a requested size and colour, drawn in the browser (for Android notification art, which the
 *    web layer makes on the device from the path's seed and hands to native code, so there is one implementation).
 * Pure except `emblemPng`, which needs a canvas.
 */
export interface EmblemSpec {subject: string; seed: string; kind?: EmblemKind; size?: number; tier?: EmblemTier; colour?: string}

const resolve = ({subject, seed, kind = emblemKind(subject), size = 96, tier = emblemTier(size), colour = '#121B31'}: EmblemSpec) =>
  ({subject, seed, kind, size, tier, colour, strokes: emblemStrokes(subject, seed, kind, tier)});
/** The component's coordinate frame: glyphs have a margin so round caps are not cut; tiles and heroes are clipped. */
export const emblemViewBox = (tier: EmblemTier) => tier === 'glyph' ? '-12 -12 224 224' : '0 0 200 200';
const escape = (value: string) => value.replace(/[<>&"]/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;'})[c]!);

/** The emblem as a standalone SVG document. Strokes keep their pixel width at any size, as in the component. */
export function emblemSvg(spec: EmblemSpec): string {
  const {size, tier, colour, strokes} = resolve(spec);
  const glyph = tier === 'glyph';
  const paths = strokes.map(stroke => `<path d="${stroke.d}" stroke-width="${stroke.width}" opacity="${stroke.opacity}" vector-effect="non-scaling-stroke"/>`).join('');
  const clip = glyph ? '' : '<defs><clipPath id="c"><circle cx="100" cy="100" r="98"/></clipPath></defs>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${emblemViewBox(tier)}" fill="none">${clip}` +
    `<g${glyph ? '' : ' clip-path="url(#c)"'} stroke="${escape(colour)}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>\n`;
}

/** Endpoint-parameterised SVG arc to its length (sampled; the generator's arcs are circles and ellipses). */
function arcLength(x0: number, y0: number, rx: number, ry: number, angle: number, large: boolean, sweep: boolean, x1: number, y1: number): number {
  if (rx === 0 || ry === 0) return Math.hypot(x1 - x0, y1 - y0);
  const phi = angle * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x0 - x1) / 2, dy = (y0 - y1) / 2, x = cos * dx + sin * dy, y = -sin * dx + cos * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const scale = (x * x) / (rx * rx) + (y * y) / (ry * ry);
  if (scale > 1) {rx *= Math.sqrt(scale); ry *= Math.sqrt(scale);}
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y * y - ry * ry * x * x, den = rx * rx * y * y + ry * ry * x * x;
  const k = sign * Math.sqrt(Math.max(0, num / den));
  const cx = k * rx * y / ry, cy = -k * ry * x / rx;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = ang(1, 0, (x - cx) / rx, (y - cy) / ry);
  let delta = ang((x - cx) / rx, (y - cy) / ry, (-x - cx) / rx, (-y - cy) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = 96;
  let length = 0, px = rx * Math.cos(start), py = ry * Math.sin(start);
  for (let i = 1; i <= steps; i++) {
    const t = start + delta * i / steps, qx = rx * Math.cos(t), qy = ry * Math.sin(t);
    length += Math.hypot(qx - px, qy - py); px = qx; py = qy;
  }
  return length;
}

/** The length of a path made of M, L, H, V, Z and A commands (absolute or relative), as the emblem generator writes. */
export function pathLength(d: string): number {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let i = 0, x = 0, y = 0, sx = 0, sy = 0, length = 0, command = '';
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
    const rel = command === command.toLowerCase();
    switch (command.toUpperCase()) {
      case 'M': {const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; sx = x; sy = y; command = rel ? 'l' : 'L'; break;}
      case 'L': {const nx = num(), ny = num(), tx = rel ? x + nx : nx, ty = rel ? y + ny : ny; length += Math.hypot(tx - x, ty - y); x = tx; y = ty; break;}
      case 'H': {const nx = num(), tx = rel ? x + nx : nx; length += Math.abs(tx - x); x = tx; break;}
      case 'V': {const ny = num(), ty = rel ? y + ny : ny; length += Math.abs(ty - y); y = ty; break;}
      case 'Z': length += Math.hypot(sx - x, sy - y); x = sx; y = sy; break;
      case 'A': {
        const rx = num(), ry = num(), angle = num(), large = num() !== 0, sweep = num() !== 0, nx = num(), ny = num();
        const tx = rel ? x + nx : nx, ty = rel ? y + ny : ny;
        length += arcLength(x, y, rx, ry, angle, large, sweep, tx, ty); x = tx; y = ty; break;
      }
      default: throw new Error('pathLength: unsupported command ' + command);
    }
  }
  return length;
}

export interface EmblemStrokeTiming extends EmblemStroke {order: number; length: number; start: number; end: number}
/**
 * The strokes in the generator's drawing order with their lengths, and when each draws in a single draw-in (0…1):
 * strokes share the time by length, so the pen moves at one speed, and the focal stroke comes last as it does today.
 */
export function emblemStrokeOrder(spec: EmblemSpec): EmblemStrokeTiming[] {
  const {strokes} = resolve(spec);
  const lengths = strokes.map(stroke => pathLength(stroke.d)), total = lengths.reduce((sum, value) => sum + value, 0) || 1;
  let at = 0;
  return strokes.map((stroke, order) => {
    const start = at / total;
    at += lengths[order];
    return {...stroke, order, length: Math.round(lengths[order] * 100) / 100, start: Math.round(start * 1e4) / 1e4, end: Math.round(at / total * 1e4) / 1e4};
  });
}

/** The emblem as a PNG blob at `size` × `size` device pixels (browser only). Strokes keep the component's pixel widths. */
export async function emblemPng(spec: EmblemSpec & {background?: string}): Promise<Blob> {
  const {size, tier, colour, strokes} = resolve(spec);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  if (spec.background) {ctx.fillStyle = spec.background; ctx.fillRect(0, 0, size, size);}
  const [vx, vy, vw] = emblemViewBox(tier).split(' ').map(Number), scale = size / vw;
  ctx.setTransform(scale, 0, 0, scale, -vx * scale, -vy * scale);
  if (tier !== 'glyph') {ctx.beginPath(); ctx.arc(100, 100, 98, 0, Math.PI * 2); ctx.clip();}
  ctx.strokeStyle = colour; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    ctx.globalAlpha = stroke.opacity;
    ctx.lineWidth = stroke.width / scale;
    ctx.stroke(new Path2D(stroke.d));
  }
  return await new Promise<Blob>((done, fail) => canvas.toBlob(blob => blob ? done(blob) : fail(new Error('Could not draw the emblem')), 'image/png'));
}
