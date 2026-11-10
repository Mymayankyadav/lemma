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
  expect(host.querySelector('[aria-label="Real concept count"]')?.textContent).toContain('4 concepts');
  // #1333: generated groups are not listed, so every row is a real concept.
  expect(host.textContent).not.toContain('Generated grouping row');
  expect(host.textContent).toContain('Proof of continuity');
  expect(host.textContent).toContain('2 due');
  // #1326: a concept's actions (map, pin, edit, checkpoints) open from its row.
  expect([...host.querySelectorAll('a')].some(a=>a.getAttribute('href')==='/p/proofs/cp/CP2')).toBe(false);
  const row=host.querySelector<HTMLButtonElement>('button[aria-label="Actions for Proof of continuity"]')!;
  await act(async()=>row.click());
  expect(row.getAttribute('aria-expanded')).toBe('true');
  expect([...host.querySelectorAll('a')].some(a=>a.getAttribute('href')==='/p/proofs/cp/CP2')).toBe(true);
  const map=[...host.querySelectorAll('a')].find(a=>a.textContent==='Map');
  expect(map?.getAttribute('href')).toBe('/atlas?view=map');
 });
 it('#1333 lists every concept as one flat, name-sorted list: no expanders, no indentation',async()=>{
  await render();
  const names=[...host.querySelectorAll('button[aria-label^="Actions for "]')].map(el=>el.getAttribute('aria-label')!.slice('Actions for '.length));
  expect(names).toEqual(['Counterexamples','Foundations','Open sets','Proof of continuity']);
  expect(host.querySelector('button[aria-label^="Expand "],button[aria-label^="Collapse "]')).toBeNull();
  const items=[...host.querySelectorAll('[aria-label="Concept list"] li')] as HTMLElement[];
  expect(items.length).toBe(4);
  expect(items.every(li=>!li.style.paddingLeft)).toBe(true);
  expect(host.textContent).toContain('4 concepts');
  items[0].querySelector('button')!.focus();
  expect(items[0].querySelector('button')!.className).toContain('min-h-11');
 });
 it('searches using real labels and reports filtered-empty',async()=>{
  await render();
  const input=host.querySelector('input[aria-label="Find a concept"]') as HTMLInputElement;
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Counterexamples');
   input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  expect(host.textContent).toContain('Counterexamples');
  expect(host.textContent).toContain('1 matching concept');
  expect(host.textContent).not.toContain('Open sets');
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'No exact idea 123');
   input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  expect(host.textContent).toContain('No concepts match your search');
 });
 it('shows distinct loading, empty, and failure states with a retry action',async()=>{
  vi.mocked(useAtlas).mockReturnValue(fake(null,true) as ReturnType<typeof useAtlas>);
  await render();expect(host.textContent).toContain('Loading concepts');
  vi.mocked(useAtlas).mockReturnValue(fake({subjects:[],concepts:[],links:[]}) as ReturnType<typeof useAtlas>);
  await render();expect(host.textContent).toContain('No concepts yet');
  const retry=vi.fn(async()=>{});
  vi.mocked(useAtlas).mockReturnValue({...fake(null,false,new Error('offline')),refetch:retry} as ReturnType<typeof useAtlas>);
  await render();expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not load');
  await click('Retry');expect(retry).toHaveBeenCalledTimes(1);
 });
 it('keeps flag-off legacy Atlas mounted; flag-on opens the list',async()=>{
  vi.mocked(useAtlas).mockReturnValue(fake(null,true) as ReturnType<typeof useAtlas>);
  vi.mocked(isFlagOn).mockReturnValue(false);
  await render(<AtlasPage/>);
  expect(host.textContent).not.toContain('Loading concepts…');
  expect(host.querySelector('main[aria-label="Atlas"]')).toBeTruthy();
  vi.mocked(isFlagOn).mockReturnValue(true);
  await render(<AtlasPage/>);
  expect(host.textContent).toContain('Loading concepts…');
 });
});
