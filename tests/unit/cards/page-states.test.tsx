import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import Page from '../../../src/features/cards/Page';
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter';
import type {DemoStore} from '../../../src/data/demo/model';

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
 it('shows filtered-to-zero when the search matches no demo card',async()=>{
  const api=new DemoAdapter();
  await mount(api,[]);
  const input=container.querySelector<HTMLInputElement>('input[placeholder="Search cards"]')!;
  await act(async()=>{
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;
   setter.call(input,'unmatchable-card-query-xyz-987654');
   input.dispatchEvent(new Event('input',{bubbles:true}));
   input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,300))});
  expect(container.textContent).toContain('No cards match');
  expect(rows()).toHaveLength(0);
 });
 it('combines project and scheduling state before rendering demo cards',async()=>{
  const api=new DemoAdapter();
  const projects=await api.listProjects();
  const initial=await api.searchCardsPage({query:''});
  expect(initial.rows.length).toBeGreaterThan(0);
  const selected=initial.rows[0];
  const project=projects.find(p=>p.slug===selected.projectSlug);
  expect(project).toBeDefined();
  const state='0';
  const expected=await api.searchCardsPage({query:'',projectSlug:project!.slug,state:0});
  await mount(api,projects);
  await change('Filter project',project!.slug);
  await change('Filter scheduling state',state);
  expect(rows()).toHaveLength(expected.rows.length);
  expect(container.textContent).toContain(expected.rows.length.toLocaleString()+' loaded');
 });
});
