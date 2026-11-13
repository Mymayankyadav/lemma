import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// N160: the Owner's 30-area checklist, checked against what the server really
// registers. A resource, operation or tool named in docs/mcp/capability-map.json
// must exist, and a registered resource that belongs to no area fails here.
type Area={n:number;title:string;status:'supported'|'partial'|'missing';tools:string[];
 covers:{resource:string;operations:string[]}[];gap?:string;item?:string;note?:string};
const map=JSON.parse(readFileSync('docs/mcp/capability-map.json','utf8')) as {areas:Area[]};
const manifest=JSON.parse(readFileSync('docs/v6/capability-registry/lemma_command_resources.json','utf8')) as
 {resources:{resource:string;mcp_ok:boolean;schema:{operations:string[]}}[]};
const server=readFileSync('supabase/functions/mcp/server.ts','utf8');
const next=readFileSync('NEXT.md','utf8');
// Saved-time corrections (study_command) are advertised from registry.ts, not the seeded row.
const registrySource=readFileSync('supabase/functions/mcp/tools/registry.ts','utf8');
const savedTimeOps=[...(/SAVED_TIME_OPERATIONS[^=]*=\{\s*study_entries:\[([^\]]*)\]/.exec(registrySource)?.[1]??'').matchAll(/'([^']+)'/g)].map(m=>m[1]);
function toolNames():string[]{
 const start=server.indexOf('export const TOOL_NAMES=[');
 return [...server.slice(start,server.indexOf(']',start)).matchAll(/'([^']+)'/g)].map(m=>m[1]);
}
describe('N160 capability map of the 30 chat-connector areas',()=>{
 it('lists the 30 areas once, in order',()=>{
  expect(map.areas.map(a=>a.n)).toEqual(Array.from({length:30},(_,i)=>i+1));
 });
 it('names only tools the server registers',()=>{
  const registered=new Set(toolNames());
  for(const a of map.areas)for(const t of a.tools)
   expect(registered.has(t),`area ${a.n} names unknown tool ${t}`).toBe(true);
 });
 it('advertises exactly the tools it registers',()=>{
  const declared=toolNames();
  const registered=[...server.matchAll(/\bregister\('([a-z_]+)'/g)].map(m=>m[1]);
  if(server.includes("m.registerTool('study'"))registered.push('study');
  expect([...declared].sort()).toEqual([...registered].sort());
 });
 it('names only registered resources and operations',()=>{
  const byName=new Map(manifest.resources.map(r=>[r.resource,r]));
  for(const a of map.areas)for(const c of a.covers){
   const r=byName.get(c.resource);
   expect(r,`area ${a.n}: resource ${c.resource} is not registered`).toBeDefined();
   expect(r!.mcp_ok).toBe(true);
   for(const op of c.operations)
    expect([...r!.schema.operations,...(c.resource==='study_entries'?savedTimeOps:[])],`area ${a.n}: ${c.resource}.${op}`).toContain(op);
  }
 });
 it('maps every registered resource to an area',()=>{
  const mapped=new Set(map.areas.flatMap(a=>a.covers.map(c=>c.resource)));
  const loose=manifest.resources.filter(r=>r.mcp_ok&&!mapped.has(r.resource)).map(r=>r.resource);
  expect(loose,'add these resources to an area of docs/mcp/capability-map.json').toEqual([]);
 });
 it('gives every unfinished area a gap and a real NEXT.md sub-item',()=>{
  for(const a of map.areas){
   if(a.status==='supported'){expect(a.gap,`area ${a.n}`).toBeUndefined();continue;}
   expect(a.gap,`area ${a.n} needs a gap`).toBeTruthy();
   expect(a.item,`area ${a.n} needs an item`).toMatch(/^N160\.\d+$/);
   expect(next,`area ${a.n}: ${a.item} is not in NEXT.md`).toMatch(new RegExp('^(## |- )'+a.item!.replace('.','\\.')+'\\b','m'));
  }
 });
 it('lists recurring tasks as supported with the series operations',()=>{
  const area=map.areas.find(a=>a.n===4)!;
  expect(area.status).toBe('supported');
  expect(area.covers[0].operations).toEqual(['create','update','skip','unskip','stop','resume']);
 });
});
