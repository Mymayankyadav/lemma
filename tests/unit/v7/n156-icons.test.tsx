import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {MEANING_ICON} from '../../../src/ui/v7/meanings';
import {CardMark, ChangedMark, ConstellationMark, DeadlineMark, PracticeMark, SuggestedMark} from '../../../src/ui/v7/marks';
import {GRADE_KEYS, GradeGlyph} from '../../../src/ui/v7/grades';

// N156 · v7 UX audit r3, P6 (IC1, IC2, IC3, IC5; Owner decision E21): one meaning per glyph, one line weight.
function files(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, found);
    else if (/\.tsx?$/.test(path)) found.push(path);
  }
  return found;
}
const v7Code = [...files('src/app/v7'), ...files('src/ui/v7'), ...readdirSync('src/features').flatMap(feature => {
  try {return files(join('src/features', feature, 'v7'));} catch {return [];}
})];

describe('IC1 · one icon per meaning', () => {
  it('every meaning has its own glyph, and each draws', () => {
    const icons = Object.values(MEANING_ICON);
    expect(new Set(icons).size).toBe(icons.length);
    for (const [meaning, Icon] of Object.entries(MEANING_ICON)) expect(renderToStaticMarkup(createElement(Icon)), meaning).toMatch(/<svg[\s\S]*<(path|rect|circle)/);
  });
  it('v7 screens take Layers, Target and Flag only through the table, and never use Star, Waypoints, Triangle, Sparkle or Brain', () => {
    const lucideImport = /import\s*\{([^}]*)\}\s*from\s*'lucide-react'/g;
    for (const path of v7Code) {
      if (path.endsWith('meanings.ts')) continue;
      for (const match of readFileSync(path, 'utf8').matchAll(lucideImport)) {
        const names = match[1].split(',').map(name => name.trim().split(/\s+as\s+/)[0]);
        for (const banned of ['Layers', 'Target', 'Flag', 'Star', 'Waypoints', 'Triangle', 'Sparkle', 'Sparkles', 'Brain']) expect(names, path).not.toContain(banned);
      }
    }
  });
  it('the screens named in P6 use the table', () => {
    for (const path of ['src/app/v7/searchIcons.ts', 'src/app/v7/CaptureSheet.tsx', 'src/app/v7/V7Shell.tsx', 'src/features/home/v7/V7Today.tsx',
      'src/features/project/v7/V7Path.tsx', 'src/features/calendar/v7/V7CalendarDay.tsx', 'src/features/calendar/v7/AgendaList.tsx',
      'src/features/calendar/v7/DayGrid.tsx', 'src/features/calendar/v7/MonthGrid.tsx', 'src/ui/v7/Status.tsx', 'src/features/settings/v7/SettingsV7.tsx'])
      expect(readFileSync(path, 'utf8'), path).toContain('MEANING_ICON');
    const today = readFileSync('src/features/home/v7/V7Today.tsx', 'utf8');
    expect(today).toContain('<MEANING_ICON.review aria-hidden="true"/>');
    expect(today).toContain('<MEANING_ICON.practice aria-hidden="true"/>');
    expect(readFileSync('src/features/project/v7/V7Path.tsx', 'utf8')).toContain('icon:<MEANING_ICON.switchPath aria-hidden="true"/>');
  });
});

describe('IC2 · IC3 · one line weight', () => {
  it('the six new marks and the old two are drawn on the 24 grid at 1.75, marked to keep that weight at any size', () => {
    for (const Mark of [CardMark, PracticeMark, ConstellationMark, DeadlineMark, ChangedMark, SuggestedMark]) {
      const html = renderToStaticMarkup(createElement(Mark, {size: 20}));
      expect(html).toContain('viewBox="0 0 24 24"');
      expect(html).toContain('stroke-width="1.75"');
      expect(html).toContain('class="v7-mark"');
    }
  });
  it('the grade glyphs are on the same 24-unit grid', () => {
    for (const grade of GRADE_KEYS) {
      const html = renderToStaticMarkup(createElement(GradeGlyph, {grade}));
      expect(html, grade).toContain('viewBox="0 0 24 24"');
      expect(html, grade).not.toMatch(/stroke-width="1\.6"/);
    }
  });
  it('the stylesheet holds every lucide icon, mark and grade glyph at 1.75 px whatever its size', () => {
    const css = readFileSync('src/ui/v7/kit-system.css', 'utf8');
    expect(css).toContain(':where(html[data-v7]) :is(svg.lucide,svg.v7-mark,svg.v7-grade-glyph) {stroke-width:1.75;}');
    expect(css).toContain(':where(html[data-v7]) :is(svg.lucide,svg.v7-mark,svg.v7-grade-glyph) * {vector-effect:non-scaling-stroke;}');
    expect(readFileSync('src/ui/v7/kit-page.css', 'utf8')).not.toMatch(/\.lucide \{[^}]*stroke-width/);
  });
});
