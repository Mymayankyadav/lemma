import {describe,expect,it} from 'vitest';
import {fakeContext,tablesFrom} from './fakedb';
import {rowsFor} from './rows';
import {contentHash} from '../../../supabase/functions/_shared/adaptive/links';
import {factsForAtlas} from '../../../supabase/functions/_shared/adaptive/atlas';
import {parseWorkerPage,readAtlasWorker,readAtlasTagSuggestions} from '../../../supabase/functions/mcp/tools/atlas-worker-read';

const ids=[
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102',
  '11111111-1111-4111-8111-111111111103'
];
const nodes=ids.map((id,i)=>({id,user_id:'11111111-1111-4111-8111-111111111111',
  subject_id:'11111111-1111-4111-8111-111111111121',name:['Group basics','Homomorphisms','Proof technique'][i],
  slug:'concept-'+i,blurb:'Mathematics '+i,kind:i===2?'technique':'topic',
  parent_id:null,family_id:null,level:'planet',version:1,updated_at:'2026-11-22T00:00:00Z'}));

describe('API-key-free Atlas MCP worker reads',()=>{
  it('enforces a bounded, section-bound cursor',()=>{
    expect(parseWorkerPage({id:'concepts',limit:20,cursor:'concepts:20'})).toEqual({section:'concepts',limit:20,offset:20});
    expect(()=>parseWorkerPage({id:'concepts',limit:51})).toThrow('limit');
    expect(()=>parseWorkerPage({id:'concepts',cursor:'atlas_links:1'})).toThrow('cursor');
    expect(()=>parseWorkerPage({id:'settings'})).toThrow('Unknown');
  });
  it('returns deterministic pages with owner scope and concept content hashes',async()=>{
    const r=rowsFor([{slug:'a',cps:1,done:0,target:'2026-11-24'}]);
    const ctx=fakeContext(tablesFrom(r,{concepts:[...nodes,{...nodes[2],id:'someone-else',user_id:'not-the-owner'}]}),[],{project:true});
    const first=JSON.parse(await readAtlasWorker(ctx,{id:'concepts',limit:2}));
    expect(first.section).toBe('concepts');
    expect(first.items.map((x:any)=>x.id)).toEqual(ids.slice(0,2));
    expect(first.items[0].content_hash).toBe(contentHash(nodes[0]));
    expect(first.items[0].user_id).toBeUndefined();
    expect(first.nextCursor).toBe('concepts:2');
    const second=JSON.parse(await readAtlasWorker(ctx,{id:'concepts',cursor:first.nextCursor,limit:2}));
    expect(second.items.map((x:any)=>x.id)).toEqual([ids[2]]);
    expect(second.nextCursor).toBeNull();
  });
  it('returns prerequisites and approved typed-technique tags as advisory only',async()=>{
    const r=rowsFor([{slug:'a',cps:1,done:0,target:'2026-11-24'}]);
    const ctx=fakeContext(tablesFrom(r,{
      concepts:nodes,
      concept_links:[{from_id:ids[0],to_id:ids[1],kind:'prereq'}],
      atlas_links:[{id:'link-a',from_id:ids[1],to_id:ids[2],kind:'uses_technique',status:'approved'},
                   {id:'link-b',from_id:ids[1],to_id:ids[0],kind:'uses_technique',status:'proposed'}]
    }),[],{project:true});
    const answer=JSON.parse(await readAtlasTagSuggestions(ctx,{id:ids[1]}));
    expect(answer.advisoryOnly).toBe(true);
    expect(answer.byFacet.use).toEqual([
      {concept_id:ids[0],facet:'use',role:'required',demand:-1},
      {concept_id:ids[2],facet:'select',role:'required',demand:0}
    ]);
    await expect(readAtlasTagSuggestions(ctx,{id:'bad'})).rejects.toThrow('UUID');
    await expect(readAtlasTagSuggestions(ctx,{id:'11111111-1111-4111-8111-111111111120'})).rejects.toThrow('not found');
  });
});
describe('aliases in Atlas V3 model',()=>{
  it('add one shared component but do not duplicate an approved equivalent relation',()=>{
    const r=rowsFor([{slug:'a',cps:2,done:0,target:'2026-11-24'}]);
    const [a,b]=r.concepts;
    r.aliases=[{id:'alias-one',concept_a:a.id,concept_b:b.id}];
    const first=factsForAtlas(r);
    expect(first.links).toEqual([{id:'alias:alias-one',from_id:a.id,to_id:b.id,kind:'equivalent',status:'approved'}]);
    r.atlasLinks=[{id:'typed-one',from_id:a.id,to_id:b.id,kind:'equivalent',status:'approved'}];
    const second=factsForAtlas(r);
    expect(second.links).toEqual(r.atlasLinks);
  });
});
