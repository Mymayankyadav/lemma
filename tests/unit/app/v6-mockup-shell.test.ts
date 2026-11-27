import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {v6CompactHeader,v6PageTitle,v6TabRoutes} from '../../../src/app/V6Header';
import {v6ActiveTab} from '../../../src/app/TabBar';

/** Split a selector list on top-level commas only (not inside :is(…), :not(…) or [attr]). */
function splitSelectors(list:string){
 const out:string[]=[];let depth=0,start=0;
 for(let i=0;i<list.length;i++){
  const c=list[i];
  if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;
  else if(c===','&&depth===0){out.push(list.slice(start,i));start=i+1;}
 }
 return [...out,list.slice(start)];
}
const sheets=['src/ui/v6/mockup.css','src/ui/v6/mockup-bindings.css'];

describe('N110 mockup shell',()=>{
 it('scopes every ported mockup rule to the v6 flag root',()=>{
  for(const file of sheets){
   // Selector preludes: text before each "{" that is not an at-rule or a keyframe step.
   const css=readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
   const preludes=[...css.matchAll(/(?:^|[{};])\s*([^{};@]+?)\s*\{/g)].map(m=>m[1].trim())
    .filter(p=>!/^(from|to|\d+%)$/.test(p));
   expect(preludes.length,file).toBeGreaterThan(10);
   for(const prelude of preludes)for(const selector of splitSelectors(prelude))
    expect(selector.trim(),file+': '+selector).toMatch(/^(:root|html)\[data-v6\]/);
  }
  expect(readFileSync('src/ui/v6/mockup.css','utf8')).not.toMatch(/@import|https?:\/\//);
  const shell=readFileSync('src/app/AppShell.tsx','utf8');
  const legacy=readFileSync('src/app/LegacyStyles.tsx','utf8');
  expect(shell).toContain("import('./LegacyStyles')");
  for(const css of ['mockup.css','mockup-bindings.css']){
   expect(shell).not.toContain("import '../ui/v6/"+css+"'");
   expect(legacy).toContain("import '../ui/v6/"+css+"'");
  }
 });
 it('uses the shared rose primary in the day and night mockup shells',()=>{
  const css=readFileSync('src/ui/v6/mockup.css','utf8');
  const palette=readFileSync('src/styles/palette.css','utf8');
  for(const [theme,accent] of [['graph','#a8476d'],['graph-night','#d885a2']]){
   const shell=css.split('html[data-v6][data-theme='+theme+']{').slice(1).map(block=>block.split('}')[0]).join('\n');
   const shared=palette.split('[data-v7][data-theme="'+theme+'"] {')[1]?.split('}')[0];
   expect(shared).toContain('--accent: '+accent+';');
   expect(shell).toContain('--link:var(--accent);');
   expect(shell).toContain('--amber:var(--accent);');
   expect(shell).not.toMatch(/--accent\s*:/);
  }
 });
 it('keeps Inbox and Add on destinations, Cards and Inbox; other details use the menu only',()=>{
  for(const route of v6TabRoutes)expect(v6CompactHeader(route),route).toBe(false);
  expect(v6CompactHeader('/cards')).toBe(false);
  expect(v6CompactHeader('/proposals')).toBe(false);
  expect(v6CompactHeader('/settings')).toBe(true);
  expect(v6CompactHeader('/cards/7')).toBe(true);
  expect(v6PageTitle('/atlas')).toBe('Concept map');
 });
 it('keeps the owning destination highlighted on detail routes',()=>{
  expect(v6ActiveTab('/projects','/p/real-analysis')).toBe(true);
  expect(v6ActiveTab('/projects','/projects/new')).toBe(true);
  // #1324: Cards highlights no destination, as in the mockup captures.
  expect(v6ActiveTab('/review','/cards/7')).toBe(false);
  expect(v6ActiveTab('/review','/cards')).toBe(false);
  expect(v6ActiveTab('/review','/review/run')).toBe(true);
  expect(v6ActiveTab('/','/projects')).toBe(false);
  expect(v6ActiveTab('/insights','/insights')).toBe(true);
 });
});
