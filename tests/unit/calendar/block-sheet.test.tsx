import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarBlockRecord, CalendarBlockPatch, NewCalendarBlock } from '../../../src/data/study/contract';
import { emptyStudyApi } from '../../../src/data/study/contract';
import { setStudyApiForTests } from '../../../src/data/study';
import { BlockSheet } from '../../../src/features/calendar/block-sheet/BlockSheet';
import { blockInstant, validateBlockDraft } from '../../../src/features/calendar/block-sheet/model';

const messages = vi.hoisted(() => ({toast:vi.fn()}));
vi.mock('../../../src/ui/Toast', () => ({useToast: () => messages.toast}));

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const block: CalendarBlockRecord = {
  id: 'block-1',kind:'study',title:'Proofs',status:'planned',version:3,
  startsAt:new Date('2026-11-06T09:00').toISOString(),endsAt:new Date('2026-11-06T10:00').toISOString(),timeZone:zone,
};
let root:Root,host:HTMLDivElement,opener:HTMLButtonElement;
const changed=vi.fn();
let restoreShow:PropertyDescriptor|undefined,restoreClose:PropertyDescriptor|undefined;

function fake(initial:CalendarBlockRecord[] = []) {
  let rows=[...initial];
  let sequence=0;
  const createCalendarBlock=vi.fn(async(input:NewCalendarBlock)=>{
    const record:CalendarBlockRecord={...input,id:'created-'+(++sequence),version:1,status:'planned'};
    rows.push(record);return {record,actionNo:null};
  });
  const updateCalendarBlock=vi.fn(async(id:string,version:number,patch:CalendarBlockPatch)=>{
    const old=rows.find(row=>row.id===id);
    if(!old||old.version!==version)throw Object.assign(new Error('version conflict'),{code:'conflict'});
    const record={...old,...patch,version:old.version+1};
    rows=rows.map(row=>row.id===id?record:row);
    return {record,actionNo:null};
  });
  const deleteCalendarBlock=vi.fn(async(id:string,version:number)=>{
    const old=rows.find(row=>row.id===id);
    if(!old||old.version!==version)throw Object.assign(new Error('version conflict'),{code:'conflict'});
    rows=rows.filter(row=>row.id!==id);
    return {record:{id},actionNo:null};
  });
  setStudyApiForTests({...emptyStudyApi('demo'),createCalendarBlock,updateCalendarBlock,deleteCalendarBlock});
  return {createCalendarBlock,updateCalendarBlock,deleteCalendarBlock,rows:()=>rows};
}
async function open(edit:CalendarBlockRecord|null=null) {
  function Wrapper(){
    const [visible,setVisible]=useState(true);
    return visible?<BlockSheet block={edit} day="2026-11-06" zone={zone}
      onClose={()=>setVisible(false)} onChanged={changed}/>:null;
  }
  await act(async()=>root.render(<Wrapper/>));
  expect(host.querySelector('dialog')?.open).toBe(true);
}
async function fill(label:string,value:string) {
  const el=host.querySelector<HTMLInputElement|HTMLSelectElement>('[aria-label="'+label+'"]');
  expect(el,'Missing field: '+label).not.toBeNull();
  await act(async()=>{
    const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);
    el!.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));
  });
}
async function click(label:string) {
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label);
  expect(button,'Missing button: '+label).toBeDefined();
  await act(async()=>button!.click());
}
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  restoreShow=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'showModal');
  restoreClose=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'close');
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');this.focus();}});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
  host=document.createElement('div');opener=document.createElement('button');
  opener.textContent='Calendar opener';document.body.append(opener,host);
  opener.focus();root=createRoot(host);changed.mockClear();messages.toast.mockClear();
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  if(restoreShow)Object.defineProperty(HTMLDialogElement.prototype,'showModal',restoreShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal');
  if(restoreClose)Object.defineProperty(HTMLDialogElement.prototype,'close',restoreClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype,'close');
  setStudyApiForTests(null);host.remove();opener.remove();
});

