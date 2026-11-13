import {ELL_MARK_PATH} from './marks';

/**
 * N131 · A5′ share pages (v7 UX plan r3, `04` §8): a 1200 × 630 card (the Open Graph size) drawn as a notebook page with
 * the ℓ emblem, the numbers and the ∎, for Day closed, the week page and a finished path, plus the site's own preview. Drawn on a canvas in the app's own fonts and the Day palette (a shared
 * image is read on other people's screens), then shared through the system sheet where the browser allows files, or
 * saved as a PNG. Loaded only when the learner asks to share. `shareCardText` is pure and unit-tested.
 */
export const SHARE_W = 1200, SHARE_H = 630;
export type ShareCard =
  | {kind: 'brand'}
  | {kind: 'path'; title: string; subject: string; done: number; total: number; date: string}
  | {kind: 'day'; date: string; figure: string; line: string; aim: string}
  | {kind: 'week'; minutes: number; reviews: number; demonstrated: number; days: readonly number[]; range: string};

const PAPER = '#F8F5F0', GRID = '#E4DED3', INK = '#121B31', SECONDARY = '#4A5368', ACCENT = '#3738AC';

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);
function minutesText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes)), hours = Math.floor(m / 60);
  return hours ? hours + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') : m + ' min';
}
/** The words on a card: an eyebrow, a headline, a line of figures and a footer. */
export function shareCardText(card: ShareCard): {eyebrow: string; headline: string; figures: string; footer: string; file: string} {
  if (card.kind === 'brand') return {
    eyebrow: 'Lemma',
    headline: 'A mathematical study environment',
    figures: 'Proof-first study with an AI tutor',
    footer: 'mymayankyadav.github.io/lemma',
    file: 'lemma.png',
  };
  if (card.kind === 'day') return {
    eyebrow: card.date + ' · Day closed',
    headline: card.figure + ' ' + card.line.replace(/ — .*$/, ''),
    figures: card.aim.trim() ? 'Tomorrow: ' + card.aim.trim() : 'See you tomorrow',
    footer: 'Q.E.D. · ' + card.date,
    file: 'lemma-day.png',
  };
  if (card.kind === 'path') return {
    eyebrow: (card.subject ? card.subject + ' · ' : '') + 'Path completed',
    headline: card.title,
    figures: plural(card.total, 'checkpoint') + ' demonstrated' + (card.done < card.total ? ' (' + card.done + ' of ' + card.total + ')' : ''),
    footer: 'Q.E.D. · ' + card.date,
    file: 'lemma-path-' + card.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '.png',
  };
  return {
    eyebrow: 'My week in Lemma',
    headline: minutesText(card.minutes) + ' of focused study',
    figures: [plural(card.reviews, 'review'), plural(card.demonstrated, 'checkpoint') + ' demonstrated'].join(' · '),
    footer: card.range,
    file: 'lemma-week.png',
  };
}

function fontOf(element: Element, name: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}
/** Wrap `text` to at most `lines` lines of `width` px, ending with an ellipsis when cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, lines: number): string[] {
  const words = text.split(/\s+/), out: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {out.push(line); line = word;}
  }
  if (line) out.push(line);
  if (out.length > lines) {out.length = lines; out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '…';}
  return out;
}

/** Draw `card` on a 1200 × 630 context. */
export function drawShareCard(ctx: CanvasRenderingContext2D, card: ShareCard, fonts = {serif: 'Georgia, serif', sans: 'system-ui, sans-serif'}) {
  const text = shareCardText(card);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  // Graph-paper page with a margin rule, as in the app's Day theme.
  ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 30; x < SHARE_W; x += 30) {ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, SHARE_H);}
  for (let y = 30; y < SHARE_H; y += 30) {ctx.moveTo(0, y + .5); ctx.lineTo(SHARE_W, y + .5);}
  ctx.stroke();
  ctx.strokeStyle = ACCENT; ctx.globalAlpha = .35; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(120, 0); ctx.lineTo(120, SHARE_H); ctx.stroke(); ctx.globalAlpha = 1;
  // The emblem: the ℓ inside a compass circle, top right.
  ctx.save(); ctx.translate(960, 70); ctx.strokeStyle = INK; ctx.globalAlpha = .25; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(80, 80, 78, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.scale(160 / 1024, 160 / 1024); ctx.fillStyle = INK; ctx.fill(new Path2D(ELL_MARK_PATH)); ctx.restore();
  // Words.
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = ACCENT; ctx.font = '600 28px ' + fonts.sans;
  ctx.fillText(text.eyebrow.toUpperCase(), 160, 150);
  ctx.fillStyle = INK; ctx.font = '500 72px ' + fonts.serif;
  const lines = wrap(ctx, text.headline, 760, 2);
  lines.forEach((line, i) => ctx.fillText(line, 160, 250 + i * 84));
  ctx.fillStyle = SECONDARY; ctx.font = '400 32px ' + fonts.sans;
  ctx.fillText(text.figures, 160, 250 + lines.length * 84 + 24);
  if (card.kind === 'week') {
    // Seven days of focus as small columns.
    const max = Math.max(1, ...card.days), x0 = 160, base = 560;
    card.days.slice(0, 7).forEach((minutes, i) => {
      const h = Math.max(4, Math.round(90 * minutes / max));
      ctx.fillStyle = minutes > 0 ? ACCENT : GRID; ctx.fillRect(x0 + i * 36, base - h, 22, h);
    });
    ctx.fillStyle = ACCENT; ctx.fillRect(x0 + 7 * 36 + 12, base - 26, 26, 26);
  } else if (card.kind !== 'brand') {
    // ∎ closes the page, as it closes a proof.
    ctx.fillStyle = ACCENT; ctx.fillRect(160, 520, 26, 26);
  }
  ctx.fillStyle = SECONDARY; ctx.font = '500 26px ' + fonts.sans; ctx.textAlign = 'right';
  ctx.fillText(card.kind === 'brand' ? text.footer : text.footer + ' · Lemma', SHARE_W - 60, SHARE_H - 46); ctx.textAlign = 'left';
}

/** The card as a PNG blob, drawn in the page's v7 fonts once they are loaded. */
export async function shareCardBlob(card: ShareCard): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_W; canvas.height = SHARE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  const root = document.documentElement;
  drawShareCard(ctx, card, {serif: fontOf(root, '--v7-serif', 'Georgia, serif'), sans: fontOf(root, '--v7-sans', 'system-ui, sans-serif')});
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not draw the image')), 'image/png'));
}

/** Share the card through the system sheet when the browser can share files, else save it. Returns what happened. */
export async function shareCard(card: ShareCard): Promise<'shared' | 'saved' | 'cancelled'> {
  const blob = await shareCardBlob(card), name = shareCardText(card).file;
  const file = typeof File === 'function' ? new File([blob], name, {type: 'image/png'}) : null;
  const nav = navigator as Navigator & {canShare?: (data: {files: File[]}) => boolean};
  if (file && nav.share && nav.canShare?.({files: [file]})) {
    try {await nav.share({files: [file], title: shareCardText(card).headline}); return 'shared';}
    catch (error) {if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';}
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
