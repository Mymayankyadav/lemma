import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import AtlasV6,{realIdeas} from '../../../src/features/atlas/v6/AtlasV6';
import AtlasPage from '../../../src/features/atlas/Page';
import {buildAtlasTree} from '../../../src/features/atlas/tree';
import type {AtlasGraph} from '../../../src/data/types';
import {useAtlas} from '../../../src/data/hooks';
import {isFlagOn} from '../../../src/flags';

vi.mock('../../../src/data/hooks',()=>({useAtlas:vi.fn()}));
vi.mock('../../../src/flags',()=>({isFlagOn:vi.fn(()=>true)}));
const concept=(id:string,name:string,subjectId:string,level:'cluster'|'planet'|'moon'='planet',parentId:string|null=null,dueCards=0)=>({
 id,name,slug:id,subjectId,level,parentId,dueCards,
 blurb:null,status:'not_started' as const,pinX:null,pinY:null,
 checkpointRefs:id==='a'?[{projectSlug:'proofs',code:'CP2'}]:[],
});
const graph:AtlasGraph={
 subjects:[{id:'s',name:'Analysis',glyph:'∑',hue:'cyan',position:0},
  {id:'t',name:'Topology',glyph:'◇',hue:'slate',position:1}],
 concepts:[concept('field','Foundations','s','cluster'),
  concept('a','Proof of continuity','s','planet','field',2),
  concept('b','Counterexamples','s','moon','a'),
  concept('c','Open sets','t','planet',null,1)],
 links:[],
};
let host:HTMLDivElement,root:Root;
const fake=(data:AtlasGraph|null=graph,isPending=false,error:Error|null=null)=>({
 data,isPending,error,refetch:vi.fn(async()=>{}),
});
async function render(page:React.ReactNode=<AtlasV6/>){
 await act(async()=>{root.render(<MemoryRouter initialEntries={['/atlas']}>{page}</MemoryRouter>);});
}
async function click(label:string){
 const button=[...host.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')===label||el.textContent?.trim()===label);
 expect(button).toBeDefined();
 await act(async()=>button!.click());
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 vi.mocked(useAtlas).mockReturnValue(fake() as ReturnType<typeof useAtlas>);
 vi.mocked(isFlagOn).mockReturnValue(true);
});
afterEach(async()=>{await act(async()=>{root.unmount()});host.remove();vi.clearAllMocks();});

describe('N29 v6 Atlas list',()=>{
 it('lists real concepts by hierarchy and labels generated groups without counting them',async()=>{
  await render();
  const tree=buildAtlasTree(graph);
  expect(realIdeas(tree)).toBe(4);
  expect([...tree.nodes.values()].some(node=>node.synthetic)).toBe(true);
  expect(host.querySelector('[aria-label="Real idea count"]')?.textContent).toContain('4 ideas');
  expect(host.textContent).toContain('Generated grouping row — not an idea');
  expect(host.textContent).toContain('Proof of continuity');
  expect(host.textContent).toContain('2 due');
  expect([...host.querySelectorAll('a')].some(a=>a.getAttribute('href')==='/p/proofs/cp/CP2')).toBe(true);
  const map=[...host.querySelectorAll('a')].find(a=>a.textContent==='Map');
  expect(map?.getAttribute('href')).toBe('/atlas?view=map');
 });
 it('expands and collapses a nested idea with accessible 44px keyboard controls',async()=>{
  await render();
  const toggle=host.querySelector('button[aria-label="Expand Proof of continuity"]') as HTMLButtonElement;
  expect(toggle).toBeDefined();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  toggle.focus();expect(document.activeElement).toBe(toggle);
  await click('Expand Proof of continuity');
  expect(host.textContent).toContain('Counterexamples');
  await click('Collapse Proof of continuity');
  expect(host.textContent).not.toContain('Counterexamples');
  expect(toggle.className).toContain('min-h-11');
 });
 it('searches using real labels while preserving the ancestor path and reports filtered-empty',async()=>{
  await render();
  const input=host.querySelector('input[aria-label="Find an idea"]') as HTMLInputElement;
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Counterexamples');
   input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  expect(host.textContent).toContain('Counterexamples');
  expect(host.textContent).toContain('Foundations');
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'No exact idea 123');
   input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  expect(host.textContent).toContain('No ideas match your search');
 });
 it('shows distinct loading, empty, and failure states with a retry action',async()=>{
  vi.mocked(useAtlas).mockReturnValue(fake(null,true) as ReturnType<typeof useAtlas>);
  await render();expect(host.textContent).toContain('Loading ideas');
  vi.mocked(useAtlas).mockReturnValue(fake({subjects:[],concepts:[],links:[]}) as ReturnType<typeof useAtlas>);
  await render();expect(host.textContent).toContain('Your Atlas is empty');
  const retry=vi.fn(async()=>{});
  vi.mocked(useAtlas).mockReturnValue({...fake(null,false,new Error('offline')),refetch:retry} as ReturnType<typeof useAtlas>);
  await render();expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not load');
  await click('Retry');expect(retry).toHaveBeenCalledTimes(1);
 });
 it('keeps flag-off legacy Atlas mounted; flag-on opens the list',async()=>{
  vi.mocked(useAtlas).mockReturnValue(fake(null,true) as ReturnType<typeof useAtlas>);
  vi.mocked(isFlagOn).mockReturnValue(false);
  await render(<AtlasPage/>);
  expect(host.textContent).not.toContain('Loading ideas…');
  expect(host.querySelector('main[aria-label="Atlas"]')).toBeTruthy();
  vi.mocked(isFlagOn).mockReturnValue(true);
  await render(<AtlasPage/>);
  expect(host.textContent).toContain('Loading ideas…');
 });
});
