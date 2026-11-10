import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it} from 'vitest';
import {Chart,Heatmap,HorizontalBars} from '../../../src/ui/v7/Chart';

describe('v7 charts',()=>{
 it('provides keyboard details and an equivalent table',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div'); document.body.append(host);const root=createRoot(host);
  try{
   await act(async()=>root.render(<Chart title="Time" data={[{label:'Mon',values:[2,3]}]} series={[{label:'Analysis'},{label:'Algebra'}]} kind="stacked" format={n=>`${n} h`}/>));
   const mark=host.querySelector('[role=button]')!;
   expect(mark.getAttribute('aria-label')).toBe('Mon: Analysis 2 h, Algebra 3 h');
   await act(async()=>mark.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
   expect(host.querySelector('[role=status]')?.textContent).toContain('2 h Analysis');
   await act(async()=>host.querySelector('button')!.click());
   expect(host.querySelector('table')?.textContent).toContain('3 h');
  }finally{await act(async()=>root.unmount());host.remove();}
 });
 it('exposes heatmap and ranked values through table and keyboard',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
   await act(async()=>root.render(<><Heatmap title="Activity" data={[{date:'2026-01-01',value:3}]}/><HorizontalBars title="Subjects" data={[{label:'Analysis',value:6}]}/></>));
   expect(host.querySelector('.v7-heatmap button')?.getAttribute('aria-label')).toMatch(/3/);
   await act(async()=>host.querySelector<HTMLButtonElement>('.v7-heatmap button')!.click());
   expect(host.querySelector('[role=status]')?.textContent).toContain('3');
   const toggles=host.querySelectorAll<HTMLButtonElement>('.v7-chart-toggle');
   await act(async()=>toggles[1].click());
   expect(host.querySelector('table')?.textContent).toContain('Analysis');
  }finally{await act(async()=>root.unmount());host.remove();}
 });
 it('renders an empty state',async()=>{
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{await act(async()=>root.render(<Chart title="No data" data={[]} series={[{label:'Time'}]}/>));expect(host.textContent).toContain('No data in this range yet.');}
  finally{await act(async()=>root.unmount());host.remove();}
 });
});
