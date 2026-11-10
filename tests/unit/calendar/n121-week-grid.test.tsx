import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import WeekTimeGrid from '../../../src/features/calendar/grid/WeekTimeGrid';
import type {CalendarBlockRecord,StudyEntryRecord} from '../../../src/data/study/contract';

const make=(id:string,title:string,start:string,end:string):CalendarBlockRecord=>({
 id,title,kind:'study',status:'planned',version:1,timeZone:'UTC',
 startsAt:'2026-11-06T'+start+':00Z',endsAt:'2026-11-06T'+end+':00Z',
});
const blocks=[
 make('a','LongNotebookWordWithoutBreakpoints','09:00','11:00'),
 make('b','Math seminar','09:30','10:15'),
 make('c','Proof review','10:00','11:30'),
];
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
describe('N121 spatial Week grid',()=>{
 it('positions seven civil-day columns and keeps three simultaneous blocks separate',async()=>{
  const edit=vi.fn(),open=vi.fn();
  await act(async()=>root.render(<WeekTimeGrid date="2026-11-06" zone="UTC"
    firstDay={1} clock24h entries={[] as StudyEntryRecord[]}
    blocks={blocks} onDay={open} onEdit={edit}/>));
  expect(host.querySelectorAll('[data-week-grid-column]')).toHaveLength(7);
  const friday=host.querySelector('[data-week-grid-column="2026-11-06"]');
  expect(friday).not.toBeNull();
  expect(friday?.querySelectorAll('[data-week-event^="block:"]')).toHaveLength(3);
  expect(friday?.querySelector('[data-week-lane="2"]')).not.toBeNull();
  const title=friday?.querySelector<HTMLElement>('[data-week-event="block:a"] strong');
  expect(title?.textContent).toBe('LongNotebookWordWithoutBreakpoints');
  expect(title?.className).toContain('[word-break:normal]');
  expect(title?.className).toContain('text-ellipsis');
  const event=friday?.querySelector<HTMLButtonElement>('[data-week-event="block:a"] button');
  expect(event).not.toBeNull();
  await act(async()=>event!.click());
  expect(edit).toHaveBeenCalledWith(blocks[0]);
  const nav=host.querySelector<HTMLButtonElement>('[data-week-grid-day="2026-11-05"]');
  await act(async()=>nav?.click());
  expect(open).toHaveBeenCalledWith('2026-11-05');
 });
 it('moves and resizes calendar blocks with accessible Alt+Arrow keyboard controls',async()=>{
  const adjust=vi.fn();
  await act(async()=>root.render(<WeekTimeGrid date="2026-11-06" zone="UTC"
   firstDay={1} clock24h entries={[]} blocks={blocks} onDay={()=>{}} onAdjust={adjust}/>));
  const event=host.querySelector<HTMLButtonElement>('[data-week-event="block:a"] button')!;
  expect(event.getAttribute('aria-description')).toContain('Alt and arrow keys move 15 minutes');
  await act(async()=>event.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true})));
  expect(adjust).toHaveBeenLastCalledWith(blocks[0],{
   startsAt:'2026-11-06T09:15:00.000Z',endsAt:'2026-11-06T11:15:00.000Z'
  });
  await act(async()=>event.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,shiftKey:true,bubbles:true})));
  expect(adjust).toHaveBeenLastCalledWith(blocks[0],{
   startsAt:'2026-11-06T09:00:00.000Z',endsAt:'2026-11-06T11:15:00.000Z'
  });
 });
 it('clips a block that crosses midnight and never creates horizontal min-widths',async()=>{
  const spanning=make('night','Night reading','23:30','23:59');
  spanning.endsAt='2026-11-07T00:30:00Z';
  await act(async()=>root.render(<WeekTimeGrid date="2026-11-06" zone="UTC"
   firstDay={1} clock24h entries={[]} blocks={[spanning]} onDay={()=>{}}/>));
  expect(host.querySelectorAll('[data-week-event="block:night"]')).toHaveLength(2);
  const grid=host.querySelector('[aria-label="Week time grid"]');
  expect(grid?.className).toContain('min-w-0');
 });
});
