import {describe,expect,it} from 'vitest';
import {nightlyLinkBatch,type LinkCursor} from '../../../supabase/functions/_shared/adaptive/workers';
import {groupProposals,contentHash,type AtlasLink} from '../../../supabase/functions/_shared/adaptive/links';

const concept=(id:string,name:string,parent:string|null,subject='s1',blurb:string|null=null)=>({id,name,parent_id:parent,subject_id:subject,blurb});
const base=()=>[concept('p1','Topology',null),concept('p2','Topology',null,'s2'),concept('c1','Compactness','p1'),concept('c2','Compactness','p2','s2'),concept('h1','Hausdorff spaces','p1'),concept('h2','Hausdorff space','p2','s2')];
const analogous=async()=>({kind:'analogous',direction:'forward',confidence:.8,rationale:'Same structure'});

describe('06 §6 nightly and import link batch',()=>{
 it('proposes on the first run, links an exact same-named pair automatically, and is quiet on the second run',async()=>{
  const first=await nightlyLinkBatch(base(),[],{seen:{}},analogous);
  expect(first.proposals.length).toBeGreaterThan(0);
  const auto=first.proposals.filter(p=>p.origin==='auto');expect(auto.length).toBeGreaterThan(0);expect(auto.every(p=>p.status==='approved'&&p.kind==='equivalent')).toBe(true);
  expect(first.proposals.filter(p=>p.origin==='worker').every(p=>p.status==='proposed')).toBe(true);
  const second=await nightlyLinkBatch(base(),first.proposals as AtlasLink[],first.cursor,analogous);
  expect(second.proposals).toEqual([]);expect(second.deferred).toBe(0);
 });
 it('treats only a concept whose name or blurb hash changed as fresh, and brings a rejected pair back only then',async()=>{
  const first=await nightlyLinkBatch(base(),[],{seen:{}},analogous);
  const h1=base().find(c=>c.id==='h1')!,h2=base().find(c=>c.id==='h2')!,rejected:AtlasLink={id:'r',from_id:'h1',to_id:'h2',kind:'analogous',status:'rejected',from_hash:contentHash(h1 as any),to_hash:contentHash(h2 as any)} as AtlasLink;
  const existing=[...first.proposals.filter(p=>!(p.from_id==='h1'&&p.to_id==='h2')) as AtlasLink[],rejected];
  const unchanged=await nightlyLinkBatch(base(),existing,first.cursor,analogous);expect(unchanged.proposals).toEqual([]);
  const renamed=base().map(c=>c.id==='h2'?{...c,name:'Hausdorff spaces (T2)'}:c);
  const changed=await nightlyLinkBatch(renamed,existing,first.cursor,analogous);
  expect(changed.proposals.some(p=>(p.from_id==='h1'&&p.to_id==='h2')||(p.from_id==='h2'&&p.to_id==='h1'))).toBe(true);
  expect(changed.cursor.seen.h2).not.toBe(first.cursor.seen.h2);
 });
 it('caps a batch and says how many were deferred; a missing or invalid label proposes nothing',async()=>{
  const capped=await nightlyLinkBatch(base(),[],{seen:{}},analogous,1);
  expect(capped.proposals.length).toBe(1);expect(capped.deferred).toBeGreaterThan(0);
  expect((await nightlyLinkBatch(base(),[],{seen:{}},async()=>null)).proposals.every(p=>p.origin==='auto')).toBe(true);
  expect((await nightlyLinkBatch(base(),[],{seen:{}},async()=>({kind:'made_up'}))).proposals.every(p=>p.origin==='auto')).toBe(true);
  const empty:LinkCursor={seen:{}};expect((await nightlyLinkBatch([],[],empty,analogous)).proposals).toEqual([]);
 });
});

describe('06 §6 batches by kind',()=>{
 it('groups only proposed links by kind, largest group first, stable order',()=>{
  const links=[{kind:'analogous',status:'proposed'},{kind:'equivalent',status:'proposed'},{kind:'analogous',status:'proposed'},{kind:'contrasts',status:'approved'},{kind:'part_of',status:'rejected'}];
  expect(groupProposals(links).map(g=>[g.kind,g.links.length])).toEqual([['analogous',2],['equivalent',1]]);
  expect(groupProposals([])).toEqual([]);
 });
});
