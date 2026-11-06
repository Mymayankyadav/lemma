import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import CalendarPage from '../../../src/features/calendar/Page';
import {instantInZone,blockFormInput,zonedInput} from '../../../src/features/calendar/block-sheet/BlockSheet';
import {setStudyApiForTests} from '../../../src/data/study';
import {emptyStudyApi,type CalendarBlockRecord} from '../../../src/data/study/contract';
import {useToast} from '../../../src/ui/Toast';

const flags=vi.hoisted(()=>({enabled:true}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>flags.enabled}));
vi.mock('../../../src/ui/Toast',()=>({useToast:vi.fn()}));
const original:CalendarBlockRecord={
 id:'block-1',kind:'study',title:'Work through notes',status:'planned',
 startsAt:'2026-11-06T09:00:00.000Z',endsAt:'2026-11-06T10:00:00.000Z',
 timeZone:'UTC',version:1,subjectId:null,projectId:null,checkpointId:null,sessionId:null,
};
let root:Root,host:HTMLDivElement,notify:ReturnType<typeof vi.fn>;
function makeFake(records:CalendarBlockRecord[]=[original]){
 let rows=records.map(row=>({...row})),counter=1;
 const listStudyEntries=vi.fn(async()=>[]);
 const listCalendarBlocks=vi.fn(async()=>rows.map(row=>({...row})));
 const createCalendarBlock=vi.fn(async(input:Parameters<ReturnType<typeof emptyStudyApi>['createCalendarBlock']>[0])=>{
  const record:CalendarBlockRecord={...input,id:'new-'+counter++,version:1,status:'planned'};
  rows.push(record);
  return {record,actionNo:null};
 });
 const updateCalendarBlock=vi.fn(async(id:string,expectedVersion:number,
   patch:Parameters<ReturnType<typeof emptyStudyApi>['updateCalendarBlock']>[2])=>{
  const before=rows.find(row=>row.id===id);
  if(!before||before.version!==expectedVersion)throw Object.assign(new Error('stale'),{code:'conflict'});
  const record={...before,...patch,version:before.version+1};
  rows=rows.map(row=>row.id===id?record:row);
  return {record,actionNo:null};
 });
 const deleteCalendarBlock=vi.fn(async(id:string,expectedVersion:number)=>{
  const before=rows.find(row=>row.id===id);
  if(!before||before.version!==expectedVersion)throw Object.assign(new Error('stale'),{code:'conflict'});
  rows=rows.filter(row=>row.id!==id);
  return {record:{id},actionNo:null};
 });
 setStudyApiForTests({...emptyStudyApi('demo'),listStudyEntries,listCalendarBlocks,
   createCalendarBlock,updateCalendarBlock,deleteCalendarBlock});
 return {listStudyEntries,listCalendarBlocks,createCalendarBlock,updateCalendarBlock,
   deleteCalendarBlock,setRows(value:CalendarBlockRecord[]){rows=value;}};
}
async function render(path='/calendar?date=2026-11-06&view=day'){
 await act(async()=>{root.render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/calendar" element={<CalendarPage/>}/>
  <Route path="/" element={<p>Legacy route</p>}/>
 </Routes></MemoryRouter>);});
 await vi.waitFor(()=>{if(flags.enabled)expect(host.textContent).not.toContain('Loading calendar');});
}
function button(label:string) {
 const result=[...host.querySelectorAll('button')].find(node=>
  node.textContent?.trim()===label||node.getAttribute('aria-label')===label);
 expect(result,'Missing button '+label).toBeDefined();
 return result!;
}
async function click(label:string){await act(async()=>button(label).click());}
async function enter(label:string,value:string){
 const element=[...host.querySelectorAll('input,select')].find(node=>node.getAttribute('aria-label')===label);
 expect(element,'Missing '+label).toBeDefined();
 await act(async()=>{
  const proto=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(element,value);
  element!.dispatchEvent(new Event('input',{bubbles:true}));
  element!.dispatchEvent(new Event('change',{bubbles:true}));
 });
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 flags.enabled=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);
 notify=vi.fn();vi.mocked(useToast).mockReturnValue(notify);
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,
  value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,
  value:function(this:HTMLDialogElement){this.open=false;}});
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 host.remove();setStudyApiForTests(null);vi.clearAllMocks();
});
describe('N27 calendar owner-zone block editor',()=>{
 it('validates wall times, including gap and overlap on a DST boundary',()=>{
  expect(instantInZone('2026-11-06T09:00','Asia/Kolkata')).toBe('2026-11-06T03:30:00.000Z');
  expect(zonedInput('2026-11-06T03:30:00.000Z','Asia/Kolkata')).toBe('2026-11-06T09:00');
  expect(instantInZone('2026-03-29T01:30','Europe/London')).toBeNull();
  expect(instantInZone('2026-10-25T01:30','Europe/London')).toBe('2026-10-25T00:30:00.000Z');
  expect(()=>blockFormInput({title:'Late',kind:'busy',zone:'UTC',
   start:'2026-11-06T10:00',end:'2026-11-06T09:00'})).toThrow('before the end');
  expect(()=>blockFormInput({title:' ',kind:'study',zone:'UTC',
   start:'2026-11-06T09:00',end:'2026-11-06T10:00'})).toThrow('title');
 });
 it('opens from Calendar add action and creates busy time with one undo toast',async()=>{
  const api=makeFake([]);
  await render();
  const trigger=button('Plan block in sheet');
  await click('Plan block in sheet');
  expect(host.querySelector('dialog')?.open).toBe(true);
  expect(host.querySelector('dialog')?.getAttribute('aria-labelledby')).toBeTruthy();
  await enter('Calendar block title','Research meeting');
  await enter('Calendar block type','busy');
  await click('Create block');
  expect(api.createCalendarBlock).toHaveBeenCalledTimes(1);
  expect(api.createCalendarBlock).toHaveBeenCalledWith(expect.objectContaining({
   kind:'busy',title:'Research meeting',timeZone:expect.any(String),
   startsAt:expect.any(String),endsAt:expect.any(String)
  }));
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify.mock.calls[0][0]).toBe('Calendar block created');
  expect(host.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  const undo=notify.mock.calls[0][1].action;
  expect(undo.label).toBe('Undo');
  await act(async()=>{undo.onClick();await Promise.resolve();});
  expect(api.deleteCalendarBlock).toHaveBeenCalledTimes(1);
  expect(api.deleteCalendarBlock.mock.calls[0][1]).toBe(1);
 });
 it('edits title, kind, time and status using one expected version; Undo restores previous values',async()=>{
  const api=makeFake();
  await render();
  await click('Edit block Work through notes');
  expect(host.querySelector('dialog')?.open).toBe(true);
  expect(host.querySelector('dialog')?.textContent).toContain('Edit calendar block');
  await enter('Calendar block title','New lecture');
  await enter('Calendar block type','busy');
  await enter('Calendar block start','2026-11-06T11:00');
  await enter('Calendar block end','2026-11-06T12:00');
  await enter('Calendar block status','done');
  await click('Save changes');
  expect(api.updateCalendarBlock).toHaveBeenCalledTimes(1);
  expect(api.updateCalendarBlock.mock.calls[0][0]).toBe('block-1');
  expect(api.updateCalendarBlock.mock.calls[0][1]).toBe(1);
  expect(api.updateCalendarBlock.mock.calls[0][2]).toMatchObject({
   title:'New lecture',kind:'busy',status:'done',timeZone:expect.any(String)
  });
  const undo=notify.mock.calls[0][1].action;
  await act(async()=>{undo.onClick();await Promise.resolve();});
  expect(api.updateCalendarBlock).toHaveBeenCalledTimes(2);
  expect(api.updateCalendarBlock.mock.calls[1][1]).toBe(2);
  expect(api.updateCalendarBlock.mock.calls[1][2]).toMatchObject({
   title:original.title,kind:original.kind,status:'planned',
   startsAt:original.startsAt,endsAt:original.endsAt,timeZone:'UTC'
  });
 });
 it('confirms deletion and Undo re-creates a block with its preserved details',async()=>{
  const api=makeFake();
  await render();
  await click('Edit block Work through notes');
  await click('Delete block');
  expect(api.deleteCalendarBlock).not.toHaveBeenCalled();
  await click('Keep block');
  expect(api.deleteCalendarBlock).not.toHaveBeenCalled();
  await click('Delete block');
  await click('Confirm delete block');
  expect(api.deleteCalendarBlock).toHaveBeenCalledWith('block-1',1);
  expect(host.querySelector('dialog')).toBeNull();
  expect(notify.mock.calls[0][0]).toBe('Calendar block deleted');
  const undo=notify.mock.calls[0][1].action;
  await act(async()=>{undo.onClick();await Promise.resolve();});
  expect(api.createCalendarBlock).toHaveBeenCalledWith(expect.objectContaining({
   title:original.title,kind:original.kind,startsAt:original.startsAt,endsAt:original.endsAt
  }));
 });
 it('blocks invalid reversed times and does not write',async()=>{
  const api=makeFake();
  await render();
  await click('Plan block in sheet');
  await enter('Calendar block title','Bad interval');
  await enter('Calendar block start','2026-11-06T12:00');
  await enter('Calendar block end','2026-11-06T11:00');
  await click('Create block');
  expect(host.querySelector('dialog [role="alert"]')?.textContent).toContain('before the end');
  expect(api.createCalendarBlock).not.toHaveBeenCalled();
 });
 it('on a stale version reloads the block and shows a conflict instead of overwriting',async()=>{
  const api=makeFake();
  await render();
  api.updateCalendarBlock.mockRejectedValueOnce(Object.assign(new Error('version conflict'),{code:'conflict'}));
  await click('Edit block Work through notes');
  await enter('Calendar block title','Local edit');
  api.setRows([{...original,title:'Remote edit',version:2}]);
  await click('Save changes');
  expect(api.updateCalendarBlock).toHaveBeenCalledTimes(1);
  expect(api.updateCalendarBlock.mock.calls[0][1]).toBe(1);
  await vi.waitFor(()=>expect(host.querySelector('dialog [role="alert"]')?.textContent).toContain('Changed elsewhere'));
  expect((host.querySelector('input[aria-label="Calendar block title"]') as HTMLInputElement).value).toBe('Remote edit');
  expect(api.listCalendarBlocks).toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
 });
 it('restores focus when Escape closes the native dialog',async()=>{
  makeFake();
  await render();
  const trigger=button('Edit block Work through notes');
  await click('Edit block Work through notes');
  const dialog=host.querySelector('dialog')!;
  await act(async()=>{dialog.dispatchEvent(new Event('cancel',{bubbles:true,cancelable:true}));await Promise.resolve();});
  expect(host.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
 });
 it('opens from Agenda, leaves saved study entries read-only and respects the flag off',async()=>{
  const api=makeFake();
  await render('/calendar?date=2026-11-06&view=agenda');
  await click('Edit block Work through notes');
  expect(host.querySelector('dialog')?.open).toBe(true);
  await click('Cancel');
  expect(api.updateCalendarBlock).not.toHaveBeenCalled();
  flags.enabled=false;
  await act(async()=>{root.render(<MemoryRouter><CalendarPage/></MemoryRouter>);});
  expect(host.querySelector('dialog')).toBeNull();
 });
});
