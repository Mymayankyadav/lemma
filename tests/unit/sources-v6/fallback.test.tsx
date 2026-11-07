import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it,vi} from 'vitest';
import V6Sources from '../../../src/features/project/sources-v6/V6Sources';
vi.mock('../../../src/data/hooks',()=>({useProject:()=>({data:null})}));
vi.mock('../../../src/ui/FastTex',()=>({FastTex:({source}:{source:string})=><span>{source}</span>}));
describe('N82 unavailable optional transcription integration',()=>{
 it('preserves the Project route and source titles without a stats hook',()=>{
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  act(()=>root.render(<V6Sources projectId="path"
   sources={[{id:'s1',projectId:'path',title:'Legacy source',position:1,
    kind:'notes',status:'ready',hasText:true,pageCount:3,
    short:'L',filename:'legacy.md',outline:[],createdAt:'2026-11-07T00:00:00Z',
    planCheckedAt:null}]} manage={<button>Edit existing source</button>}/>));
  expect(host.querySelector('[data-v6-sources]')).not.toBeNull();
  expect(host.textContent).toContain('Legacy source');
  expect(host.textContent).toContain('Transcription coverage unavailable');
  act(()=>root.unmount());host.remove();
 });
});
