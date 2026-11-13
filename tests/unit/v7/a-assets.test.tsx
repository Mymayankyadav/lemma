import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {FLAG_DEFAULTS} from '../../../src/flags';
import {Loader} from '../../../src/ui/v7/Loader';
import {SOUND_SECONDS, playSound, soundsOn} from '../../../src/ui/v7/sounds';
import {SHARE_H, SHARE_W, shareCardText} from '../../../src/ui/v7/shareImage';
import {orbitTurn} from '../../../src/features/focus/v7/FocusV7';
import {THEME_TURN_ATTR, turnTheme} from '../../../src/styles/appearance';
import {applyReduceEffects} from '../../../src/ui/v7/effects';
import {STAMP_MS} from '../../../src/features/proposals/v7/InboxV7';

// N131 · the rest of the release and assets plan, as v7 UX plan r3 (N130, `04` §6–§8) keeps it: moments coded first,
// the focus orbit as an SVG prototype, optional sounds, and "Share the page" images.

describe('A4 focus orbit (SVG prototype)', () => {
  it('is behind its own flag, off by default', () => {
    expect(FLAG_DEFAULTS.focusOrbit).toBe(false);
  });
  it('turns once per focused minute', () => {
    expect(orbitTurn(0)).toBe(0);
    expect(orbitTurn(30_000)).toBe(.5);
    expect(orbitTurn(90_000)).toBe(.5);
    expect(orbitTurn(-5)).toBe(0);
  });
});

describe('A3 coded moments', () => {
  it('L-07 a stamped decision waits briefly and the stamp settles its last 4°, only when motion is allowed', () => {
    expect(STAMP_MS).toBeGreaterThanOrEqual(220);
    expect(STAMP_MS).toBeLessThanOrEqual(400);
    const css = readFileSync('src/features/proposals/v7/inbox.css', 'utf8');
    expect(css).toMatch(/prefers-reduced-motion: no-preference[\s\S]*data-stamped/);
    expect(css).toContain('calc(var(--v7-stamp-turn,-8deg) + 4deg)');
  });
  it('L-09 the loader is an emblem glyph beside words that say what is loading', () => {
    const html = renderToStaticMarkup(<Loader label="Arranging the sky…" className="v7-atlas-state"/>);
    expect(html).toContain('role="status"');
    expect(html).toContain('Arranging the sky…');
    expect(html).toMatch(/<svg aria-hidden="true"[^>]*data-tier="glyph"/);
    expect(html).toContain('v7-emblem-draw');
  });
  it('L-16 a Day/Night switch cross-fades as a View Transition, only when motion is allowed', () => {
    const css = readFileSync('src/ui/v7/motion.css', 'utf8');
    expect(css).toMatch(/::view-transition-new\(root\) \{animation-duration: var\(--v7-m-base\)/);
    expect(css).not.toContain('clip-path: circle');
    document.documentElement.setAttribute('data-v7', '');
    const update = vi.fn();
    vi.stubGlobal('matchMedia', (query: string) => ({matches: false, media: query, addEventListener() {}, removeEventListener() {}}));
    expect(turnTheme(update)).toBe(false); // jsdom has no startViewTransition
    expect(update).toHaveBeenCalledOnce();
    const start = vi.fn((callback: () => void) => {callback(); return {finished: Promise.resolve()};});
    Object.assign(document, {startViewTransition: start});
    expect(turnTheme(update)).toBe(true);
    expect(start).toHaveBeenCalledOnce();
    expect(document.documentElement.hasAttribute(THEME_TURN_ATTR)).toBe(true);
    applyReduceEffects(true);
    expect(turnTheme(update)).toBe(false);
    expect(start).toHaveBeenCalledOnce();
    applyReduceEffects(false);
    delete (document as unknown as {startViewTransition?: unknown}).startViewTransition;
    document.documentElement.removeAttribute(THEME_TURN_ATTR);
    vi.unstubAllGlobals();
  });
  it('L-20 the web splash is a still: inline, decorative, no animation', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/<div id="root">[\s\S]*class="lemma-splash" aria-hidden="true"/);
    const splash = html.slice(html.indexOf('lemma-splash'), html.indexOf('</style></div>'));
    expect(splash).not.toMatch(/animation|@keyframes/);
  });
});

