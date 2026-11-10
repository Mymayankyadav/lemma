import {describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router';
import V6Project from '../../../src/features/project/v6/V6Project';

// The flagged route must render the REAL N82 panel; only external data and
// transcription APIs are stubbed so a missing mount fails this regression.
vi.mock('../../../src/flags',()=>({isFlagOn:()=>true}));
vi.mock('../../../src/features/project/SourceTranscriptionView',()=>({
 SourceTranscriptionView:()=> <p>Existing transcription controls</p>,
}));
vi.mock('../../../src/data/hooks',()=>({
 useSourceTranscriptionStats:()=>({data:[],isPending:false,isError:false}),
 useProject:()=>({isPending:false,isError:false,data:{
  project:{id:'project',title:'Math path',goal:'Understand proof',status:'active'},
  subject:{glyph:'π',name:'Math'},checkpoints:[],done:0,total:0,sessions:[],
  sources:[{id:'src',projectId:'project',title:'Lecture notes',short:'Notes',filename:'notes.pdf',
   kind:'notes',status:'ready',hasText:true,pageCount:3,position:1,outline:[],
   createdAt:'2026-11-01T10:00:00Z',planCheckedAt:null}],pendingProposals:0,
 }}),
}));
vi.mock('../../../src/ui/FastTex',()=>({FastTex:({source}:{source:string})=><span>{source}</span>}));

describe('v6 sources route integration',()=>{
 it('mounts the owner-source panel when sources are opened from the flagged Project',()=>{
  const node=document.createElement('div');document.body.appendChild(node);
  const root=createRoot(node);
  act(()=>root.render(<MemoryRouter initialEntries={['/p/math']}>
   <Routes><Route path="/p/:slug" element={<V6Project/>}/></Routes>
  </MemoryRouter>));
  // N121 F3: the Sources tile is the toggle; its accessible name keeps "Show sources (n)".
  const toggle=Array.from(node.querySelectorAll('button')).find(button=>button.getAttribute('aria-label')?.startsWith('Show sources'));
  expect(toggle).toBeTruthy();
  act(()=>toggle!.click());
  expect(node.querySelector('[data-v6-sources]')).not.toBeNull();
  expect(node.textContent).toContain('Study sources');
  expect(node.querySelector('[aria-label="Coverage for Lecture notes"]')).not.toBeNull();
  expect(node.getElementsByTagName('h2').length).toBeGreaterThan(0);
  act(()=>root.unmount());node.remove();
 });
});
