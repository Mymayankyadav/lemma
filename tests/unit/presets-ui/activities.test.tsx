import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import Activities,{activityPresetInput,loadActivityPresets}
 from '../../../src/features/settings/v6/Activities';
import {getPresetApi} from '../../../src/data/presets';
import type {PresetApi,PresetRecord} from '../../../src/data/presets/contract';

vi.mock('../../../src/data/presets',()=>({getPresetApi:vi.fn()}));
const make=(i:number,archivedAt:string|null=null):PresetRecord=>({
 id:'preset-'+i,label:'Routine '+i,mode:'pomodoro',
 focusMinutes:25,breakMinutes:5,longBreakMinutes:15,cycles:4,
 subjectId:null,projectId:null,checkpointId:null,position:i,
 archivedAt,version:1,
 createdAt:'2026-11-07T09:00:00Z',updatedAt:'2026-11-07T09:00:00Z',
});
let rows:PresetRecord[],api:PresetApi,root:Root,host:HTMLDivElement;
let idNum:number;
const receipt=<T,>(record:T)=>({record,actionNo:null});
function setup(){
 api={
  mode:'demo',
  listPresets:vi.fn(async({limit=50,cursor=null}={})=>{
   const offset=cursor?Number(cursor):0;
   const page=rows.slice(offset,offset+limit);
   return {items:page,total:rows.length,
    nextCursor:offset+limit<rows.length?String(offset+limit):null};
  }),
  getPreset:vi.fn(async id=>rows.find(row=>row.id===id)??null),
  createPreset:vi.fn(async value=>{
   const row={...make(++idNum),...value,position:value.position??rows.length} as PresetRecord;
   rows.push(row);return receipt(row);
  }),
  updatePreset:vi.fn(async(id,version,patch)=>{
   const row=rows.find(p=>p.id===id)!;
   expect(version).toBe(row.version);
   Object.assign(row,patch,{version:row.version+1});
   return receipt({...row});
  }),
  reorderPreset:vi.fn(async(id,version,position)=>{
   const row=rows.find(p=>p.id===id)!;
   expect(version).toBe(row.version);
   Object.assign(row,{position,version:row.version+1});
   return receipt({...row});
  }),
  archivePreset:vi.fn(async(id,version)=>{
   const row=rows.find(p=>p.id===id)!;
   expect(version).toBe(row.version);
   Object.assign(row,{archivedAt:'2026-11-07T12:00:00Z',version:row.version+1});
   return receipt({...row});
  }),
  restorePreset:vi.fn(async(id,version)=>{
   const row=rows.find(p=>p.id===id)!;
   expect(version).toBe(row.version);
   Object.assign(row,{archivedAt:null,version:row.version+1});
   return receipt({...row});
  }),
  deletePreset:vi.fn(async(id)=>receipt({id})),
 };
 vi.mocked(getPresetApi).mockReturnValue(api);
}
async function render(){
 await act(async()=>{root.render(<Activities/>);await Promise.resolve()});
}
async function click(label:string){
 const node=[...host.querySelectorAll<HTMLButtonElement>('button')]
  .find(x=>x.getAttribute('aria-label')===label||x.textContent?.trim()===label);
 expect(node,'Missing button '+label).toBeTruthy();
 await act(async()=>{node!.click();await Promise.resolve()});
}
async function change(label:string,value:string){
 const field=host.querySelector<HTMLInputElement|HTMLSelectElement>(
  '[aria-label="'+label+'"]');
 expect(field,'Missing field '+label).toBeTruthy();
 await act(async()=>{
  const proto=field instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(field,value);
  field!.dispatchEvent(new Event('input',{bubbles:true}));
  field!.dispatchEvent(new Event('change',{bubbles:true}));
 });
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 idNum=5;rows=[make(1),make(2),make(3,'2026-11-06T00:00:00Z')];
 setup();
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllMocks()});

describe('N77 Activities v6 owner-API management',()=>{
 it('renders active and archived owner presets, and keeps the list complete',async()=>{
  await render();
  expect(host.querySelector('[aria-label="Active activities"]')?.textContent).toContain('Routine 1');
  expect(host.querySelector('[aria-label="Archived activities"]')?.textContent).toContain('Routine 3');
  expect(host.querySelector('[aria-label="Active activities"]')?.textContent).not.toContain('Routine 3');
  expect(api.listPresets).toHaveBeenCalledWith({archived:'all',limit:50,cursor:null});
  expect(host.textContent).toContain('Focus minutes');
 });
 it('uses only typed create/update/reorder/archive/restore API mutations',async()=>{
  await render();
  await change('Activity name','  Advanced proofs ');
  await change('Activity mode','flowtime');
  await change('Focus minutes','48');
  await click('Create activity');
  expect(api.createPreset).toHaveBeenCalledWith(expect.objectContaining({
   label:'Advanced proofs',mode:'flowtime',focusMinutes:48,
  }));
  expect(host.textContent).toContain('Advanced proofs');
  await click('Edit Routine 1');
  await change('Activity name','Updated routine');
  await click('Save activity');
  expect(api.updatePreset).toHaveBeenCalledWith('preset-1',1,
   expect.objectContaining({label:'Updated routine'}));
  await change('Order Updated routine','7');
  await click('Save order Updated routine');
  expect(api.reorderPreset).toHaveBeenCalledWith('preset-1',2,7);
  await click('Archive Updated routine');
  expect(api.archivePreset).toHaveBeenCalledWith('preset-1',3);
  expect(host.querySelector('[aria-label="Archived activities"]')?.textContent)
   .toContain('Updated routine');
  await click('Restore Updated routine');
  expect(api.restorePreset).toHaveBeenCalledWith('preset-1',4);
  expect(host.querySelector('[aria-label="Active activities"]')?.textContent)
   .toContain('Updated routine');
  expect(api.deletePreset).not.toHaveBeenCalled();
 });
 it('rejects invalid typed values before calls and preserves errors visibly',async()=>{
  await render();
  await change('Activity name','Try');
  await change('Focus minutes','0');
  await click('Create activity');
  expect(api.createPreset).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Focus minutes');
  await change('Focus minutes','25');
  vi.mocked(api.createPreset).mockRejectedValueOnce(Error('Offline'));
  await click('Create activity');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Offline');
  expect(host.querySelector<HTMLInputElement>('[aria-label="Activity name"]')?.value).toBe('Try');
 });
 it('loads 50+ pages without dropping owner presets and rejects cursor loops',async()=>{
  rows=Array.from({length:103},(_,i)=>make(i+1));
  expect((await loadActivityPresets())).toHaveLength(103);
  expect(api.listPresets).toHaveBeenCalledTimes(3);
  vi.mocked(api.listPresets).mockImplementation(async()=>({
   items:[make(1)],total:2,nextCursor:'loop',
  }));
  await expect(loadActivityPresets()).rejects.toThrow(/Repeated.*cursor/);
 });
 it('bounds inputs without mutation or owner metadata',()=>{
  expect(()=>activityPresetInput({...{
   label:'Ready',mode:'pomodoro' as const,focusMinutes:'2.5',
   breakMinutes:'5',longBreakMinutes:'15',cycles:'4',
  }})).toThrow(/whole number/);
  expect(activityPresetInput({
   label:'Valid',mode:'open',focusMinutes:'90',
   breakMinutes:'4',longBreakMinutes:'10',cycles:'2',
  })).toEqual({
   label:'Valid',mode:'open',focusMinutes:90,
   breakMinutes:4,longBreakMinutes:10,cycles:2,
  });
 });
});
