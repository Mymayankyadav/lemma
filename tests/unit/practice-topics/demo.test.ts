import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoPracticeTopicApi} from '../../../src/data/practice-topics/demo';
import {getPracticeTopicApi,setPracticeTopicApiForTests} from '../../../src/data/practice-topics';
import type {NewPracticeTopic,PracticeTopicApi} from '../../../src/data/practice-topics/contract';
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'demo'}));

const at='2026-11-07T10:00:00.000Z';
const input:NewPracticeTopic={
 title:'Algebra estimates',subjectId:'subject-algebra',
 cadence:{kind:'fixed_days',days:5},nextDueDate:'2026-11-09',
};
beforeEach(()=>{
 sessionStorage.clear();setPracticeTopicApiForTests(null);
 vi.useFakeTimers();vi.setSystemTime(new Date(at));
});
afterEach(()=>{
 setPracticeTopicApiForTests(null);sessionStorage.clear();vi.useRealTimers();
});
describe('N57.1 practice topics demo',()=>{
 it('seeds owner-scoped topics with two cadence shapes and filters archive/scope',async()=>{
  const api=createDemoPracticeTopicApi();
  expect(api.mode).toBe('demo');
  expect((await api.listTopics()).total).toBe(2);
  expect((await api.listTopics({archived:'all'})).total).toBe(3);
  expect((await api.listTopics({archived:'archived'})).total).toBe(1);
  expect((await api.listTopics({subjectId:'subject-analysis'})).items.map(t=>t.id))
   .toEqual(['demo-practice-1']);
  expect((await api.listTopics({subjectId:null,archived:'all'})).total).toBe(1);
  expect((await api.getTopic('missing'))).toBeNull();
  expect((await api.getTopic('demo-practice-2'))?.cadence).toEqual({
   kind:'after_rating',daysByRating:[1,3,7,14],
  });
 });
 it('validates and clones new records and their typed cadence',async()=>{
  const api=createDemoPracticeTopicApi();
  const data:NewPracticeTopic={...input,
   cadence:{kind:'after_rating',daysByRating:[2,4,6,8]}};
  const created=await api.createTopic(data);
  expect(created.actionNo).toBeNull();
  expect(created.record).toMatchObject({title:input.title,nextDueDate:'2026-11-09',
   archivedAt:null,lastPracticedAt:null,version:1});
  if(data.cadence?.kind==='after_rating')data.cadence.daysByRating[0]=999;
  created.record.title='Tampered';
  expect((await api.getTopic(created.record.id))?.title).toBe('Algebra estimates');
  expect((await api.getTopic(created.record.id))?.cadence).toEqual({
   kind:'after_rating',daysByRating:[2,4,6,8],
  });
  const read=(await api.getTopic(created.record.id))!;
  read.title='Leak';
  expect((await api.getTopic(created.record.id))?.title).not.toBe('Leak');
 });
 it('records ratings, advances due date using the selected cadence, and retains event notes',async()=>{
  const api=createDemoPracticeTopicApi();
  const fixed=await api.recordPractice('demo-practice-1',1,
   {occurredAt:at,rating:4,response:'Clear reasoning',minutes:45});
  expect(fixed).toMatchObject({actionNo:null,record:{
   topic:{nextDueDate:'2026-11-14',lastPracticedAt:at,version:2},
   event:{rating:4,response:'Clear reasoning',minutes:45,version:1,voidedAt:null},
  }});
  const after=await api.recordPractice('demo-practice-2',1,{occurredAt:at,rating:2});
  expect(after.record.topic.nextDueDate).toBe('2026-11-10');
  const higher=await api.recordPractice('demo-practice-2',2,{occurredAt:at,rating:4});
  expect(higher.record.topic.nextDueDate).toBe('2026-11-21');
  expect((await api.listEvents({topicId:'demo-practice-2'})).total).toBe(2);
  expect((await api.listEvents({topicId:'demo-practice-1'})).items[0])
   .toMatchObject({response:'Clear reasoning',minutes:45});
 });
 it('voids the latest event by version and restores the previous due date and practice instant',async()=>{
  const api=createDemoPracticeTopicApi();
  const first=await api.recordPractice('demo-practice-1',1,
   {occurredAt:at,rating:1});
  const second=await api.recordPractice('demo-practice-1',2,
   {occurredAt:'2026-11-08T10:00:00.000Z',rating:4});
  expect(second.record.topic.nextDueDate).toBe('2026-11-15');
  await expect(api.voidPracticeEvent(first.record.event.id,1))
   .rejects.toMatchObject({code:'conflict'});
  const undoneSecond=await api.voidPracticeEvent(second.record.event.id,1);
  expect(undoneSecond.record.event.version).toBe(2);
  expect(undoneSecond.record.event.voidedAt).toBeTruthy();
  expect(undoneSecond.record.topic).toMatchObject({
   nextDueDate:'2026-11-14',lastPracticedAt:at,version:4,
  });
  await expect(api.voidPracticeEvent(second.record.event.id,2))
   .rejects.toMatchObject({code:'invalid'});
  const undoneFirst=await api.voidPracticeEvent(first.record.event.id,1);
  expect(undoneFirst.record.topic).toMatchObject({
   nextDueDate:'2026-11-10',lastPracticedAt:null,version:5,
  });
  expect((await api.listEvents({topicId:'demo-practice-1'})).total).toBe(0);
  expect((await api.listEvents({topicId:'demo-practice-1',includeVoided:true})).total).toBe(2);
 });
 it('enforces optimistic versions across independently reloaded adapters',async()=>{
  const a=createDemoPracticeTopicApi(),b=createDemoPracticeTopicApi();
  const first=await a.updateTopic('demo-practice-1',1,{title:'Proofs updated'});
  expect(first.record).toMatchObject({version:2,title:'Proofs updated'});
  await expect(b.updateTopic('demo-practice-1',1,{title:'Lost update'}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(b.recordPractice('demo-practice-1',1,{rating:1}))
   .rejects.toMatchObject({code:'conflict'});
  await expect(b.deleteTopic('demo-practice-1',1))
   .rejects.toMatchObject({code:'conflict'});
  expect((await b.getTopic('demo-practice-1'))?.title).toBe('Proofs updated');
 });
 it('archives, restores, deletes unused topics and preserves referenced practice history',async()=>{
  const api=createDemoPracticeTopicApi();
  const archived=await api.archiveTopic('demo-practice-1',1);
  expect(archived.record).toMatchObject({version:2,archivedAt:at});
  expect((await api.listTopics()).total).toBe(1);
  await expect(api.recordPractice('demo-practice-1',2,{rating:1}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.archiveTopic('demo-practice-1',2))
   .rejects.toMatchObject({code:'invalid'});
  const restored=await api.restoreTopic('demo-practice-1',2);
  expect(restored.record).toMatchObject({archivedAt:null,version:3});
  await expect(api.restoreTopic('demo-practice-1',3))
   .rejects.toMatchObject({code:'invalid'});
  const rec=await api.recordPractice('demo-practice-1',3,{rating:3});
  await expect(api.deleteTopic('demo-practice-1',4))
   .rejects.toMatchObject({code:'conflict'});
  expect((await api.getTopic('demo-practice-1'))).not.toBeNull();
  const gone=await api.deleteTopic('demo-practice-3',1);
  expect(gone).toEqual({record:{id:'demo-practice-3'},actionNo:null});
  expect(await api.getTopic('demo-practice-3')).toBeNull();
  expect((await api.listEvents({topicId:'demo-practice-1'})).items[0].id)
   .toBe(rec.record.event.id);
 });
 it('walks over fifty topics and events with exact totals and opaque filter-bound cursors',async()=>{
  const api=createDemoPracticeTopicApi();
  for(let i=0;i<54;i++)await api.createTopic({...input,title:'Topic '+i,
   subjectId:'subject-'+i});
  let cursor:string|null=null;const ids:string[]=[];
  for(let i=0;i<15;i++){
   const p=await api.listTopics({limit:5,cursor});
   expect(p.total).toBe(56);ids.push(...p.items.map(t=>t.id));
   cursor=p.nextCursor;if(cursor===null)break;
   expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  }
  expect(ids).toHaveLength(56);expect(new Set(ids).size).toBe(56);
  const first=await api.listTopics({limit:1});
  await expect(api.listTopics({cursor:first.nextCursor,archived:'all'}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listTopics({cursor:first.nextCursor,subjectId:'subject-analysis'}))
   .rejects.toMatchObject({code:'invalid'});
  for(const limit of [0,51,2.5,-1])
   await expect(api.listTopics({limit})).rejects.toMatchObject({code:'invalid'});
  await expect(api.listTopics({cursor:'not/a/cursor'}))
   .rejects.toMatchObject({code:'invalid'});

  let version=1;
  for(let i=0;i<53;i++){
   await api.recordPractice('demo-practice-1',version,{rating:1,occurredAt:at});
   version+=1;
  }
  let eventCursor:string|null=null;const eventIds:string[]=[];
  for(let i=0;i<15;i++){
   const p=await api.listEvents({topicId:'demo-practice-1',limit:4,cursor:eventCursor});
   expect(p.total).toBe(53);eventIds.push(...p.items.map(e=>e.id));
   eventCursor=p.nextCursor;if(eventCursor===null)break;
  }
  expect(eventIds).toHaveLength(53);expect(new Set(eventIds).size).toBe(53);
  const firstEvents=await api.listEvents({topicId:'demo-practice-1',limit:1});
  await expect(api.listEvents({cursor:firstEvents.nextCursor,includeVoided:true,
   topicId:'demo-practice-1'})).rejects.toMatchObject({code:'invalid'});
 });
 it('persists topic and event versions, inverse due snapshots and deletion through reload',async()=>{
  const a=createDemoPracticeTopicApi();
  const topic=(await a.createTopic(input)).record;
  const record=(await a.recordPractice(topic.id,1,{occurredAt:at,rating:2})).record;
  await a.archiveTopic(topic.id,2);
  await a.deleteTopic('demo-practice-3',1);
  const b=createDemoPracticeTopicApi();
  expect(await b.getTopic(topic.id)).toMatchObject({
   version:3,nextDueDate:'2026-11-12',
  });
  expect((await b.getTopic(topic.id))?.archivedAt).toBeTruthy();
  expect((await b.listEvents({topicId:topic.id})).items).toMatchObject([
   {id:record.event.id,rating:2},
  ]);
  const undone=await b.voidPracticeEvent(record.event.id,1);
  expect(undone.record.topic.nextDueDate).toBe('2026-11-09');
  expect(await b.getTopic('demo-practice-3')).toBeNull();
  expect(sessionStorage.getItem('lemma.v6.demo.practice-topics.v1')).toContain(topic.id);
  expect(sessionStorage.getItem('lemma.v6.demo.study.v1')).toBeNull();
 });
 it('rejects invalid schema, fields, bounds and ids without partial changes',async()=>{
  const api=createDemoPracticeTopicApi();
  const original=await api.listTopics({archived:'all'});
  for(const bad of [
   {...input,title:'  '},
   {...input,title:'x'.repeat(201)},
   {...input,nextDueDate:'2026-02-30'},
   {...input,nextDueDate:'2026-11-7'},
   {...input,cadence:{kind:'fixed_days',days:0} as never},
   {...input,cadence:{kind:'fixed_days',days:1.5} as never},
   {...input,cadence:{kind:'after_rating',daysByRating:[1,2,3]} as never},
   {...input,cadence:{kind:'after_rating',daysByRating:[1,2,3,3651]} as never},
   {...input,subjectId:' '},
   {...input,userId:'caller-forged'} as never,
  ])await expect(api.createTopic(bad)).rejects.toMatchObject({code:'invalid'});
  await expect(api.updateTopic('demo-practice-1',1,{title:' '}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.updateTopic('demo-practice-1',1,{}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.recordPractice('demo-practice-1',1,{rating:5 as never}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.recordPractice('demo-practice-1',1,{rating:1,minutes:-1}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.recordPractice('demo-practice-1',1,{rating:1,response:'x'.repeat(4001)}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.recordPractice('demo-practice-1',1,{rating:1,occurredAt:'bad'}))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.recordPractice('demo-practice-1',1,{rating:1,userId:'attacker'} as never))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.getTopic(' ')).rejects.toMatchObject({code:'invalid'});
  await expect(api.listEvents({topicId:' '})).rejects.toMatchObject({code:'invalid'});
  expect(await api.listTopics({archived:'all'})).toEqual(original);
 });
 it('recovers corrupt snapshots and uses the injectable facade with read-only live placeholder',async()=>{
  sessionStorage.setItem('lemma.v6.demo.practice-topics.v1','{broken');
  expect((await createDemoPracticeTopicApi().listTopics()).total).toBe(2);
  sessionStorage.setItem('lemma.v6.demo.practice-topics.v1',
   JSON.stringify({schema:1,topics:[{id:'bad'}],events:[],history:[]}));
  expect((await createDemoPracticeTopicApi().listTopics()).total).toBe(2);
  const api=createDemoPracticeTopicApi();
  setPracticeTopicApiForTests(api);
  expect(getPracticeTopicApi()).toBe(api);
  setPracticeTopicApiForTests(null);
  expect(getPracticeTopicApi()).not.toBe(api);
  expect(getPracticeTopicApi().mode).toBe('demo');
  const live=(await import('../../../src/data/practice-topics/contract')).emptyPracticeTopicApi('live');
  const unused=(await live.listTopics()).total;
  expect(unused).toBe(0);
  await expect(live.recordPractice('x',1,{rating:1})).rejects.toThrow(/unavailable/);
  setPracticeTopicApiForTests(live as PracticeTopicApi);
  expect(getPracticeTopicApi()).toBe(live);
 });
});
