import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import Page from '../../../src/features/cards/Page';
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter';
import type {DemoStore} from '../../../src/data/demo/model';

// N102: v6Shell defaults on; this suite covers the legacy (flag-off) screen.
beforeEach(()=>{window.history.replaceState(null,'','/?flags=-v6Shell');});

const mocks=vi.hoisted(()=>({api:null as unknown,projects:[] as any[]}));
vi.mock('../../../src/data',()=>({getApi:()=>mocks.api}));
vi.mock('../../../src/data/hooks',()=>({
 useProjects:()=>({data:mocks.projects}),
 useCreateNote:()=>({isPending:false,mutateAsync:vi.fn()}),
}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>vi.fn()}));
vi.mock('../../../src/ui/Sheet',()=>({Sheet:()=>null}));

let root:Root;
let container:HTMLDivElement;
async function mount(api:DemoAdapter,projects:any[]){
 mocks.api=api;
 mocks.projects=projects;
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 container=document.createElement('div');
 document.body.appendChild(container);
 root=createRoot(container);
 await act(async()=>{root.render(<QueryClientProvider client={client}><MemoryRouter><Page/></MemoryRouter></QueryClientProvider>)});
 return client;
}
async function change(label:string,value:string){
 const select=container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
 expect(select).not.toBeNull();
 await act(async()=>{
  const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!;
  setter.call(select,value);
  select!.dispatchEvent(new Event('change',{bubbles:true}));
 });
}
function rows(){return [...container.querySelectorAll('[data-card-row]')];}
function fixtureWithoutNotes():DemoStore{
 return {...structuredClone(demoSeedFixture),notes:[]};
}
describe('Cards page states (demo adapter)',()=>{
 beforeEach(()=>{document.body.replaceChildren();vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){} unobserve(){}})});
 afterEach(async()=>{
  if(root)await act(async()=>root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
 });
 it('shows loading placeholders while the demo read is pending',async()=>{
  const api=new DemoAdapter();
  vi.spyOn(api,'searchCardsPage').mockImplementation(()=>new Promise(()=>{}));
  await mount(api,[]);
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,310))});
  expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  expect(rows()).toHaveLength(0);
 });
 it('shows an empty library with no cards',async()=>{
  const api=new DemoAdapter({fixture:fixtureWithoutNotes()});
  await mount(api,[]);
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0))});
  expect(container.textContent).toContain('No cards match');
  expect(rows()).toHaveLength(0);
 });
 it('shows filtered-to-zero when no demo notes have the selected status',async()=>{
  const fixture=structuredClone(demoSeedFixture);
  fixture.notes.forEach(note=>{note.note.status='active'});
  const api=new DemoAdapter({fixture});
  expect((await api.searchCardsPage({query:''})).rows.length).toBeGreaterThan(0);
  expect((await api.searchCardsPage({query:'',noteStatus:'suspended'})).rows).toHaveLength(0);
  await mount(api,[]);
  await change('Filter note status','suspended');
  for(let attempt=0;attempt<50 && !container.textContent?.includes('No cards match');attempt++){
   await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10))});
  }
  expect(container.textContent).toContain('No cards match');
  expect(rows()).toHaveLength(0);
 });
 it('combines project and scheduling state before rendering demo cards',async()=>{
  const api=new DemoAdapter();
  const projects=await api.listProjects();
  const initial=await api.searchCardsPage({query:''});
  expect(initial.rows.length).toBeGreaterThan(0);
  // Choose a populated project/state pair from the fixture instead of assuming
  // the first card is New (state 0); the seed may contain only review cards.
  let chosen: {slug:string;state:number;rows:typeof initial.rows}|undefined;
  for(const project of projects){
   for(const state of [0,1,2,3]){
    const result=await api.searchCardsPage({query:'',projectSlug:project.slug,state});
    if(result.rows.length>0 && result.rows.length<initial.rows.length){
     chosen={slug:project.slug,state,rows:result.rows};
     break;
    }
   }
   if(chosen)break;
  }
  expect(chosen).toBeDefined();
  const project=projects.find(p=>p.slug===chosen!.slug)!;
  const state=String(chosen!.state);
  const expected=await api.searchCardsPage({query:'',projectSlug:project.slug,state:chosen!.state});
  await mount(api,projects);
  await change('Filter project',project!.slug);
  await change('Filter scheduling state',state);
  // The seeded library must contain both matching and nonmatching cards, so
  // a page that ignores either filter cannot pass by coincidental row count.
  expect(expected.rows.length).toBeGreaterThan(0);
  const expectedNos=new Set(expected.rows.map(row=>row.noteNo));
  expect(initial.rows.some(row=>!expectedNos.has(row.noteNo))).toBe(true);
  expect(expected.rows.every(row=>row.projectSlug===project!.slug)).toBe(true);
  // The page virtualizes the list: only a viewport-sized prefix is mounted,
  // even when the filtered query has more matching cards.
  const loadedLabel=expected.rows.length.toLocaleString()+' loaded';
  for(let attempt=0;attempt<50 && !container.textContent?.includes(loadedLabel);attempt++){
   await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10))});
  }
  expect(container.textContent).toContain(loadedLabel);
  const renderedIds=rows().map(row=>row.getAttribute('href'));
  const expectedIds=expected.rows.map(row=>'/cards/'+row.noteNo);
  expect(renderedIds.length).toBeGreaterThan(0);
  expect(renderedIds.length).toBeLessThanOrEqual(expectedIds.length);
  expect(renderedIds).toEqual(expectedIds.slice(0,renderedIds.length));
 });
});