describe('N27 native Calendar block sheet',()=>{
  it('rejects invalid title, reversed periods, DST gap and nonexistent local time',()=>{
    const data={title:' ',kind:'study' as const,status:'planned' as const,start:'2026-11-06T11:00',end:'2026-11-06T10:00'};
    expect(()=>validateBlockDraft(data,'UTC')).toThrow(/title/);
    expect(()=>validateBlockDraft({...data,title:'Seminar'},'UTC')).toThrow(/start before/);
    expect(blockInstant('2026-11-06T25:00','UTC')).toBeNull();
    expect(blockInstant('2026-03-29T01:30','Europe/London')).toBeNull();
  });
  it('creates a block from a titled native dialog and Undo deletes only that version',async()=>{
    const api=fake();
    await open();
    expect(host.querySelector('dialog[aria-labelledby]')).not.toBeNull();
    await fill('Block title','Seminar');
    await fill('Block type','busy');
    await click('Create calendar block');
    await vi.waitFor(()=>expect(api.createCalendarBlock).toHaveBeenCalledTimes(1));
    expect(api.createCalendarBlock.mock.calls[0][0]).toMatchObject({
      kind:'busy',title:'Seminar',startsAt:new Date('2026-11-06T09:00').toISOString(),
      endsAt:new Date('2026-11-06T10:00').toISOString(),timeZone:zone,
    });
    expect(messages.toast).toHaveBeenCalledTimes(1);
    expect(messages.toast.mock.calls[0][1].action.label).toBe('Undo');
    await act(async()=>messages.toast.mock.calls[0][1].action.onClick());
    await vi.waitFor(()=>expect(api.deleteCalendarBlock).toHaveBeenCalledWith('created-1',1));
    expect(changed).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(opener);
  });
  it('edits title/type/times/status using expectedVersion; Undo restores previous values',async()=>{
    const api=fake([block]);
    await open(block);
    await fill('Block title','Busy meeting');
    await fill('Block type','busy');
    await fill('Block status','done');
    await fill('Sheet block start','2026-11-06T11:00');
    await fill('Sheet block end','2026-11-06T12:00');
    await click('Save block changes');
    await vi.waitFor(()=>expect(api.updateCalendarBlock).toHaveBeenCalledTimes(1));
    expect(api.updateCalendarBlock.mock.calls[0]).toEqual(['block-1',3,expect.objectContaining({
      kind:'busy',title:'Busy meeting',status:'done',
      startsAt:new Date('2026-11-06T11:00').toISOString(),endsAt:new Date('2026-11-06T12:00').toISOString(),
    })]);
    await act(async()=>messages.toast.mock.calls[0][1].action.onClick());
    await vi.waitFor(()=>expect(api.updateCalendarBlock).toHaveBeenCalledTimes(2));
    expect(api.updateCalendarBlock.mock.calls[1][1]).toBe(4);
    expect(api.rows()[0].title).toBe('Proofs');
    expect(api.rows()[0].status).toBe('planned');
  });
  it('deletes after confirmation; Undo recreates a block without rewriting other blocks',async()=>{
    const api=fake([block,{...block,id:'other',title:'Unrelated'}]);
    await open(block);
    await click('Delete block');await click('Confirm sheet delete');
    await vi.waitFor(()=>expect(api.deleteCalendarBlock).toHaveBeenCalledWith('block-1',3));
    expect(api.rows().map(item=>item.id)).toEqual(['other']);
    await act(async()=>messages.toast.mock.calls[0][1].action.onClick());
    await vi.waitFor(()=>expect(api.createCalendarBlock).toHaveBeenCalledTimes(1));
    expect(api.rows().find(item=>item.id==='other')?.title).toBe('Unrelated');
    expect(api.rows().some(item=>item.title==='Proofs')).toBe(true);
  });
  it('shows conflict and triggers reload without overwriting the block',async()=>{
    const api=fake([block]);
    api.updateCalendarBlock.mockRejectedValueOnce(Object.assign(new Error('stale version'),{code:'conflict'}));
    await open(block);
    await fill('Block title','Conflicting edit');
    await click('Save block changes');
    await vi.waitFor(()=>expect(host.querySelector('[role=alert]')?.textContent).toContain('Changed elsewhere'));
    expect(api.rows()[0].title).toBe('Proofs');
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it('closes on native Escape cancel and restores focus to the opener',async()=>{
    fake();
    await open();
    await act(async()=>{host.querySelector('dialog')!.dispatchEvent(new Event('cancel',{cancelable:true}));});
    expect(host.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
