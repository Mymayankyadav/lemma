import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {FLAG_DEFAULTS} from '../../../src/flags';
import {nextAfter, rulerSnap, rulerTicks, rulerTime} from '../../../src/features/home/v7/Ruler';
import {weekStars} from '../../../src/features/week/v7/WeekV7';
import {PAPERS, SKIES} from '../../../src/ui/v7/paper';
import {DESK_QUERY} from '../../../src/features/focus/v7/deskClock';

// N157 · v7 UX audit r3, U4 (signature): each idea behind its own flag, off by default; errata and ∅ copy.
describe('U4 flags', () => {
  it('every signature idea has its own flag, off by default', () => {
    for (const flag of ['v7Ruler', 'v7Qed', 'v7Spread', 'v7Scratch', 'v7Paper', 'v7DeskClock', 'v7Week'] as const) expect(FLAG_DEFAULTS[flag], flag).toBe(false);
  });
});

describe('S1 · the ruler', () => {
  it('a tick every half hour and a label every second hour, positioned by value', () => {
    const ticks = rulerTicks([480, 720]);
    expect(ticks.map(tick => tick.minute)).toEqual([480, 510, 540, 570, 600, 630, 660, 690, 720]);
    expect(ticks.filter(tick => tick.label).map(tick => tick.label)).toEqual(['08:00', '10:00', '12:00']);
    expect(ticks[4].left).toBe(50);
  });
  it('the needle snaps to five minutes inside the window, speaks times and finds what is next', () => {
    expect(rulerSnap(613, [480, 720])).toBe(615);
    expect(rulerSnap(100, [480, 720])).toBe(480);
    expect(rulerTime(1025)).toBe('17:05');
    const blocks = [{id: 'b', start: 900, end: 960, klass: '', past: false, title: 'Proofs'}, {id: 'a', start: 600, end: 660, klass: '', past: true, title: 'Read'}];
    expect(nextAfter(blocks, 700)?.id).toBe('b');
    expect(nextAfter(blocks, 1000)).toBeNull();
  });
});

describe('S2–S4 · S6 · S14 · S16 · S15', () => {
  it('the ∎ replaces the tick only under the flag, and is indigo', () => {
    const css = readFileSync('src/ui/v7/qed.css', 'utf8');
    expect(css).toContain(':where(html[data-v7][data-v7-qed]) .v7-tk-check[aria-checked="true"] > span {width:14px;height:14px;border-radius:0;background:var(--v7-role-selection-fg);');
    expect(readFileSync('src/app/v7/V7Shell.tsx', 'utf8')).toContain("isFlagOn('v7Qed'))document.documentElement.setAttribute('data-v7-qed','')");
  });
  it('scratch paper sits in the round under its flag and stores nothing', () => {
    const round = readFileSync('src/features/review-run/v7/ReviewRoundV7.tsx', 'utf8'), pad = readFileSync('src/features/review-run/v7/ScratchPad.tsx', 'utf8');
    expect(round).toContain("{isFlagOn('v7Scratch')&&<ScratchPad cardKey={item.id}/>}");
    expect(pad).not.toMatch(/localStorage|fetch\(|getApi/);
  });
  it('paper and sky: four papers, two skies, at 7% ink, off under Reduce effects', () => {
    expect(PAPERS).toEqual(['plain', 'graph', 'dot', 'ruled']);
    expect(SKIES).toEqual(['clear', 'stars']);
    const css = readFileSync('src/ui/v7/paper.css', 'utf8');
    expect(css).toContain('stroke-opacity=".07"');
    expect(css.match(/:not\(\[data-v7-reduce-effects\]\)/g)).toHaveLength(4);
  });
  it('the desk clock opens in landscape on a phone and keeps the screen awake', () => {
    expect(DESK_QUERY).toBe('(orientation: landscape) and (max-height: 500px)');
    const focus = readFileSync('src/features/focus/v7/FocusV7.tsx', 'utf8');
    expect(focus).toContain("useWakeLock(desk&&entry?.status==='running');");
    expect(readFileSync('src/features/focus/v7/deskClock.ts', 'utf8')).toContain("api.request('screen')");
  });
  it('the week page draws one star per day, lit when there was study', () => {
    const stars = weekStars([0, 30, 60, 0, 0, 120, 0]);
    expect(stars).toHaveLength(7);
    expect(stars.filter(star => star.lit)).toHaveLength(3);
    expect(stars[5].r).toBe(6);
    expect(readFileSync('src/app/weekRoute.tsx', 'utf8')).toContain("{path: '/week', element:");
    expect(readFileSync('src/app/App.tsx', 'utf8')).toContain(' weekRoute,');
  });
});

describe('Errata and ∅', () => {
  it('failures read as errata, and an empty search reads ∅', () => {
    for (const [path, text] of [['src/features/cards/v7/CardsV7.tsx', 'Erratum: cards didn’t load. Try again.'], ['src/features/settings/v7/SettingsV7.tsx', 'Erratum: your settings didn’t load. Try again.'],
      ['src/app/v7/SearchSheet.tsx', '∅ Nothing matches'], ['src/features/cards/v7/CardsV7.tsx', '∅ No cards match these filters']])
      expect(readFileSync(path, 'utf8'), path).toContain(text);
  });
});
