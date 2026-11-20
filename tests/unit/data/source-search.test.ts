import {beforeEach,describe,expect,it,vi} from 'vitest';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter';
import {publishAuth} from '../../../src/data/authBoundary';
import {sourceSearchFilter,sourceSearchTerm} from '../../../src/data/source-search';

const fake=vi.hoisted(()=>({getUser:vi.fn(),from:vi.fn()}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({from:fake.from,auth:{getUser:fake.getUser}})}));

describe('N195 source discovery',()=>{
 beforeEach(()=>{fake.getUser.mockReset();fake.from.mockReset();publishAuth({id:'owner-a'});fake.getUser.mockResolvedValue({data:{user:{id:'owner-a'}},error:null});});
 it('treats query punctuation as literal data through both PostgREST and regex syntax',()=>{
  const term='Rudin %_*\\a "(proof),user_id.neq.owner"';
  const filter=sourceSearchFilter(term);
  const values=[...filter.matchAll(/(?:title|short|filename)\.imatch\.("(?:\\.|[^"\\])*")/g)];
  expect(values).toHaveLength(3);
  for(const value of values){
   const regex=new RegExp(JSON.parse(value[1]),'i');
   expect(regex.test('Text '+term+' appendix')).toBe(true);
   expect(regex.test('Rudin unrelated proof')).toBe(false);
  }
  expect(values.map(match=>match[0]).join(',')).toBe(filter);
  expect(sourceSearchTerm(' x ')).toBe('');
  expect(()=>sourceSearchTerm('x'.repeat(161))).toThrow('160 characters');
  expect(()=>sourceSearchTerm('bad\nquery')).toThrow('160 characters');
 });
 it('reads a bounded ordered source page with owner and active-project restrictions',async()=>{
  const result={data:[{id:'source',title:'Analysis',short:'Rudin',filename:'rudin.pdf',projects:{slug:'analysis',title:'Real analysis'}}],error:null};
  const query={select:vi.fn(),eq:vi.fn(),neq:vi.fn(),or:vi.fn(),order:vi.fn(),limit:vi.fn()};
  for(const method of [query.select,query.eq,query.neq,query.or,query.order])method.mockReturnValue(query);
  query.limit.mockResolvedValue(result);fake.from.mockReturnValue(query);
  expect(await new LiveAdapter().searchSources('Rudin')).toEqual([{id:'source',title:'Analysis',short:'Rudin',filename:'rudin.pdf',projectSlug:'analysis',projectTitle:'Real analysis'}]);
  expect(fake.from).toHaveBeenCalledExactlyOnceWith('sources');
  expect(query.select).toHaveBeenCalledWith('id,title,short,filename,projects!inner(slug,title,user_id,status,system)');
  expect(query.eq.mock.calls).toEqual([['user_id','owner-a'],['projects.user_id','owner-a'],['projects.system',false]]);
  expect(query.neq).toHaveBeenCalledWith('projects.status','archived');
  expect(query.limit).toHaveBeenCalledExactlyOnceWith(40);
  expect(query.order.mock.calls).toEqual([['title',{ascending:true}],['id',{ascending:true}]]);
  expect(query.or).toHaveBeenCalledWith(sourceSearchFilter('Rudin'));
 });
 it('rejects an old account response even if the first owner signs back in',async()=>{
  let finish!:(value:unknown)=>void;
  const response=new Promise(resolve=>{finish=resolve;});
  const query={select:vi.fn(),eq:vi.fn(),neq:vi.fn(),or:vi.fn(),order:vi.fn(),limit:vi.fn()};
  for(const method of [query.select,query.eq,query.neq,query.or,query.order])method.mockReturnValue(query);
  query.limit.mockReturnValue(response);fake.from.mockReturnValue(query);
  const pending=new LiveAdapter().searchSources('Analysis');
  await vi.waitFor(()=>expect(query.limit).toHaveBeenCalled());
  publishAuth({id:'owner-b'});publishAuth({id:'owner-a'});
  finish({data:[{id:'old-secret'}],error:null});
  await expect(pending).rejects.toMatchObject({code:'auth'});
 });
 it('finds a source beyond twelve paths and excludes archived or system sources in demo',async()=>{
  const fixture=structuredClone(demoSeedFixture),base=fixture.projects[0],source=fixture.sources[0];
  fixture.projects=Array.from({length:15},(_,i)=>({...base,id:'p'+i,slug:'path-'+i,title:'Path '+i,system:i===13,status:i===14?'archived':'active'}));
  fixture.sources=[12,13,14].map(i=>({...source,id:'s'+i,projectId:'p'+i,title:'Literal %_* source '+i,short:'',filename:'file'+i+'.pdf'}));
  const api=new DemoAdapter({fixture});
  expect((await api.searchSources('%_*')).map(row=>row.id)).toEqual(['s12']);
  expect((await api.searchSources('file12')).map(row=>row.projectSlug)).toEqual(['path-12']);
 });
});
