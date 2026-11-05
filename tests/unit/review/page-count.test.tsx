// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter';
import {useReviewSession} from '../../../src/features/review-run/store';
import type {QueueFilter} from '../../../src/data/types';

const mocks=vi.hoisted(()=>({items:[] as any[],nodes:[] as any[],quota:3,navigate:vi.fn()}));
vi.mock('../../../src/data/hooks',()=>({
 useDeckTree:()=>({data:mocks.nodes,isPending:false,error:null}),
 useHome:()=>({data:{},isPending:false}),
 useReviewItems:()=>({data:mocks.items,isPending:false,error:null}),
 useSettings:()=>({data:{reviewsPerDay:mocks.quota,newPerDay:mocks.quota,rolloverHour:4,timeZone:'UTC',learnAheadMinutes:0,mixDecks:false},isPending:false,error:null}),
 useUpdateSettings:()=>({mutate:vi.fn(),isPending:false}),
 useInsightData:()=>({data:{reviews:[]}}),
}));
vi.mock('@tanstack/react-query',async importOriginal=>{
 const original=await importOriginal<typeof import('@tanstack/react-query')>();
 return {...original,useQuery:()=>({data:[],isPending:false})};
});
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>vi.fn()}));
vi.mock('react-router',async importOriginal=>{
 const original=await importOriginal<typeof import('react-router')>();
 return {...original,useNavigate:()=>mocks.navigate};
});
import Page from '../../../src/features/review/Page';

const filter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
describe('Review displayed count agrees with filtered quota-limited run',()=>{
 let root:Root|undefined;
 let container:HTMLDivElement|undefined;
 afterEach(async()=>{
  if(root)await act(async()=>root!.unmount());
  container?.remove();
  root=undefined;
  container=undefined;
  useReviewSession.getState().close();
  mocks.navigate.mockClear();
 });
 it.each([{matching:8,quota:3},{matching:2,quota:5}])('M=$matching Q=$quota',async({matching,quota})=>{
  const fixture=structuredClone(demoSeedFixture);
  const project=fixture.projects.find(p=>!p.system&&p.status!=='archived')!;
  const other=fixture.projects.find(p=>p.id!==project.id&&!p.system)!;
  const template=fixture.notes.find(n=>n.cards.length>0)!;
  fixture.notes=Array.from({length:10},(_,i)=>{
   const note=structuredClone(template);
   note.projectId=i<matching?project.id:other.id;
   note.note.noteId='count-note-'+i;
   note.note.noteNo=12000+i;
   note.note.status='active';
   note.cards=note.cards.slice(0,1);
   note.cards[0].id='count-card-'+i;
   note.cards[0].state.state=2;
   note.cards[0].state.due='2020-01-01T00:00:00.000Z';
   return note;
  });
  const api=new DemoAdapter({fixture,now:()=>Date.parse('2026-11-04T12:00:00Z'),timeZone:'UTC'});
  const all=await api.getReviewItems(filter);
  mocks.items=all;
  mocks.quota=quota;
  mocks.nodes=[{key:'project:'+project.slug,label:project.title,due:matching,glyph:'book',children:[]}];
  container=document.createElement('div');
  document.body.appendChild(container);
  root=createRoot(container);
  await act(async()=>root!.render(<MemoryRouter><Page/></MemoryRouter>));
  const expected=Math.min(matching,quota);
  const start=[...container.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Start review');
  expect(start).toBeDefined();
  expect(start!.textContent).toContain('Start '+expected);
  await act(async()=>start!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  const session=useReviewSession.getState();
  expect(session.total).toBe(expected);
  expect(session.queue?.total).toBe(expected);
  expect([session.current,...(session.queue?.learning??[]),...(session.queue?.reviews??[]),...(session.queue?.fresh??[])].filter(Boolean).every(item=>item!.projectSlug===project.slug)).toBe(true);
  expect(mocks.navigate).toHaveBeenCalledWith('/review/run');
 });
});
