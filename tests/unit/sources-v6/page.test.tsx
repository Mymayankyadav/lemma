import {beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import type {Source,SourceTranscriptionStat} from '../../../src/data/types';
import V6Sources,{orderedSources,coverageOf} from '../../../src/features/project/sources-v6/V6Sources';

const mocks=vi.hoisted(()=>({stats:{data:[] as SourceTranscriptionStat[],isPending:false,isError:false}}));
vi.mock('../../../src/data/hooks',()=>({useSourceTranscriptionStats:()=>mocks.stats}));
vi.mock('../../../src/ui/FastTex',()=>({FastTex:({source}:{source:string})=><span>{source}</span>}));
vi.mock('../../../src/features/project/SourceTranscriptionView',()=>({
 SourceTranscriptionView:({source}:{source:Source})=><button type="button">View pages and export {source.title}</button>
}));
function source(id:string,position:number|null=1):Source{
 return {id,projectId:'path',title:'Source '+id,short:id,filename:id+'.pdf',
  position:position??undefined,kind:'book',status:'ready',hasText:false,pageCount:5,
  outline:[],createdAt:'2026-11-01T12:00:00Z',planCheckedAt:null};
}
function render(sources:Source[],manage=<button type="button">Existing upload action</button>){
 const node=document.createElement('div');document.body.appendChild(node);const root=createRoot(node);
 act(()=>root.render(<V6Sources projectId="path" sources={sources} manage={manage}/>));
 return node;
}
describe('v6 source panel',()=>{
 beforeEach(()=>{document.body.replaceChildren();mocks.stats={data:[],isPending:false,isError:false};});
 it('orders plan positions without mutating the caller collection',()=>{
  const list=[source('b',3),source('a',1),source('c',2)];
  expect(orderedSources(list).map(s=>s.id)).toEqual(['a','c','b']);
  expect(list.map(s=>s.id)).toEqual(['b','a','c']);
 });
 it('does not invent missing coverage and verifies outstanding checks',()=>{
  expect(coverageOf(source('a'),undefined)).toEqual({
   label:'5 pages · transcription coverage unavailable',verification:'Verification unavailable'});
  expect(coverageOf(source('a'),{sourceId:'a',transcribed:4,needsCheck:2})).toEqual({
   label:'4 of 5 pages transcribed',verification:'2 pages need checking'});
 });
 it('shows kind, plan order, coverage and the page/export controls',()=>{
  mocks.stats.data=[{sourceId:'a',transcribed:5,needsCheck:1}];
  const node=render([source('b',2),source('a',1)]);
  const text=node.textContent??'';
  expect(text.indexOf('Source a')).toBeLessThan(text.indexOf('Source b'));
  expect(text).toContain('5 of 5 pages transcribed');
  expect(text).toContain('1 page need checking');
  expect(text).toContain('View pages and export Source a');
  expect(text).toContain('Not yet checked against plan');
 });
 it('preserves existing upload and edit controls without duplicated mutation paths',()=>{
  const node=render([source('a')]);
  expect(node.textContent).not.toContain('Existing upload action');
  const button=Array.from(node.querySelectorAll('button')).find(el=>el.textContent==='Add, edit or remove sources');
  expect(button).toBeTruthy();
  act(()=>button!.click());
  expect(node.textContent).toContain('Existing upload action');
  expect(button!.getAttribute('aria-expanded')).toBe('true');
 });
 it('distinguishes no sources and unavailable server coverage',()=>{
  mocks.stats.isError=true;
  const node=render([]);
  expect(node.textContent).toContain('No sources yet');
  expect(node.textContent).toContain('Transcription coverage unavailable');
 });
 it('starts at twenty rows and paginates to the remainder',()=>{
  const node=render(Array.from({length:25},(_,i)=>source(String(i).padStart(2,'0'),i)));
  expect(node.querySelectorAll('ol > li')).toHaveLength(20);
  const more=Array.from(node.querySelectorAll('button')).find(el=>el.textContent?.includes('Show 20 more sources'));
  expect(more).toBeTruthy();
  act(()=>more!.click());
  expect(node.querySelectorAll('ol > li')).toHaveLength(25);
 });
});
