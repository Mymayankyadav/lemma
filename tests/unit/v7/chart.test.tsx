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
   // N220 (Owner report): no Table switch; the equivalent table is always there for screen readers.
   expect(host.querySelector('.v7-chart-toggle')).toBeNull();
   expect(host.querySelector('.v7-sr-only table')?.textContent).toContain('3 h');
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
   expect(host.querySelectorAll('.v7-chart-toggle')).toHaveLength(0);
   const tables=host.querySelectorAll('.v7-sr-only table');
   expect(tables).toHaveLength(2);
   expect(tables[0].textContent).toContain('3');
   expect(tables[1].textContent).toContain('Analysis');
  }finally{await act(async()=>root.unmount());host.remove();}
 });
 it('renders an empty state',async()=>{
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
   await act(async()=>root.render(<Chart title="No data" data={[]} series={[{label:'Time'}]}/>));
   expect(host.querySelector('.v7-chart-summary')?.textContent).toBe('None yet.');
   expect(host.querySelector('.v7-plot')).toBeNull();
  }
  finally{await act(async()=>root.unmount());host.remove();}
 });
});
