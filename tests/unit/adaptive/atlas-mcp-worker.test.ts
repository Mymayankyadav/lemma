import {describe,expect,it} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {fakeContext,OWNER,tablesFrom} from './fakedb';
import {rowsFor} from './rows';
import {FACETS} from '../../../supabase/functions/_shared/adaptive/kc';
import {factsForAtlas} from '../../../supabase/functions/_shared/adaptive/atlas';
import {parseWorkerPage,readAtlasWorker,readAtlasTagSuggestions} from '../../../supabase/functions/mcp/tools/atlas-worker-read';

const ids=[
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102',
  '11111111-1111-4111-8111-111111111103'
];
const nodes=ids.map((id,i)=>({id,user_id:'11111111-1111-4111-8111-111111111111',
  subject_id:'11111111-1111-4111-8111-111111111121',name:['Group basics','Homomorphisms','Proof technique'][i],
  slug:'concept-'+i,blurb:'Mathematics '+i,content_hash:'abc0000'+i,kind:i===2?'technique':'topic',
  parent_id:null,family_id:null,level:'planet',version:1,updated_at:'2026-11-22T00:00:00Z'}));

type LinkRow={id?:string;user_id?:string;from_id:string;to_id:string;kind:string;status?:string};
const linkConcept=(i:number)=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(i).padStart(12,'0');

function tagContext(legacy:LinkRow[],typed:LinkRow[]){
  const tables:Record<string,Record<string,unknown>[]>={concepts:nodes,
    concept_links:legacy.map(row=>({user_id:OWNER,...row})),
    atlas_links:typed.map(row=>({user_id:OWNER,...row}))};
  const fetcher:typeof fetch=async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:input);
    const table=url.pathname.split('/').at(-1)!;
    const params=url.searchParams;
    let rows=tables[table].filter(row=>Array.from(params).every(([field,filter])=>
      !filter.startsWith('eq.')||String(row[field])===filter.slice(3)));
    if(params.has('or')){
      expect(params.get('or')).toBe(`(and(kind.eq.uses_technique,from_id.eq.${ids[1]}),and(kind.eq.part_of,to_id.eq.${ids[1]}))`);
      rows=rows.filter(row=>(row.kind==='uses_technique'&&row.from_id===ids[1])||
        (row.kind==='part_of'&&row.to_id===ids[1]));
    }
    const page=rows.slice(0,Math.min(Number(params.get('limit')??1000),1000));
    const count=new Headers(init?.headers).get('prefer')?.includes('count=exact')?rows.length:'*';
    return Response.json(page,{headers:{'Content-Range':`${page.length?'0-'+(page.length-1):'*'}/${count}`}});
  };
  const db=createClient('https://example.invalid','test-key',{global:{fetch:fetcher},accessToken:async()=>null});
  return {userId:OWNER,db};
}

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
    expect(first.items[0].content_hash).toBe(nodes[0].content_hash);
    expect(first.items[0].user_id).toBeUndefined();
    expect(first.nextCursor).toBe('concepts:2');
    const second=JSON.parse(await readAtlasWorker(ctx,{id:'concepts',cursor:first.nextCursor,limit:2}));
    expect(second.items.map((x:any)=>x.id)).toEqual([ids[2]]);
    expect(second.nextCursor).toBeNull();
  });
  it('finds direction-specific advisory tags beyond unrelated rows for every facet',async()=>{
    const unrelated=Array.from({length:1000},(_,i)=>({id:linkConcept(i),from_id:linkConcept(i),
      to_id:ids[2],kind:'uses_technique',status:'approved'}));
    const related=unrelated.slice(0,501).map(row=>({from_id:row.from_id,to_id:ids[1],kind:'related'}));
    const ctx=tagContext([
      ...related,{from_id:ids[0],to_id:ids[1],kind:'prereq'},
    ],[
      ...unrelated,
      {id:'technique',from_id:ids[1],to_id:ids[2],kind:'uses_technique',status:'approved'},
      {id:'part',from_id:ids[0],to_id:ids[1],kind:'part_of',status:'approved'},
      {id:'pending',from_id:ids[1],to_id:ids[0],kind:'uses_technique',status:'proposed'},
      {id:'incoming-technique',from_id:ids[2],to_id:ids[1],kind:'uses_technique',status:'approved'},
      {id:'outgoing-part',from_id:ids[1],to_id:ids[0],kind:'part_of',status:'approved'},
      {id:'foreign',from_id:ids[1],to_id:ids[0],kind:'uses_technique',status:'approved',user_id:linkConcept(2000)},
    ]);
    const answer=JSON.parse(await readAtlasTagSuggestions(ctx,{id:ids[1]}));
    expect(answer.advisoryOnly).toBe(true);
    expect(Object.keys(answer.byFacet)).toEqual(FACETS);
    for(const facet of FACETS)expect(answer.byFacet[facet]).toEqual([
      {concept_id:ids[0],facet,role:'required',demand:-1},
      {concept_id:ids[2],facet:'select',role:'required',demand:0},
      {concept_id:ids[0],facet:'execute',role:'required',demand:0},
    ]);
    await expect(readAtlasTagSuggestions(ctx,{id:'bad'})).rejects.toThrow('UUID');
    await expect(readAtlasTagSuggestions(ctx,{id:'11111111-1111-4111-8111-111111111120'})).rejects.toThrow('not found');
  });
  it('reports too many relevant links even when the API caps its response at 1,000 rows',async()=>{
    const typed=Array.from({length:1001},(_,i)=>({id:linkConcept(i),from_id:ids[1],
      to_id:linkConcept(i),kind:'uses_technique',status:'approved'}));
    const fullPage=JSON.parse(await readAtlasTagSuggestions(tagContext([],typed.slice(0,1000)),{id:ids[1]}));
    expect(fullPage.byFacet.recognise).toHaveLength(1000);
    await expect(readAtlasTagSuggestions(tagContext([],typed),{id:ids[1]})).rejects.toThrow('Too many links');
  });
});
describe('aliases in Atlas V3 model',()=>{
 it('shares one component for a transitive alias class without double-counting approved equivalent links',()=>{
  const r=rowsFor([{slug:'a',cps:3,done:0,target:'2026-11-24'}]);
  const [a,b,c]=r.concepts,canonical=[a.id,b.id,c.id].sort()[0];
  r.aliases=[{id:'alias-one',concept_a:a.id,concept_b:b.id},{id:'alias-two',concept_a:b.id,concept_b:c.id}];
  const first=factsForAtlas(r);
  expect(first.links).toHaveLength(3);
  expect(new Set(first.links!.map(x=>x.id))).toEqual(new Set(['alias-class:'+canonical]));
  expect(new Set(first.links!.flatMap(x=>[x.from_id,x.to_id]))).toEqual(new Set([a.id,b.id,c.id]));
  r.atlasLinks=[{id:'typed-one',from_id:a.id,to_id:b.id,kind:'equivalent',status:'approved'}];
  const second=factsForAtlas(r);
  expect(second.links).toHaveLength(3);
  expect(second.links?.every(x=>x.id==='alias-class:'+canonical)).toBe(true);
  r.aliases=[];
  const third=factsForAtlas(r);
  expect(third.links).toEqual(r.atlasLinks);
 });
});
