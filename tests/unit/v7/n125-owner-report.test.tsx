import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {Chart,labelWidth} from '../../../src/ui/v7/Chart';
import {Chip} from '../../../src/ui/v7/components';

// N125: the Owner's phone report of 12 Nov 2026 (items 4–6 and the duplicated chip tick found while checking them).
async function render(node:React.ReactNode){
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(node));
 return {host,done:async()=>{await act(async()=>root.unmount());host.remove();}};
}
const axis=(value:number)=>value<60?Math.round(value)+' min':(Math.round(value/6)/10).toLocaleString('en')+' h';

describe('N125 owner report',()=>{
 it('item 6: every axis label fits inside the chart, so "40 min" is never clipped to "0 min"',async()=>{
  const {host,done}=await render(<Chart title="Time by subject" kind="stacked" format={axis}
   data={[{label:'28 Oct',values:[40,32]},{label:'11 Nov',values:[0,26]}]} series={[{label:'Linear Algebra'},{label:'Topology'}]}/>);
  try{
   const labels=[...host.querySelectorAll('text.v7-chart-text[text-anchor="end"]')];
   expect(labels.map(label=>label.textContent)).toEqual(['0 min','20 min','40 min','1 h','1.3 h']);
   for(const label of labels)expect(Number(label.getAttribute('x'))).toBeGreaterThanOrEqual(labelWidth(label.textContent!));
  }finally{await done();}
 });
 it('item 5: a tapped column gets a faint band, and taps never show the browser focus ring',async()=>{
  const {host,done}=await render(<Chart title="Reviews" data={[{label:'Mon',values:[3]},{label:'Tue',values:[5]}]} series={[{label:'Reviews'}]}/>);
  try{
   expect(host.querySelector('.v7-chart-band')).toBeNull();
   await act(async()=>host.querySelectorAll<SVGGElement>('[data-chart-point]')[1].dispatchEvent(new MouseEvent('click',{bubbles:true})));
   const bands=host.querySelectorAll('.v7-chart-band');
   expect(bands).toHaveLength(1);
   expect(bands[0].closest('[data-chart-point]')).toBe(host.querySelectorAll('[data-chart-point]')[1]);
   const css=readFileSync('src/ui/v7/chart.css','utf8');
   expect(css).toMatch(/\.v7-chart \[data-chart-point\]:focus,[^{]*\{outline:none;\}/);
   expect(css).toMatch(/\[data-chart-point\]:focus-visible \.v7-chart-band \{[^}]*stroke:var\(--v7-role-focus-ring\)/);
  }finally{await done();}
 });
 it('a selected filter chip shows one tick (drawn by CSS), not two',async()=>{
  const {host,done}=await render(<Chip selected onClick={()=>undefined}>50 min</Chip>);
  try{
   expect(host.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
   expect(host.querySelectorAll('button svg')).toHaveLength(0);
   expect(readFileSync('src/ui/v7/components.css','utf8')).toMatch(/\.v7-filter-chip:is\(\[aria-pressed="true"\],\[aria-checked="true"\]\)::before \{content:""/);
  }finally{await done();}
 });
 it('item 4: the connector actions sit in a two-column grid with New address on its own row',()=>{
  const css=readFileSync('src/features/settings/v7/settings.css','utf8');
  expect(css).toMatch(/\.v7-connector-actions \{display:grid;grid-template-columns:1fr 1fr;gap:var\(--v7-space-3\)/);
  expect(readFileSync('src/features/settings/v7/SettingsV7.tsx','utf8')).toContain('<div className="v7-connector-actions">');
 });
});
