import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {heatmapDays} from '../../../src/ui/v7/Chart';
import {weekShortTitle} from '../../../src/features/calendar/v7/viewModel';
import {nameCodes} from '../../../src/lib/codeNames';
import {zoneLongName} from '../../../src/lib/format';
import {editorKeys,insertAt,macroKeys} from '../../../src/features/cards/v7/editorModel';

// N131 · v7 UX audit r3, the rest of phase U0 (truth). The ids are the audit's
// (docs/v7/ux-audit-2026-11-12/01_AUDIT_RELEASED_V7.md).

describe('V16 · the almanac starts where the record starts',()=>{
 const days=(from:string,count:number,studied:(index:number)=>number)=>Array.from({length:count},(_,index)=>{
  const date=new Date(from+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+index);
  return {date:date.toISOString().slice(0,10),value:studied(index)};
 });
 it('drops the empty weeks before the week of the first study day',()=>{
  // 182 days from Mon 11 May 2026; the first study day is Wed 4 Nov (index 177).
  const all=days('2026-05-11',182,index=>index===177||index===180?30:0);
  const kept=heatmapDays(all);
  expect(kept[0].date).toBe('2026-11-02');
  expect(kept[kept.length-1].date).toBe(all[all.length-1].date);
  expect(kept.length).toBe(7);
 });
 it('with no study yet it keeps the last four weeks',()=>{
  const kept=heatmapDays(days('2026-05-11',182,()=>0));
  expect(kept.length).toBeGreaterThanOrEqual(28);
  expect(kept.length).toBeLessThan(35);
  expect(new Date(kept[0].date+'T12:00:00Z').getUTCDay()).toBe(1);
 });
 it('keeps everything when the record starts on the first day',()=>{
  const all=days('2026-05-11',70,index=>index%3===0?20:0);
  expect(heatmapDays(all)).toEqual(all);
 });
});

describe('V42 · a week block on a phone shows its first two words',()=>{
 it('two words, one per line',()=>{
  expect(weekShortTitle('Real analysis: compactness')).toEqual(['Real','analysis:']);
  expect(weekShortTitle('Topology')).toEqual(['Topology']);
  expect(weekShortTitle('  — Saved   study ')).toEqual(['Saved','study']);
  expect(weekShortTitle('')).toEqual(['Study']);
 });
});

describe('V18 · names, not codes',()=>{
 it('checkpoint codes become their titles, or "checkpoint n"; session codes become "session n"',()=>{
  const titles=new Map([['CP4','Compactness'],['CP1','Foundations']]);
  expect(nameCodes('Same gap in S6 and S7',titles)).toBe('Same gap in session 6 and session 7');
  expect(nameCodes('Move CP4 after CP1; add CP4a.',titles)).toBe('Move Compactness after Foundations; add checkpoint 4a.');
  expect(nameCodes('CPU and SSD are not codes; neither is S. or S-1',titles)).toBe('CPU and SSD are not codes; neither is S. or S-1');
 });
 it('the learning screens print no checkpoint code',()=>{
  expect(readFileSync('src/features/checkpoint/v7/CheckpointV7.tsx','utf8')).toContain('<DetailHeader title={view.title}');
  const proposal=readFileSync('src/features/plan-proposal/v7/PlanProposalV7.tsx','utf8');
  expect(proposal).not.toMatch(/<small>\{node\.code\}/);
  expect(proposal).toContain('nameCodes(p.reason');
  expect(readFileSync('src/features/project/v7/V7Path.tsx','utf8')).not.toContain('{cp.code} · {cp.title}');
 });
});

describe('V33 · the example deck repeats no card on Linear Algebra or Topology',()=>{
 it('every front is distinct on those paths, and the deck keeps its size',()=>{
  const fixture=JSON.parse(readFileSync('src/data/demo/fixture.json','utf8')) as {notes:{projectId:string;note:{front:string}}[]};
  expect(fixture.notes).toHaveLength(90);
  for(const project of ['project-linear','project-topology']){
   const fronts=fixture.notes.filter(note=>note.projectId===project).map(note=>note.note.front);
   expect(new Set(fronts).size).toBe(fronts.length);
  }
 });
});

describe('V34 · copy',()=>{
 it('names the time zone as people say it',()=>{
  expect(zoneLongName('Asia/Kolkata')).toBe('India Standard Time');
  expect(zoneLongName('Asia/Calcutta')).toBe('India Standard Time');
  expect(zoneLongName('Not/A_Zone')).toBe('A Zone time');
 });
 it('a LaTeX preamble names the macro it defines, never \\newcommand',()=>{
  const preamble='\\newcommand{\\R}{\\mathbb{R}}\n\\DeclareMathOperator{\\tr}{tr}\n\\renewcommand*{\\epsilon}{\\varepsilon}\n\\def\\N{\\mathbb{N}}\n\\norm: \\lVert #1 \\rVert';
  expect(macroKeys(preamble).map(key=>key.label)).toEqual(['\\R','\\tr','\\epsilon','\\N','\\norm']);
 });
 it('the editor row starts with fraction, sum, integral and set braces',()=>{
  const keys=editorKeys('\\newcommand{\\R}{\\mathbb{R}}');
  expect(keys.slice(0,5).map(key=>key.name)).toEqual(['fraction','sum','integral','set braces','macro \\R']);
  expect(new Set(keys.map(key=>key.name)).size).toBe(keys.length);
  expect(insertAt('x',1,1,'\\{ \\}')).toEqual({value:'x\\{ \\}',caret:4});
 });
 it('the subject rows, the tutor tile and the Progress sentence',()=>{
  expect(readFileSync('src/features/settings/v7/SettingsV7.tsx','utf8')).not.toContain("' · glyph '");
  const progress=readFileSync('src/features/insights/v7/ProgressV7.tsx','utf8');
  expect(progress).not.toContain("' in tutor sessions'");
  expect(progress.match(/format=\{axis\} totalFormat=\{minutes\}/g)).toHaveLength(3);
 });
});

describe('V40 · "Resolved" is an action',()=>{
 it('the button says what it does',()=>{
  const session=readFileSync('src/features/session/v7/SessionV7.tsx','utf8');
  expect(session).toContain('>Mark resolved</Button>');
  expect(session).not.toContain('>Resolved</Button>');
 });
});
