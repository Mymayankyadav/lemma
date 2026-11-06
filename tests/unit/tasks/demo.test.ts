import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoTaskApi} from '../../../src/data/tasks/demo';
import type {TaskDue,TaskRecord} from '../../../src/data/tasks/contract';

const seeded = 'demo-task-1';
const start = new Date('2026-11-06T11:00:00.000Z');
const newTask = {title:'Work on compactness',body:'Prove every closed subset is compact',
  subjectId:'subject-analysis',projectId:'project-analysis',priority:'high' as const};

beforeEach(()=>{
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(start);
});
afterEach(()=>{vi.useRealTimers();sessionStorage.clear();});

describe('N23 demo TaskApi',()=>{
  it('seeds six linked tasks across statuses and returns a bounded default page',async()=>{
    const api=createDemoTaskApi();
    expect(api.mode).toBe('demo');
    const active=await api.listTasks();
    expect(active).toMatchObject({total:4,nextCursor:null});
    expect(active.items.map(t=>t.status)).toEqual(['backlog','backlog','in_progress','in_progress']);
    expect(active.items.map(t=>t.id)).toEqual(['demo-task-1','demo-task-2','demo-task-3','demo-task-4']);
    expect(active.items[0]).toMatchObject({subjectId:'subject-analysis',projectId:'project-analysis',version:1});
    expect((await api.listTasks({status:['completed','cancelled']})).items.map(t=>t.id))
      .toEqual(['demo-task-5','demo-task-6']);
    const completed=(await api.getTask('demo-task-5'))!;
    expect(completed).toMatchObject({status:'completed',completedAt:expect.any(String)});
    expect((await api.getTask('demo-task-6'))?.completedAt).toBeNull();
    expect((await api.listTasks({status:[]}))).toEqual({items:[],total:0,nextCursor:null});
  });

  it('creates a validated record and isolates both inputs and returned objects',async()=>{
    const api=createDemoTaskApi();
    const input={...newTask,due:{kind:'date' as const,date:'2026-11-09'}};
    const created=await api.createTask(input);
    expect(created.actionNo).toBeNull();
    expect(created.record).toMatchObject({...newTask,version:1,status:'backlog',
      position:0,completedAt:null,estimateMinutes:null,
      due:{kind:'date',date:'2026-11-09'},createdAt:start.toISOString()});
    input.due.date='2026-11-10';
    created.record.title='Tampered';
    expect(await api.getTask(created.record.id)).toMatchObject({
      title:newTask.title,due:{kind:'date',date:'2026-11-09'}});
    const found=(await api.getTask(created.record.id))!;
    found.due={kind:'none'};
    expect((await api.getTask(created.record.id))?.due).toEqual({kind:'date',date:'2026-11-09'});
    expect(await api.getTask('missing')).toBeNull();
  });

  it('walks more than 50 tasks with keyset pages and an exact matching total',async()=>{
    const api=createDemoTaskApi();
    for(let i=0;i<50;i++)
      await api.createTask({title:'Extra '+i,position:i+2});
    const ids:string[]=[];
    let cursor:string|null=null;
    for(let n=0;n<12;n++){
      const page=await api.listTasks({limit:7,cursor});
      expect(page.items.length).toBeLessThanOrEqual(7);
      expect(page.total).toBe(54);
      for(const item of page.items)ids.push(item.id);
      cursor=page.nextCursor;
      if(cursor===null)break;
      expect(cursor).not.toContain(page.items.at(-1)!.id);
    }
    expect(ids).toHaveLength(54);
    expect(new Set(ids).size).toBe(54);
    expect(ids.slice(0,2)).toEqual(['demo-task-1','demo-task-2']);
    expect(ids.slice(-2)).toEqual(['demo-task-3','demo-task-4']);
  });

  it('honours explicit status filters, page order and cursor matching',async()=>{
    const api=createDemoTaskApi();
    const page=await api.listTasks({limit:1,status:['in_progress','backlog']});
    expect(page.total).toBe(4);
    expect(page.items.map(t=>t.id)).toEqual(['demo-task-1']);
    expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const next=await api.listTasks({limit:1,status:['backlog','in_progress'],cursor:page.nextCursor});
    expect(next.items.map(t=>t.id)).toEqual(['demo-task-2']);
    await expect(api.listTasks({limit:1,status:['completed'],cursor:page.nextCursor})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listTasks({cursor:'bad!'})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listTasks({limit:0})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listTasks({limit:51})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listTasks({limit:2.5})).rejects.toMatchObject({code:'invalid'});
    const fresh=(await api.listTasks({status:['backlog']})).items;
    expect(fresh.map(t=>t.position)).toEqual([0,1]);
  });

  it('preserves due date vs due instant through create, update and reload',async()=>{
    const api=createDemoTaskApi();
    const result=await api.createTask({...newTask,due:{kind:'date',date:'2026-11-30'}});
    const id=result.record.id;
    expect(result.record.due).toEqual({kind:'date',date:'2026-11-30'});
    const instant: TaskDue={kind:'instant',at:'2026-12-01T09:15:00+05:30'};
    const updated=await api.updateTask(id,1,{due:instant});
    expect(updated.record).toMatchObject({version:2,due:instant});
    const loaded=createDemoTaskApi();
    expect((await loaded.getTask(id))?.due).toEqual(instant);
    const none=await loaded.updateTask(id,2,{due:{kind:'none'}});
    expect(none.record.due).toEqual({kind:'none'});
    expect((await createDemoTaskApi().getTask(id))?.due).toEqual({kind:'none'});
  });

  it('increments versions, detects stale writes across adapter instances and changes nothing',async()=>{
    const a=createDemoTaskApi(),b=createDemoTaskApi();
    const initial=(await a.getTask(seeded))!;
    const updated=await a.updateTask(seeded,initial.version,{title:'Updated',position:5});
    expect(updated).toMatchObject({actionNo:null,record:{title:'Updated',version:2,position:5}});
    await expect(b.updateTask(seeded,1,{title:'Stale'})).rejects.toMatchObject({code:'conflict'});
    await expect(b.deleteTask(seeded,1)).rejects.toMatchObject({code:'conflict'});
    expect(await a.getTask(seeded)).toEqual(updated.record);
    expect((await b.getTask(seeded))?.title).toBe('Updated');
    expect((await a.listTasks()).total).toBe(4);
  });

  it('sets completedAt when completing, preserves it on repeat update, clears it on reopening',async()=>{
    const api=createDemoTaskApi();
    const initial=(await api.getTask(seeded))!;
    const done=await api.updateTask(seeded,initial.version,{status:'completed'});
    expect(done.record).toMatchObject({status:'completed',version:2,completedAt:start.toISOString()});
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
    const edited=await api.updateTask(seeded,2,{body:'Keep completion timestamp'});
    expect(edited.record.completedAt).toBe(done.record.completedAt);
    const reopened=await api.updateTask(seeded,3,{status:'in_progress'});
    expect(reopened.record).toMatchObject({status:'in_progress',completedAt:null,version:4});
    const again=await api.updateTask(seeded,4,{status:'completed'});
    expect(again.record.completedAt).toBe('2026-11-07T10:00:00.000Z');
    expect((await api.listTasks({status:['completed']})).items.some(t=>t.id===seeded)).toBe(true);
  });

  it('deletes once with an unchanged ID receipt and preserves all other tasks',async()=>{
    const api=createDemoTaskApi();
    const first=await api.getTask('demo-task-1');
    const removed=await api.deleteTask('demo-task-2',1);
    expect(removed).toEqual({record:{id:'demo-task-2'},actionNo:null});
    expect(await api.getTask('demo-task-2')).toBeNull();
    expect(await api.getTask('demo-task-1')).toEqual(first);
    expect((await api.listTasks()).total).toBe(3);
    await expect(api.deleteTask('demo-task-2',1)).rejects.toMatchObject({code:'not_found'});
    expect((await createDemoTaskApi().listTasks()).total).toBe(3);
  });

  it('reloads all changes from sessionStorage and never shares state with live mode',async()=>{
    const first=createDemoTaskApi();
    const created=(await first.createTask({title:'Persist across reloads'})).record;
    const updated=await first.updateTask(created.id,1,{priority:'high',estimateMinutes:45,status:'completed'});
    await first.deleteTask('demo-task-6',1);
    const second=createDemoTaskApi();
    expect(await second.getTask(created.id)).toEqual(updated.record);
    expect(await second.getTask('demo-task-6')).toBeNull();
    expect((await second.listTasks({status:['completed']})).total).toBe(2);
    // This task key is independent of the demo study adapter and not used by live mode.
    expect(sessionStorage.getItem('lemma.v6.demo.tasks.v1')).toContain(created.id);
    expect(sessionStorage.getItem('lemma.v6.demo.study.v1')).toBeNull();
  });

  it('rejects bad inputs and leaves the snapshot unchanged atomically',async()=>{
    const api=createDemoTaskApi();
    const before=await api.listTasks({status:['backlog','in_progress','completed','cancelled']});
    for(const input of [
      {title:' '},
      {title:'Bad estimate',estimateMinutes:-1},
      {title:'Bad estimate',estimateMinutes:0.5},
      {title:'Bad date',due:{kind:'date',date:'2026-02-30'}},
      {title:'Wrong day',due:{kind:'date',date:'2026-12-01T00:00:00Z'}},
      {title:'Bad instant',due:{kind:'instant',at:'2026-11-06'}},
      {title:'Bad priority',priority:'urgent'},
      {title:'Bad position',position:0.25},
    ]) await expect(api.createTask(input as never)).rejects.toMatchObject({code:'invalid'});
    await expect(api.updateTask(seeded,1,{due:{kind:'date',date:'2026-02-30'}} as never)).rejects.toMatchObject({code:'invalid'});
    await expect(api.updateTask(seeded,1,{estimateMinutes:-5})).rejects.toMatchObject({code:'invalid'});
    await expect(api.updateTask(seeded,1,{status:'archived'} as never)).rejects.toMatchObject({code:'invalid'});
    expect(await api.listTasks({status:['backlog','in_progress','completed','cancelled']})).toEqual(before);
  });

  it('recovers from malformed or obsolete storage without corrupting the fixture',async()=>{
    sessionStorage.setItem('lemma.v6.demo.tasks.v1','not valid JSON');
    expect((await createDemoTaskApi().listTasks()).total).toBe(4);
    sessionStorage.setItem('lemma.v6.demo.tasks.v1',JSON.stringify({schema:9,tasks:[]}));
    expect((await createDemoTaskApi().listTasks()).total).toBe(4);
    const api=createDemoTaskApi();
    const item=(await api.getTask(seeded)) as TaskRecord;
    expect(item.version).toBe(1);
  });
});
