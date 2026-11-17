import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {StudyEntryRecord,StudyInterval} from '../../../src/data/study/contract';

const mocks=vi.hoisted(()=>({notify:vi.fn(),voidEntry:vi.fn(),restore:vi.fn()}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>mocks.notify}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>({voidStudyEntry:mocks.voidEntry,restoreStudyEntry:mocks.restore})}));

import {loggedSessions,sessionCaption,sessionOf} from '../../../src/features/calendar/v7/loggedSessions';
import DayGrid from '../../../src/features/calendar/v7/DayGrid';
import WeekGrid from '../../../src/features/calendar/v7/WeekGrid';
import {LoggedSessionSheet} from '../../../src/features/calendar/v7/LoggedSessionSheet';
import {formatDuration} from '../../../src/lib/format';

const Z='UTC',DAY='2026-11-16';
const at=(clock:string)=>`${DAY}T${clock}:00.000Z`;
let n=0;
const iv=(kind:StudyInterval['kind'],start:string,end:string|null):StudyInterval=>({id:'i'+(++n),kind,start:at(start),end:end===null?null:at(end)});
function entry(id:string,intervals:StudyInterval[],extra:Partial<StudyEntryRecord>={}):StudyEntryRecord{
 return {id,intent:'Topology 1 · CP2 Equivalence relations',source:'timer',status:'saved',reflection:null,rating:null,version:3,
  createdAt:at('14:00'),updatedAt:at('14:50'),savedAt:at('14:50'),intervals,projectId:null,...extra};
}
// Start 14:00, pause 14:20, resume 14:35, save 14:50: the Owner's question.
const paused=()=>entry('e1',[iv('focus','14:00','14:20'),iv('focus','14:35','14:50')]);

describe('N168 one card per saved session',()=>{
 it('a pause is a gap no interval covers: 35 min focus, 15 min paused, one session 14:00–14:50',()=>{
  const session=sessionOf(paused())!;
  expect(session.start).toBe(at('14:00'));expect(session.end).toBe(at('14:50'));
  expect(session.focusMinutes).toBe(35);expect(session.pausedMinutes).toBe(15);expect(session.breakMinutes).toBe(0);expect(session.pauses).toBe(1);
  expect(session.stretches.map(s=>[s.kind,s.minutes])).toEqual([['focus',20],['pause',15],['focus',15]]);
  expect(sessionCaption(session,formatDuration)).toBe('35 min · paused 15 min');
 });
 it('a break interval is a break, the rest of the gap a pause',()=>{
  const session=sessionOf(entry('e2',[iv('focus','09:00','09:25'),iv('break','09:25','09:30'),iv('focus','09:40','10:00')]))!;
  expect(session.stretches.map(s=>[s.kind,s.minutes])).toEqual([['focus',25],['break',5],['pause',10],['focus',20]]);
  expect(session.breakMinutes).toBe(5);expect(session.pausedMinutes).toBe(10);expect(session.pauses).toBe(1);
 });
 it('lists only saved, not voided sessions that touch the day, in start order',()=>{
  const range={start:at('00:00'),end:'2026-11-17T00:00:00.000Z'};
  const rows=loggedSessions([
   entry('late',[iv('focus','18:00','18:30')]),paused(),
   entry('draft',[iv('focus','10:00','10:30')],{status:'draft'}),
   entry('voided',[iv('focus','11:00','11:30')],{voidedAt:at('12:00')}),
   entry('running',[iv('focus','12:00',null)],{status:'running'}),
   entry('breakonly',[iv('break','13:00','13:10')]),
   entry('yesterday',[{id:'y',kind:'focus',start:'2026-11-15T20:00:00.000Z',end:'2026-11-15T21:00:00.000Z'}]),
  ],range);
  expect(rows.map(r=>r.entry.id)).toEqual(['e1','late']);
 });
});

let host:HTMLDivElement,root:Root;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const clock=(instant:string)=>instant.slice(11,16);
const look=()=>({subjectClass:'',path:'Topology 1'});

