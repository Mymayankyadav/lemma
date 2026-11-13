import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {heatmapIndexAt} from '../../../src/ui/v7/Chart';
import {weekRangeLabel} from '../../../src/features/time-log/v7/weekLabel';

// N138 · v7 UX audit r3, V36: every control takes a 44 px tap (48 px in the app).
describe('V36 · the almanac is one touch target',()=>{
 // Four weeks, 2 px gaps: 4 columns of 24 px and 7 rows of 24 px.
 const grid={width:4*24+3*2,height:7*24+6*2,gapX:2,gapY:2,weeks:4,offset:2,days:20};
 it('picks the day under the point, counting the empty slots before the first day',()=>{
  expect(heatmapIndexAt({...grid,x:12,y:2*26+12})).toBe(0);
  expect(heatmapIndexAt({...grid,x:26+12,y:12})).toBe(5);
  expect(heatmapIndexAt({...grid,x:2*26+12,y:5*26+12})).toBe(17);
 });
 it('a point in a gap goes to the nearer day',()=>{
  expect(heatmapIndexAt({...grid,x:24.4,y:2*26+12})).toBe(0);
  expect(heatmapIndexAt({...grid,x:25.6,y:2*26+12})).toBe(7);
  expect(heatmapIndexAt({...grid,x:12,y:3*26-1.6})).toBe(0);
  expect(heatmapIndexAt({...grid,x:12,y:3*26-.4})).toBe(1);
 });
 it('nothing before the first day or after the last, and nothing for an empty grid',()=>{
  expect(heatmapIndexAt({...grid,x:12,y:12})).toBeNull();
  expect(heatmapIndexAt({...grid,x:3*26+12,y:6*26+12})).toBeNull();
  expect(heatmapIndexAt({...grid,width:0,x:1,y:1})).toBeNull();
 });
 it('the cells keep their focus and labels but leave the pointer to the grid',()=>{
  expect(readFileSync('src/ui/v7/chart.css','utf8')).toContain('.v7-heatmap button {pointer-events:none;');
  const source=readFileSync('src/ui/v7/Chart.tsx','utf8');
  expect(source).toContain('onPointerDown={pick}');
  const cell=source.split('\n').find(line=>line.includes('onClick={() => setSelected(index)} onFocus={() => setSelected(index)} onKeyDown={event => { movePoint(event, index, data.length, 7); }}'))!;
  expect(cell).not.toContain('onMouseEnter');
 });
});

describe('V36 · the time log names its week above a full-width strip',()=>{
 it('one month, two months, another year, two years',()=>{
  expect(weekRangeLabel('2026-11-09','2026-11-09')).toBe('9–15 November');
  expect(weekRangeLabel('2026-11-30','2026-11-09')).toBe('30 Nov – 6 Dec');
  expect(weekRangeLabel('2025-11-10','2026-11-09')).toBe('10–16 November 2025');
  expect(weekRangeLabel('2026-12-28','2026-11-09')).toBe('28 Dec 2026 – 3 Jan 2027');
  expect(weekRangeLabel('not a day','2026-11-09')).toBe('');
 });
});

describe('V36 · invisible hit areas are the touch size, centred, whatever the border',()=>{
 const centred='top:50%;height:max(100%,var(--v7-touch));transform:translateY(-50%);';
 it('badge actions, path cards\' due chips and Adjust',()=>{
  expect(readFileSync('src/ui/v7/kit-system.css','utf8')).toMatch(new RegExp('\\.v7-badge-action::after \\{[^}]*'+centred.replace(/[()%.]/g,'\\$&')));
  expect(readFileSync('src/features/projects/v7/paths.css','utf8')).toContain(centred);
  expect(readFileSync('src/features/calendar/v7/calendar.css','utf8')).toMatch(/\.v7-cal-suggest \.v7-link-button::after \{[^}]*top:50%;height:max\(100%,var\(--v7-touch\)\)/);
 });
 it('the hub tabs are at least the touch size wide',()=>{
  expect(readFileSync('src/app/v7/shell.css','utf8')).toMatch(/\.v7-hub-tabs a \{min-height:var\(--v7-touch\);min-width:var\(--v7-touch\);/);
 });
});
