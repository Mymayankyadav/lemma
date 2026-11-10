import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it,vi} from 'vitest';
import CardVariants,{describeDue} from '../../../src/features/card/v6/CardVariants';
describe('N84 v6 card sibling schedules',()=>{
 it('shows every variant in ordinal order without mutating the source',async()=>{
  const source=[{ordinal:3,due:null,stability:0},{ordinal:1,due:'2025-01-01T00:00:00Z',stability:2.6}];
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  try{
   await act(async()=>root.render(<CardVariants variants={source}/>));
   expect(host.textContent).toContain('Card variants (2)');
   expect(host.textContent?.indexOf('Variant 1')).toBeLessThan(host.textContent!.indexOf('Variant 3'));
   expect(host.textContent).toContain('Due now');
   expect(host.textContent).toContain('3 d stable');
   expect(source[0].ordinal).toBe(3);
   await act(async()=>host.querySelector('button')!.click());
   expect(host.textContent).not.toContain('Variant 1');
  }finally{await act(async()=>root.unmount());host.remove()}
 });
 it('exposes existing note-edit and suspension paths without inventing a scheduling write',async()=>{
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host),edit=vi.fn(),toggle=vi.fn();
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  try{
   await act(async()=>root.render(<CardVariants
    variants={[{ordinal:2,due:null,stability:0,reps:2,lapses:1,state:2}]}
    status="active" onEdit={edit} onToggleStatus={toggle}/>));
   expect(host.textContent).toContain('Reviews');
   expect(host.textContent).toContain('Review');
   expect(host.textContent).toContain('Lapses');
   await act(async()=>[...host.querySelectorAll('button')].find(b=>
    b.textContent==='Edit note and preview math')!.click());
   expect(edit).toHaveBeenCalledTimes(1);
   await act(async()=>[...host.querySelectorAll('button')].find(b=>
    b.textContent==='Pause card')!.click());
   expect(toggle).toHaveBeenCalledTimes(1);
   await act(async()=>root.render(<CardVariants variants={[]} status="suspended"
    onEdit={edit} onToggleStatus={toggle} busy/>));
   const restore=[...host.querySelectorAll('button')].find(b=>b.textContent==='Resume card')!;
   expect((restore as HTMLButtonElement).disabled).toBe(true);
  }finally{await act(async()=>root.unmount());host.remove()}
 });
 it('uses explicit unknown/new scheduling placeholders, not invented dates',()=>{
  expect(describeDue(null)).toBe('Not scheduled');
  expect(describeDue('not-a-date')).toBe('Unavailable');
  expect(describeDue('2026-11-08T00:00:00Z',Date.parse('2026-11-07T12:00:00Z'))).toBe('Tomorrow');
 });
});