describe('N168 the grids draw a session as one tappable card',()=>{
 it('Day: one button for a paused session, the pause drawn inside, tap opens it',async()=>{
  const open=vi.fn(),e=paused();
  await act(async()=>root.render(<DayGrid date={DAY} zone={Z} clock={clock} entries={[e]} blocks={[]} now={Date.parse(at('16:00'))} lookOf={look}
   onCreate={vi.fn()} onEdit={vi.fn()} onOpenEntry={open} onAdjust={vi.fn()} onDropDay={vi.fn()} onSwipe={vi.fn()}/>));
  const cards=host.querySelectorAll('[data-kind="logged"]');
  expect(cards).toHaveLength(1);
  const button=cards[0].querySelector<HTMLButtonElement>('button[data-logged-entry="e1"]')!;
  expect(button).toBeTruthy();
  expect(button.querySelectorAll('[data-gap="pause"]')).toHaveLength(1);
  expect(button.getAttribute('aria-label')).toContain('35 min · paused 15 min');
  // 50 minutes at 64 px an hour is 53 px: the caption shows the focus and the pause.
  expect(button.textContent).toContain('35 min · paused 15 min');
  await act(async()=>button.click());
  expect(open).toHaveBeenCalledWith(e);
 });
 it('Day: a short session is set as one small line (data-tiny), never cut through',async()=>{
  await act(async()=>root.render(<DayGrid date={DAY} zone={Z} clock={clock} entries={[entry('s',[iv('focus','14:37','14:40')])]} blocks={[]} now={Date.parse(at('16:00'))} lookOf={look}
   onCreate={vi.fn()} onEdit={vi.fn()} onAdjust={vi.fn()} onDropDay={vi.fn()} onSwipe={vi.fn()}/>));
  const card=host.querySelector('[data-kind="logged"]')!;
  expect(card.getAttribute('data-tiny')).toBe('true');
  expect(card.getAttribute('data-compact')).toBe('true');
  expect(card.getAttribute('data-size')).toBe('title');
 });
 it('Day: a 32-minute session (34 px) is one row, title then caption, not two cut lines',async()=>{
  await act(async()=>root.render(<DayGrid date={DAY} zone={Z} clock={clock} entries={[entry('t',[iv('focus','14:08','14:32'),iv('focus','14:37','14:40')])]} blocks={[]} now={Date.parse(at('16:00'))} lookOf={look}
   onCreate={vi.fn()} onEdit={vi.fn()} onAdjust={vi.fn()} onDropDay={vi.fn()} onSwipe={vi.fn()}/>));
  const card=host.querySelector('[data-kind="logged"]')!;
  expect(card.getAttribute('data-compact')).toBe('true');
  expect(card.hasAttribute('data-tiny')).toBe(false);
  expect(card.querySelector('small')?.textContent).toBe('27 min · paused 5 min');
 });
 it('Week: one bar per session that opens it',async()=>{
  const open=vi.fn(),e=paused();
  await act(async()=>root.render(<WeekGrid weekStart={DAY} date={DAY} today={DAY} zone={Z} clock={clock} entries={[e]} blocks={[]} now={Date.parse(at('16:00'))} lookOf={look}
   onDay={vi.fn()} onEdit={vi.fn()} onOpenEntry={open}/>));
  const bars=host.querySelectorAll<HTMLButtonElement>('button[data-logged-entry]');
  expect(bars).toHaveLength(1);
  expect(bars[0].querySelectorAll('[data-gap="pause"]')).toHaveLength(1);
  await act(async()=>bars[0].click());
  expect(open).toHaveBeenCalledWith(e);
 });
});

describe('N168 the session sheet explains the card',()=>{
 it('shows when, focus vs paused, and each stretch at its times',async()=>{
  await act(async()=>root.render(<LoggedSessionSheet entry={paused()} look={look()} zone={Z} clock={clock} onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()}/>));
  const sheet=document.querySelector('[data-logged-session="e1"]')!;
  expect(sheet.textContent).toContain('14:00–14:50');
  expect(sheet.textContent).toContain('Topology 1');
  const totals=[...sheet.querySelectorAll('.v7-session-totals > div')].map(row=>row.textContent);
  expect(totals).toEqual(['Focus35 min','Paused15 min']);
  const stretches=[...sheet.querySelectorAll('.v7-session-stretches li')].map(row=>row.textContent);
  expect(stretches).toEqual(['14:00–14:20Focus20 min','14:20–14:35Paused15 min','14:35–14:50Focus15 min']);
 });
 it('Edit hands the entry to the editor; Void voids it with Undo',async()=>{
  const edit=vi.fn(),close=vi.fn(),changed=vi.fn(),e=paused();
  mocks.voidEntry.mockResolvedValue({record:{...e,version:4}});mocks.restore.mockResolvedValue({record:e});
  await act(async()=>root.render(<LoggedSessionSheet entry={e} look={look()} zone={Z} clock={clock} onClose={close} onEdit={edit} onChanged={changed}/>));
  const buttons=[...document.querySelectorAll<HTMLButtonElement>('dialog button')];
  await act(async()=>buttons.find(b=>b.textContent?.includes('Edit times'))!.click());
  expect(edit).toHaveBeenCalledWith(e);
  await act(async()=>buttons.find(b=>b.textContent?.trim()==='Void')!.click());
  expect(mocks.voidEntry).toHaveBeenCalledWith('e1',3);
  expect(close).toHaveBeenCalled();expect(changed).toHaveBeenCalled();
  const [message,options]=mocks.notify.mock.calls.at(-1)!;
  expect(message).toBe('Session voided');
  await act(async()=>options.action.onClick());
  expect(mocks.restore).toHaveBeenCalledWith('e1',4);
 });
});