describe('A5 sounds (off by default)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('each sound is at most 200 ms, and nothing plays unless switched on', async () => {
    for (const seconds of Object.values(SOUND_SECONDS)) expect(seconds).toBeLessThanOrEqual(.2);
    expect(soundsOn({})).toBe(false);
    expect(soundsOn({sounds: true})).toBe(true);
    const Audio = vi.fn();
    expect(await playSound('tick', false, Audio as unknown as typeof AudioContext)).toBe(false);
    expect(Audio).not.toHaveBeenCalled();
  });
  it('a sound plays through Web Audio when on (no audio files)', async () => {
    const node = () => ({connect: vi.fn(), start: vi.fn(), stop: vi.fn(), type: '', buffer: null,
      frequency: {setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn()}, Q: {setValueAtTime: vi.fn()},
      gain: {setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn()}});
    class FakeAudio {
      state = 'running'; currentTime = 0; sampleRate = 8000; destination = {};
      createGain = node; createOscillator = node; createBiquadFilter = node; createBufferSource = node;
      createBuffer(_: number, length: number) {const data = new Float32Array(length); return {getChannelData: () => data};}
      resume() {return Promise.resolve();}
    }
    expect(await playSound('chime', true, FakeAudio as unknown as typeof AudioContext)).toBe(true);
    expect(await playSound('page', true, FakeAudio as unknown as typeof AudioContext)).toBe(true);
  });
  it('Settings has the switch, saved with the account', () => {
    expect(readFileSync('src/features/settings/v7/SettingsV7.tsx', 'utf8')).toContain('<Switch label="Sounds"');
  });
});

describe('A5′ "Share the page"', () => {
  it('pages are 1200 × 630 and say what happened', () => {
    expect([SHARE_W, SHARE_H]).toEqual([1200, 630]);
    expect(shareCardText({kind: 'path', title: 'Real Analysis', subject: 'Analysis', done: 12, total: 12, date: '9 Nov'})).toMatchObject(
      {eyebrow: 'Analysis · Path completed', headline: 'Real Analysis', figures: '12 checkpoints demonstrated', file: 'lemma-path-real-analysis.png'});
    expect(shareCardText({kind: 'week', minutes: 95, reviews: 98, demonstrated: 1, days: [], range: '3 – 9 Nov'})).toMatchObject(
      {headline: '1 h 35 min of focused study', figures: '98 reviews · 1 checkpoint demonstrated'});
    expect(shareCardText({kind: 'day', date: 'Mon 9 Nov', figure: '0 min', line: 'of focus saved — a rest day counts too', aim: ' Compactness '})).toMatchObject(
      {eyebrow: 'Mon 9 Nov · Day closed', headline: '0 min of focus saved', figures: 'Tomorrow: Compactness', file: 'lemma-day.png'});
  });
  it('Day closed, the week page and a finished path each offer it', () => {
    expect(readFileSync('src/features/ritual/v7/CloseDayV7.tsx', 'utf8')).toContain('Share the page');
    expect(readFileSync('src/features/insights/v7/ProgressV7.tsx', 'utf8')).toContain('Share this week');
    expect(readFileSync('src/features/project/v7/V7Path.tsx', 'utf8')).toContain("label:'Share this path'");
  });
  it('the site preview exists at its size and is linked', () => {
    const png = readFileSync('public/og-image.png');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(png.length).toBeLessThan(120 * 1024);
    expect(readFileSync('index.html', 'utf8')).toContain('<meta property="og:image" content="https://mymayankyadav.github.io/lemma/og-image.png" />');
  });
});
