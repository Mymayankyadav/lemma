import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {setSurfaceBeta} from '../../../src/app/surfaceBeta';
import type {StudyEntryRecord,StudyApi} from '../../../src/data/study/contract';
import TimeLogV7,{warmTimeLog} from '../../../src/features/time-log/v7/TimeLogV7';

const fake=vi.hoisted(()=>({api:{
 listStudyEntries:vi.fn<StudyApi['listStudyEntries']>(),
 createManualStudyEntry:vi.fn<StudyApi['createManualStudyEntry']>(),
 correctStudyEntry:vi.fn<StudyApi['correctStudyEntry']>(),
 voidStudyEntry:vi.fn<StudyApi['voidStudyEntry']>(),
 restoreStudyEntry:vi.fn<StudyApi['restoreStudyEntry']>(),
}}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>fake.api}));
vi.mock('../../../src/data/hooks',()=>({useSettings:()=>({data:{timeZone:'UTC'}}),useProjects:()=>({data:[]})}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>()=>{}}));
vi.mock('../../../src/app/v7/PageHeaders',()=>({HubHeader:({children}:any)=><header>{children}</header>}));

const start='2026-10-06T09:00:00.000Z',end='2026-10-06T09:30:00.000Z';
const original:StudyEntryRecord={
 id:'proof',intent:'Original proof',status:'saved',source:'manual',reflection:null,rating:null,version:1,
 createdAt:start,updatedAt:end,savedAt:end,intervals:[{id:'focus',kind:'focus',start,end}],
};
let rows:StudyEntryRecord[],host:HTMLDivElement,root:ReturnType<typeof createRoot>;

beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.useFakeTimers({toFake:['Date']});
 vi.setSystemTime(new Date(end));
 setSurfaceBeta(true);
 rows=[original];
 fake.api.listStudyEntries.mockImplementation(async()=>rows.slice());
 fake.api.createManualStudyEntry.mockImplementation(async input=>{
  const record={...original,id:'new',intent:input.intent};
  rows.push(record);
  return {record,actionNo:1};
 });
 fake.api.correctStudyEntry.mockImplementation(async(_,version,patch)=>{
  const record={...rows[0],intent:patch.intent!,version:version+1};
  rows=[record];
  return {record,actionNo:2};
 });
 fake.api.voidStudyEntry.mockImplementation(async(_,version)=>{
  const record={...rows[0],status:'discarded' as const,voidedAt:end,version:version+1};
  rows=[record];
  return {record,actionNo:3};
 });
 fake.api.restoreStudyEntry.mockImplementation(async(_,version)=>{
  const record={...rows[0],status:'saved' as const,voidedAt:null,version:version+1};
  rows=[record];
  return {record,actionNo:4};
 });
 host=document.createElement('div');
 document.body.append(host);
 root=createRoot(host);
});

afterEach(async()=>{
 await act(async()=>root.unmount());
 host.remove();
 setSurfaceBeta(false);
 vi.useRealTimers();
});

async function mount(){
 await act(async()=>root.render(<MemoryRouter initialEntries={['/log?day=2026-10-06']}><TimeLogV7/></MemoryRouter>));
}

async function click(name:string,scope:ParentNode=host){
 const button=[...scope.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===name || node.textContent?.trim()===name);
 if(!button)throw Error('Missing button '+name);
 await act(async()=>{button.focus();button.click();});
}

async function editIntent(value:string){
 const input=host.querySelector<HTMLInputElement>('dialog[open] input')!;
 const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;
 await act(async()=>{
  setter.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
}

function expectRow(text:string){
 expect([...host.querySelectorAll('.v7-log-row strong')].map(node=>node.textContent)).toContain(text);
}

it('keeps the hash router intact and opens the selected day’s week',async()=>{
 await mount();
 const links=[...host.querySelectorAll('a.v7-log-day')];
 expect(links).toHaveLength(7);
 expect(links.map(link=>link.getAttribute('href'))).toContain('#/log?day=2026-10-06');
 expect(links.every(link=>link.getAttribute('href')?.startsWith('#/log?day='))).toBe(true);
 expect(fake.api.listStudyEntries).toHaveBeenCalledWith({start:'2026-10-05T00:00:00.000Z',end:'2026-10-12T00:00:00.000Z'});
});

it('reuses a navigation warm read but ignores older reads after adding time',async()=>{
 let finishInitial!: (records:StudyEntryRecord[])=>void;
 let finishWarm!: (records:StudyEntryRecord[])=>void;
 const initialRead=new Promise<StudyEntryRecord[]>(resolve=>{finishInitial=resolve;});
 const warmRead=new Promise<StudyEntryRecord[]>(resolve=>{finishWarm=resolve;});
 fake.api.listStudyEntries.mockImplementationOnce(()=>initialRead).mockImplementationOnce(()=>warmRead);

 warmTimeLog('UTC');
 await mount();
 expect(fake.api.listStudyEntries).toHaveBeenCalledTimes(1);
 warmTimeLog('UTC');
 expect(fake.api.listStudyEntries).toHaveBeenCalledTimes(2);

 await click('Add time');
 await editIntent('Read a new lemma');
 await click('Add time',host.querySelector('dialog[open]')!);
 expect(fake.api.createManualStudyEntry).toHaveBeenCalledOnce();
 expect(fake.api.listStudyEntries).toHaveBeenCalledTimes(3);
 expectRow('Read a new lemma');

 await act(async()=>{
  finishWarm([original]);
  finishInitial([original]);
 });
 expectRow('Read a new lemma');
});

it('updates edited, voided and restored rows despite a warm read before every write',async()=>{
 await mount();
 warmTimeLog('UTC');
 await click('Actions for Original proof');
 await click('Edit');
 await editIntent('Corrected proof');
 await click('Save changes');
 expectRow('Corrected proof');

 warmTimeLog('UTC');
 await click('Actions for Corrected proof');
 await click('Void');
 await click('Void entry');
 expect(host.querySelector('.v7-log-row')?.getAttribute('data-voided')).toBe('true');

 warmTimeLog('UTC');
 await click('Actions for Corrected proof');
 await click('Restore');
 await click('Restore entry');
 expect(host.querySelector('.v7-log-row')?.hasAttribute('data-voided')).toBe(false);
 expect(fake.api.listStudyEntries).toHaveBeenCalledTimes(7);
});

it('refreshes a remounted log when a previous write finishes',async()=>{
 let finishWrite!:()=>void;
 let finishRead!:(records:StudyEntryRecord[])=>void;
 const write=new Promise<void>(resolve=>{finishWrite=resolve;});
 const priorRead=new Promise<StudyEntryRecord[]>(resolve=>{finishRead=resolve;});
 const create=fake.api.createManualStudyEntry.getMockImplementation()!;
 fake.api.createManualStudyEntry.mockImplementationOnce(async input=>{
  await write;
  return create(input);
 });

 await mount();
 await click('Add time');
 await editIntent('Saved while away');
 await click('Add time',host.querySelector('dialog[open]')!);
 await act(async()=>root.render(null));

 fake.api.listStudyEntries.mockImplementationOnce(()=>priorRead);
 warmTimeLog('UTC');
 await mount();
 expect(fake.api.listStudyEntries).toHaveBeenCalledTimes(2);

 await act(async()=>finishWrite());
 expect(fake.api.listStudyEntries).toHaveBeenCalledTimes(3);
 expectRow('Saved while away');
 await act(async()=>finishRead([original]));
 expectRow('Saved while away');
});
