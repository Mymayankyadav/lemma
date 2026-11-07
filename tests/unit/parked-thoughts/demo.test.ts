import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoThoughtApi} from '../../../src/data/parked-thoughts/demo';
import {createDemoTaskApi} from '../../../src/data/tasks/demo';

const KEY='lemma.v6.demo.parked-thoughts.v1';
beforeEach(()=>{
 sessionStorage.clear();
 vi.useFakeTimers();
 vi.setSystemTime(new Date('2026-11-07T12:00:00.000Z'));
});
afterEach(()=>{vi.useRealTimers();sessionStorage.clear();});

describe('N58.2.2 parked thoughts demo lifecycle and paging',()=>{
 it('seeds linked, open and dismissed fixtures isolated from tasks storage',async()=>{
  const api=createDemoThoughtApi();
  expect(api.mode).toBe('demo');
  expect((await api.listThoughts()).items.map(x=>x.id)).toEqual(['demo-thought-1','demo-thought-2']);
  expect((await api.listThoughts({status:['dismissed']})).items.map(x=>x.id)).toEqual(['demo-thought-3']);
  expect((await api.getThought('demo-thought-1'))?.studyEntryId).toBe('demo-study-entry-1');
  expect(sessionStorage.getItem(KEY)).toContain('demo-thought-3');
  expect(sessionStorage.getItem('lemma.v6.demo.tasks.v1')).toBeNull();
 });
 it('creates, trims and reloads without sharing mutable record references',async()=>{
  const first=createDemoThoughtApi();
  const result=await first.createThought({text:'  Try a simpler theorem  ',studyEntryId:null});
  expect(result).toMatchObject({actionNo:null,record:{text:'Try a simpler theorem',version:1,status:'open',studyEntryId:null}});
  const id=result.record.id;
  result.record.text='Tampered result';
  expect((await first.getThought(id))?.text).toBe('Try a simpler theorem');
  const second=createDemoThoughtApi();
  expect((await second.getThought(id))?.text).toBe('Try a simpler theorem');
  expect((await second.listThoughts()).total).toBe(3);
  expect(await second.getThought('not-found')).toBeNull();
 });
 it('optimistically edits and checks stale versions across instances',async()=>{
  const one=createDemoThoughtApi(),two=createDemoThoughtApi();
  const edited=await one.editThought('demo-thought-1',1,{text:' Better proof ',studyEntryId:null});
  expect(edited.record).toMatchObject({version:2,text:'Better proof',studyEntryId:null});
  await expect(two.editThought('demo-thought-1',1,{text:'Stale'})).rejects.toMatchObject({code:'conflict'});
  await expect(two.dismissThought('demo-thought-1',1)).rejects.toMatchObject({code:'conflict'});
  expect((await two.getThought('demo-thought-1'))?.text).toBe('Better proof');
 });
 it('dismisses/reopens only valid states and preserves identity and timestamps',async()=>{
  const api=createDemoThoughtApi();
  const dismissed=await api.dismissThought('demo-thought-1',1);
  expect(dismissed.record).toMatchObject({status:'dismissed',resolvedAt:'2026-11-07T12:00:00.000Z',version:2});
  expect((await api.listThoughts()).total).toBe(1);
  await expect(api.dismissThought('demo-thought-1',2)).rejects.toMatchObject({code:'invalid'});
  await expect(api.editThought('demo-thought-1',2,{text:'No'})).rejects.toMatchObject({code:'invalid'});
  const reopened=await api.reopenThought('demo-thought-1',2);
  expect(reopened.record).toMatchObject({id:'demo-thought-1',status:'open',resolvedAt:null,version:3});
  await expect(api.reopenThought('demo-thought-1',3)).rejects.toMatchObject({code:'invalid'});
  expect((await createDemoThoughtApi().listThoughts()).total).toBe(2);
 });
 it('provides bounded filter-locked keyset pages with an exact total past 50 records',async()=>{
  const api=createDemoThoughtApi();
  for(let i=0;i<55;i++)await api.createThought({text:'Extra thought '+i});
  const ids:string[]=[];
  let cursor:string|null=null;
  for(let n=0;n<12;n++){
   const page=await api.listThoughts({limit:7,cursor});
   expect(page.items.length).toBeLessThanOrEqual(7);
   expect(page.total).toBe(57);
   ids.push(...page.items.map(t=>t.id));
   cursor=page.nextCursor;
   if(cursor===null)break;
  }
  expect(ids).toHaveLength(57);
  expect(new Set(ids).size).toBe(57);
  const page=await api.listThoughts({limit:1});
  await expect(api.listThoughts({status:['dismissed'],cursor:page.nextCursor})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listThoughts({cursor:'bad!'})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listThoughts({limit:0})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listThoughts({limit:51})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listThoughts({limit:1.5})).rejects.toMatchObject({code:'invalid'});
 });
 it('rejects unrecognized owner fields, empty edits and invalid state changes',async()=>{
  const api=createDemoThoughtApi();
  await expect(api.createThought({text:'Own',user_id:'forged'} as never)).rejects.toMatchObject({code:'invalid'});
  await expect(api.createThought({text:'   '})).rejects.toMatchObject({code:'invalid'});
  await expect(api.editThought('demo-thought-1',1,{})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listThoughts({owner_id:'forged'} as never)).rejects.toMatchObject({code:'invalid'});
  await expect(api.listThoughts({status:['invalid'] as never})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listThoughts(null as never)).rejects.toMatchObject({code:'invalid'});
  await expect(api.getThought('')).rejects.toMatchObject({code:'invalid'});
  await expect(api.deleteThought('demo-thought-1',0)).rejects.toMatchObject({code:'invalid'});
  const removed=await api.deleteThought('demo-thought-2',1);
  expect(removed).toMatchObject({actionNo:null,record:{id:'demo-thought-2'}});
  expect(await api.getThought('demo-thought-2')).toBeNull();
  await expect(api.deleteThought('demo-thought-2',1)).rejects.toMatchObject({code:'not_found'});
 });
 it('atomically converts into a real TaskApi task, persists both and survives reload',async()=>{
  const api=createDemoThoughtApi();
  const converted=await api.convertToTask('demo-thought-1',1,{
   title:'Prove the original lemma',estimateMinutes:35,priority:'high',
  });
  expect(converted.actionNo).toBeNull();
  expect(converted.record.thought).toMatchObject({
   id:'demo-thought-1',status:'converted',destinationKind:'task',
   destinationId:converted.record.task.id,version:2,
  });
  expect(converted.record.task).toMatchObject({
   title:'Prove the original lemma',estimateMinutes:35,priority:'high',
   status:'backlog',version:1,
  });
  expect((await createDemoTaskApi().getTask(converted.record.task.id))?.title)
   .toBe('Prove the original lemma');
  expect((await createDemoThoughtApi().getThought('demo-thought-1'))?.destinationId)
   .toBe(converted.record.task.id);
  expect((await createDemoThoughtApi().listThoughts()).total).toBe(1);
  await expect(createDemoThoughtApi().convertToTask('demo-thought-1',1,
   {title:'Duplicate'})).rejects.toMatchObject({code:'conflict'});
  await expect(createDemoThoughtApi().convertToTask('demo-thought-1',2,
   {title:'Duplicate'})).rejects.toMatchObject({code:'invalid'});
  expect((await createDemoTaskApi().listTasks({status:['backlog']})).items.filter(x=>
   x.title==='Prove the original lemma')).toHaveLength(1);
 });
 it('fails conversion without creating orphan tasks or resolving the thought',async()=>{
  const api=createDemoThoughtApi(),before=await api.getThought('demo-thought-2');
  const stored=sessionStorage.getItem('lemma.v6.demo.tasks.v1');
  await expect(api.convertToTask('demo-thought-2',1,{
   title:'Invalid task',priority:'forged' as never,
  })).rejects.toThrow();
  expect(await api.getThought('demo-thought-2')).toEqual(before);
  expect(sessionStorage.getItem('lemma.v6.demo.tasks.v1')).toBe(stored);
  await expect(api.convertToTask('demo-thought-2',2,{title:'Stale'}))
   .rejects.toMatchObject({code:'conflict'});
 });
});
