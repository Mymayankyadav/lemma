import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import TimeLog,{csvLog,visibleLogRange,visibleLogRecords} from '../../../src/features/time-log/Page';
import {setStudyApiForTests} from '../../../src/data/study';
import {emptyStudyApi,type StudyEntryRecord,type StudyApi} from '../../../src/data/study/contract';
import {isFlagOn} from '../../../src/flags';
import {getMode} from '../../../src/data/mode';
vi.mock('../../../src/flags',()=>({isFlagOn:vi.fn(()=>true)}));
const at='2026-11-06T09:00:00.000Z',end='2026-11-06T09:30:00.000Z';
function row(id='row-1',version=1):StudyEntryRecord{
 return {id,intent:'Proof, "lemma"',status:'saved',source:'timer',reflection:null,
  rating:null,version,createdAt:at,updatedAt:end,savedAt:end,
  intervals:[{id:id+'-i',kind:'focus',start:at,end}],approximate:false,voidedAt:null};
}
function api(initial:StudyEntryRecord[]=[row()]){
 let rows=[...initial];
 const client={...emptyStudyApi(getMode()),
  listStudyEntries:vi.fn(async()=>rows.slice()),
  correctStudyEntry:vi.fn(async(id:string,version:number,patch:Record<string,unknown>)=>{
   rows=rows.map(r=>r.id===id?{...r,version:version+1,...patch}:r);
   return {record:rows.find(r=>r.id===id)!,actionNo:1};
  }),
  voidStudyEntry:vi.fn(async(id:string,version:number)=>{
   rows=rows.map(r=>r.id===id?{...r,version:version+1,status:'discarded',voidedAt:at}:r);
   return {record:rows[0],actionNo:1};
  }),
  restoreStudyEntry:vi.fn(async(id:string,version:number)=>{
   rows=rows.map(r=>r.id===id?{...r,version:version+1,status:'saved',voidedAt:null}:r);
   return {record:rows[0],actionNo:1};
  }),
  splitStudyEntry:vi.fn(async(id:string,version:number)=>{
   return {record:{original:row(id,version+1),created:row('split',1)},actionNo:2};
  }),
  createManualStudyEntry:vi.fn(async(input:{intent:string})=>{
   const next={...row('manual'),intent:input.intent,source:'manual' as const,approximate:true};
   rows.push(next);return {record:next,actionNo:1};
  })
 } as StudyApi;
 setStudyApiForTests(client);
 return client;
}
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.mocked(isFlagOn).mockReturnValue(true);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
 await act(async()=>root.unmount());host.remove();setStudyApiForTests(null);vi.clearAllMocks();
});
async function render(){
 await act(async()=>root.render(<MemoryRouter initialEntries={['/log']}>
  <Routes><Route path="/log" element={<TimeLog/>}/><Route path="/" element={<p>Legacy</p>}/></Routes>
 </MemoryRouter>));
 await vi.waitFor(()=>expect(host.textContent).not.toContain('Loading time log'));
}
function button(text:string){
 const found=[...host.querySelectorAll('button')].find(x=>x.textContent?.trim()===text);
 if(!found)throw Error('Missing button '+text);
 return found;
}
async function click(node:HTMLElement){await act(async()=>node.click());}
async function change(node:HTMLInputElement|HTMLTextAreaElement,value:string){
 const cls=node instanceof HTMLTextAreaElement?HTMLTextAreaElement:HTMLInputElement;
 const setter=Object.getOwnPropertyDescriptor(cls.prototype,'value')!.set!;
 await act(async()=>{setter.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
}
describe('N73 time log',()=>{
 it('retains only explicitly voided discarded entries for a restore action',()=>{
  const saved=row('saved'),voided={...row('voided'),status:'discarded' as const,voidedAt:at},
   unsaved={...row('ordinary-discard'),status:'discarded' as const,voidedAt:null};
  expect(visibleLogRecords([saved,voided,unsaved]).map(e=>e.id).sort()).toEqual(['saved','voided']);
 });
 it('uses owner civil boundaries and exports escaped values, unknown ratings and intervals',()=>{
  const range=visibleLogRange('2026-11-01','Asia/Kolkata');
  expect(range.start).toBe('2026-10-31T18:30:00.000Z');
  expect(range.end).toBe('2026-11-07T18:30:00.000Z');
  const csv=csvLog([row()],'UTC');
  expect(csv).toContain('Proof, ""lemma""');
  expect(csv).toContain('"focus"');
  expect(csv).toContain('""');
 });
 it('shows a bounded 50-entry client page, day groups and saved intervals',async()=>{
  const items=Array.from({length:54},(_,i)=>row('row-'+i));
  api(items);await render();
  expect(host.textContent).toContain('54 saved entries');
  expect(host.querySelectorAll('article')).toHaveLength(50);
  await click(button('Next page'));
  expect(host.querySelectorAll('article')).toHaveLength(4);
  expect(host.textContent).toContain('focus:');
 });
 it('edits interval, intent and unknown rating through optimistic StudyApi',async()=>{
  const client=api();await render();await click(button('Edit entry'));
  const input=host.querySelector('[aria-label="Edit intent"]') as HTMLInputElement;
  await change(input,'Revised proof');
  await click(button('Save changes'));
  await vi.waitFor(()=>expect(client.correctStudyEntry).toHaveBeenCalledTimes(1));
  expect(client.correctStudyEntry).toHaveBeenCalledWith('row-1',1,
   expect.objectContaining({intent:'Revised proof',rating:null,intervals:[{kind:'focus',start:at,end}]}));
 });
 it('voids and then restores via versioned actions',async()=>{
  const client=api();await render();await click(button('Edit entry'));await click(button('Void entry'));
  await vi.waitFor(()=>expect(client.voidStudyEntry).toHaveBeenCalledWith('row-1',1));
  expect(host.textContent).toContain('Voided');
  await click(button('Edit entry'));
  expect(button('Restore entry')).toBeDefined();
  await click(button('Restore entry'));
  await vi.waitFor(()=>expect(client.restoreStudyEntry).toHaveBeenCalledWith('row-1',2));
 });
 it('validates manual approximate time and refuses reversal',async()=>{
  const client=api();await render();await click(button('Add approximate time'));
  await change(host.querySelector('[aria-label="Manual intent"]') as HTMLInputElement,'Reading notes');
  await change(host.querySelector('[aria-label="Manual start"]') as HTMLInputElement,end);
  await change(host.querySelector('[aria-label="Manual end"]') as HTMLInputElement,at);
  await click(button('Save approximate time'));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('End must follow');
  expect(client.createManualStudyEntry).not.toHaveBeenCalled();
  await change(host.querySelector('[aria-label="Manual end"]') as HTMLInputElement,'2026-11-06T10:00:00.000Z');
  await click(button('Save approximate time'));
  await vi.waitFor(()=>expect(client.createManualStudyEntry).toHaveBeenCalledTimes(1));
  expect(host.textContent).toContain('Approximate');
 });
 it('does not fetch any study data with v6Shell off',async()=>{
  const client=api();
  vi.mocked(isFlagOn).mockReturnValue(false);
  await render();
  expect(host.textContent).toContain('Legacy');
  expect(client.listStudyEntries).not.toHaveBeenCalled();
 });
});
