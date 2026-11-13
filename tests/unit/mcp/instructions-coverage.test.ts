import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {INSTRUCTIONS} from '../../../supabase/functions/mcp/rules';

// N160: the model can only use what its instructions name. Every registered
// resource, every read, and the confirmation rule must be written down.
const manifest=JSON.parse(readFileSync('docs/v6/capability-registry/lemma_command_resources.json','utf8')) as
 {resources:{resource:string;mcp_ok:boolean}[]};
const map=JSON.parse(readFileSync('docs/mcp/capability-map.json','utf8')) as {areas:{n:number;status:string}[]};
describe('N160 the model is told how to reach every area',()=>{
 it('names every registered MCP resource',()=>{
  const missing=manifest.resources.filter(r=>r.mcp_ok&&!INSTRUCTIONS.includes(r.resource)).map(r=>r.resource);
  expect(missing,'add these resources to INSTRUCTIONS in supabase/functions/mcp/rules.ts').toEqual([]);
 });
 it('names every extra read and the redo and move rules',()=>{
  for(const token of ['calendar_overlaps','what=today','what=progress','what=export','what=connection','what=devices','source_upload','redo:true','set {project}','uploaded:true'])
   expect(INSTRUCTIONS,token).toContain(token);
 });
 it('makes the model ask before a confirmed account action',()=>{
  expect(INSTRUCTIONS).toMatch(/never confirm in the same turn as request/);
  expect(INSTRUCTIONS).toMatch(/Account deletion is only in the app/);
  expect(INSTRUCTIONS).toMatch(/commit only the placement_ids the user confirmed/);
 });
 it('keeps the instructions a sensible size',()=>{
  expect(INSTRUCTIONS.length).toBeLessThan(7000);
 });
 it('leaves no area of the map unsupported except the reminder background run',()=>{
  expect(map.areas.filter(a=>a.status!=='supported').map(a=>a.n)).toEqual([30]);
 });
});
