import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it} from 'vitest';
import {resolveFlags} from '../../../src/flags';
import {setV6Root} from '../../../src/app/v6Root';

const css=readFileSync('src/ui/v6/tokens.css','utf8');
const app=readFileSync('src/app/AppShell.tsx','utf8');
const base=':root[data-v6]';
const day=':root[data-v6][data-theme="graph"]';
const night=':root[data-v6][data-theme="graph-night"]';

function properties(selector:string):Record<string,string>{
 const start=css.indexOf(selector+' {');
 expect(start,selector+' must be defined').toBeGreaterThanOrEqual(0);
 const block=css.slice(start+selector.length+2,css.indexOf('}',start));
 return Object.fromEntries(Array.from(block.matchAll(/(--v6-[\w-]+)\s*:\s*([^;]+);/g),
  ([,name,value])=>[name,value.trim()]));
}
const baseTokens=properties(base);
const dayTokens={...baseTokens,...properties(day)};
const nightTokens={...baseTokens,...properties(night)};
function luminance(color:string):number{
 expect(color).toMatch(/^#[\da-f]{6}$/i);
 const channels=Array.from({length:3},(_,i)=>parseInt(color.slice(1+i*2,3+i*2),16)/255)
  .map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
 return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
}
function ratio(fg:string,bg:string){
 const a=luminance(fg),b=luminance(bg);
 return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}

afterEach(()=>{document.documentElement.removeAttribute('data-v6');});

describe('N19 flag-gated v6 visual contracts',()=>{
 it('sets data-v6 on the root only when the shell flag is enabled',()=>{
  const root=document.documentElement;
  const enabled=resolveFlags({allowOverrides:true,search:'?flags=v6Shell'}).v6Shell;
  expect(enabled).toBe(true);
  setV6Root(enabled);
  expect(root.hasAttribute('data-v6')).toBe(true);
  // N102: on by default; production ignores overrides, so only a build that allows them can turn it off.
  expect(resolveFlags({allowOverrides:false,search:'?flags=-v6Shell'}).v6Shell).toBe(true);
  expect(resolveFlags({allowOverrides:true,search:'?flags=-v6Shell'}).v6Shell).toBe(false);
  setV6Root(false);
  expect(root.hasAttribute('data-v6')).toBe(false);
  expect(app).toContain('setV6Root(v6)');
  expect(app).toContain("import '../ui/v6/tokens.css'");
 });
 it('defines every v6 shell variable in the base and both explicit theme schemes',()=>{
  const refs=[...css.matchAll(/var\((--v6-[\w-]+)/g)].map(m=>m[1]);
  expect(refs.length).toBeGreaterThan(10);
  for(const name of new Set(refs)){
   expect(baseTokens[name],name+' needs an initial value').toBeDefined();
   expect(dayTokens[name],name+' missing in Day').toBeDefined();
   expect(nightTokens[name],name+' missing in Night').toBeDefined();
  }
  for(const scheme of [dayTokens,nightTokens]){
   for(const property of [
    '--v6-color-background','--v6-color-surface','--v6-color-text',
    '--v6-color-primary','--v6-color-muted','--v6-color-border',
    '--v6-font-display','--v6-font-ui','--v6-font-clock',
    '--v6-space-4','--v6-radius-card','--v6-elevation-card',
   ]) expect(scheme[property],property).toBeTruthy();
  }
  expect(css).toContain('@media (prefers-color-scheme: dark)');
  expect(css).toContain(':root[data-v6]:not([data-theme])');
 });
 it('maintains WCAG AA body and UI foreground contrast in Day and Night',()=>{
  for(const scheme of [dayTokens,nightTokens]){
   const primary=scheme['--v6-color-primary'];
   expect(ratio(scheme['--v6-color-text'],scheme['--v6-color-background'])).toBeGreaterThanOrEqual(4.5);
   expect(ratio(scheme['--v6-color-text'],scheme['--v6-color-surface'])).toBeGreaterThanOrEqual(4.5);
   expect(ratio(scheme['--v6-color-muted'],scheme['--v6-color-surface'])).toBeGreaterThanOrEqual(4.5);
   expect(ratio(scheme['--v6-color-on-primary'],primary)).toBeGreaterThanOrEqual(4.5);
   expect(ratio(scheme['--v6-color-on-danger'],scheme['--v6-color-danger'])).toBeGreaterThanOrEqual(4.5);
  }
  expect(dayTokens['--v6-color-primary']).not.toBe(nightTokens['--v6-color-primary']);
 });
 it('applies the v6 tokens to all three shell surfaces and nowhere unflagged',()=>{
  expect(css).toContain(':root[data-v6] [data-v6-header]');
  expect(css).toContain(':root[data-v6] nav[aria-label="Main navigation"]');
  expect(css).toContain(':root[data-v6] [aria-label="Focus accessory"]');
  for(const selector of css.matchAll(/(^|\n)\s*([^{}]+)\{/g)){
   const rule=selector[2].trim();
   // Ignore at-rules, and require all actual styling rules to be scoped to data-v6.
   if(rule.startsWith('@')||rule.startsWith('/*'))continue;
   expect(rule).toContain('[data-v6]');
  }
 });
 it('uses licensed-or-local preferred font stacks without external font requests',()=>{
  expect(baseTokens['--v6-font-display']).toContain("'Newsreader'");
  expect(baseTokens['--v6-font-ui']).toContain("'Instrument Sans'");
  expect(baseTokens['--v6-font-clock']).toContain("'IBM Plex Mono'");
  expect(baseTokens['--v6-font-display']).toContain('serif');
  expect(baseTokens['--v6-font-ui']).toContain('system-ui');
  expect(baseTokens['--v6-font-clock']).toContain('monospace');
  expect(css).not.toMatch(/@import|@font-face|https?:\/\/|url\(/);
 });
});
