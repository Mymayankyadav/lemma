import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoPracticeTopicApi} from '../../../src/data/practice-topics/demo';
import type {PracticeTopicApi} from '../../../src/data/practice-topics/contract';

function memoryStorage():Storage{
  const map=new Map<string,string>();
  return {
    get length(){return map.size},
    key(n){return [...map.keys()][n]??null},
    getItem(k){return map.get(k)??null},
    setItem(k,v){map.set(k,v)},
    removeItem(k){map.delete(k)},
    clear(){map.clear()}
  };
}
let storage:Storage;
let api:PracticeTopicApi;
const fixed={kind:'fixed_days' as const,days:7};
const cadence={kind:'after_rating' as const,daysByRating:{'1':1,'2':3,'3':7,'4':14}};
const recorded=(topicId:string,expectedVersion:number,rating:1|2|3|4=3)=>({
  topicId,expectedVersion,rating,practiceDay:'2026-11-06',
  occurredAt:'2026-11-06T10:00:00.000Z',minutes:35,response:'Solved without notes'
});
beforeEach(()=>{
  storage=memoryStorage();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-06T11:00:00.000Z'));
  api=createDemoPracticeTopicApi({storage});
});
afterEach(()=>vi.useRealTimers());

describe('N57.1 manual practice topic demo adapter',()=>{
  it('seeds owner-independent practice fixtures with exact count and bounded pages',async()=>{
    const first=await api.listTopics({limit:1});
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second=await api.listTopics({limit:1,cursor:first.nextCursor});
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items,...second.items].map(x=>x.id)).size).toBe(2);
    await expect(api.listTopics({limit:51})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listTopics({cursor:'bogus'})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listTopics({includeArchived:true,cursor:first.nextCursor})).rejects.toMatchObject({code:'invalid'});
  });
  it('creates and updates owner-scoped linked topics, cloning inputs and preserving reload state',async()=>{
    const input={title:'  Prove Fermat by example  ',subjectId:'subject-1',nextDueDate:'2026-11-08',cadence:fixed};
    const created=await api.createTopic(input);
    expect(created.actionNo).toBeNull();
    expect(created.record).toMatchObject({
      title:'Prove Fermat by example',subjectId:'subject-1',
      nextDueDate:'2026-11-08',version:1,source:'app'
    });
    created.record.title='tampered';
    expect((await api.getTopic(created.record.id))?.title).toBe('Prove Fermat by example');
    const reloaded=createDemoPracticeTopicApi({storage});
    expect(await reloaded.getTopic(created.record.id)).toMatchObject({title:'Prove Fermat by example'});
    const changed=await reloaded.updateTopic(created.record.id,1,{cadence,checkpointId:'checkpoint-1'});
    expect(changed.record).toMatchObject({version:2,checkpointId:'checkpoint-1',cadence});
    await expect(api.updateTopic(created.record.id,1,{title:'stale'})).rejects.toMatchObject({code:'conflict'});
    expect((await api.getTopic(created.record.id))?.title).toBe('Prove Fermat by example');
  });
  it('records rating-based practice without touching FSRS, then void restores the former due day',async()=>{
    const topic=(await api.getTopic('demo-practice-2'))!;
    const out=await api.recordPractice(recorded(topic.id,topic.version,4));
    expect(out.actionNo).toBeNull();
    expect(out.record.topic).toMatchObject({
      id:topic.id,nextDueDate:'2026-11-20',lastPracticedAt:'2026-11-06T10:00:00.000Z',version:2
    });
    expect(out.record.event).toMatchObject({rating:4,response:'Solved without notes',minutes:35,version:1});
    expect(await api.listEvents(topic.id)).toHaveLength(1);
    const restored=await api.voidPracticeEvent(out.record.event.id,1);
    expect(restored.record.topic).toMatchObject({
      nextDueDate:'2026-11-09',lastPracticedAt:null,version:3
    });
    expect(restored.record.event).toMatchObject({version:2,voidedAt:expect.any(String)});
    await expect(api.voidPracticeEvent(out.record.event.id,1)).rejects.toMatchObject({code:'conflict'});
    expect((await createDemoPracticeTopicApi({storage}).getTopic(topic.id))?.nextDueDate).toBe('2026-11-09');
  });
  it('fixed cadence advances seven civil days and forbids voiding earlier events ahead of later ones',async()=>{
    const a=await api.recordPractice(recorded('demo-practice-1',1,1));
    expect(a.record.topic.nextDueDate).toBe('2026-11-13');
    const b=await api.recordPractice({...recorded('demo-practice-1',2,2),practiceDay:'2026-11-13',
      occurredAt:'2026-11-13T10:00:00Z'});
    await expect(api.voidPracticeEvent(a.record.event.id,1)).rejects.toMatchObject({code:'conflict'});
    const back=await api.voidPracticeEvent(b.record.event.id,1);
    expect(back.record.topic.nextDueDate).toBe('2026-11-13');
  });
  it('archive, restore and delete enforce versions and real visibility',async()=>{
    const archived=await api.archiveTopic('demo-practice-1',1);
    expect(archived.record.archivedAt).toEqual(expect.any(String));
    expect((await api.listTopics()).total).toBe(1);
    expect((await api.listTopics({includeArchived:true})).total).toBe(2);
    await expect(api.recordPractice(recorded('demo-practice-1',2))).rejects.toMatchObject({code:'conflict'});
    const restored=await api.restoreTopic('demo-practice-1',2);
    expect(restored.record.archivedAt).toBeNull();
    await expect(api.deleteTopic('demo-practice-1',2)).rejects.toMatchObject({code:'conflict'});
    const deleted=await api.deleteTopic('demo-practice-1',3);
    expect(deleted.record).toEqual({id:'demo-practice-1'});
    expect(await api.getTopic('demo-practice-1')).toBeNull();
  });
  it('rejects invalid civil dates, cadence, rating, minutes and injected owner fields',async()=>{
    await expect(api.createTopic({title:'date',nextDueDate:'2026-02-30',cadence:fixed}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.createTopic({title:'bad',cadence:{kind:'fixed_days',days:0}}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.recordPractice({...recorded('demo-practice-1',1),practiceDay:'2026-02-30'}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.recordPractice({...recorded('demo-practice-1',1),minutes:-2}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.createTopic({title:'secret',cadence:fixed,userId:'another'} as never))
      .rejects.toMatchObject({code:'invalid'});
    expect((await api.getTopic('demo-practice-1'))?.version).toBe(1);
    expect(JSON.stringify(await api.listTopics())).not.toContain('userId');
  });
});
