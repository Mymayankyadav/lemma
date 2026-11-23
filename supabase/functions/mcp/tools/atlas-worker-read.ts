// Read-only, bounded knowledge-graph inventory for externally scheduled ChatGPT/Claude MCP workers.
// No LLM runs in the Edge Function; the connected assistant curates proposals.
import type {Context} from '../db.ts';
import {defaultTags} from '../../_shared/adaptive/links.ts';
import {FACETS} from '../../_shared/adaptive/kc.ts';

const SOURCES={
  subjects:{table:'subjects',fields:'id,name',order:['id']},
  projects:{table:'projects',fields:'id,subject_id,slug,title,status,system,version',order:['id']},
  concepts:{table:'concepts',fields:'id,subject_id,name,slug,blurb,level,kind,parent_id,family_id,version,updated_at,content_hash',order:['id']},
  concept_links:{table:'concept_links',fields:'from_id,to_id,kind',order:['from_id','to_id']},
  atlas_links:{table:'atlas_links',fields:'id,from_id,to_id,kind,status,origin,confidence,rationale,from_hash,to_hash,version,updated_at',order:['id']},
  concept_aliases:{table:'concept_aliases',fields:'id,concept_a,concept_b,origin,version',order:['id']},
  checkpoints:{table:'checkpoints',fields:'id,project_id,code,title,tier,status,plan_state,position,version',order:['id']},
  checkpoint_concepts:{table:'checkpoint_concepts',fields:'checkpoint_id,concept_id',order:['checkpoint_id','concept_id']}
} as const;
type SourceName=keyof typeof SOURCES;

export const atlasWorkerSections=Object.keys(SOURCES) as SourceName[];

export function parseWorkerPage(a:{id?:string;limit?:number;cursor?:string}):{section:SourceName;limit:number;offset:number}{
  const section=a.id??'concepts';
  if(!Object.prototype.hasOwnProperty.call(SOURCES,section))throw Error('Unknown Atlas worker section: '+section);
  const limit=a.limit??25;
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('Atlas worker page limit must be 1..50');
  const cursor=a.cursor??null;
  let offset=0;
  if(cursor!==null){
    if(typeof cursor!=='string'||!cursor.startsWith(section+':')||
       !/^[0-9]{1,7}$/.test(cursor.slice(section.length+1)))throw Error('Atlas worker cursor does not match section');
    offset=Number(cursor.slice(section.length+1));
    if(offset>1000000)throw Error('Atlas worker cursor limit exceeded');
  }
  return {section:section as SourceName,limit,offset};
}
export async function readAtlasWorker(c:Context,a:{id?:string;limit?:number;cursor?:string;project?:string;status?:string}):Promise<string>{
  if(!c.userId)throw Error('Authenticated owner required');
  if(a.project!==undefined||a.status!==undefined)throw Error('Atlas worker pages are owner-scoped; select a section, not a project/status');
  const {section,limit,offset}=parseWorkerPage(a),def=SOURCES[section];
  let q:any=c.db.from(def.table).select(def.fields).eq('user_id',c.userId);
  for(const field of def.order)q=q.order(field,{ascending:true});
  const {data,error}=await q.range(offset,offset+limit);
  if(error)throw Error(error.message);
  if(!Array.isArray(data)||data.length>limit+1)throw Error('Invalid Atlas worker read');
  const more=data.length>limit;
  const items=more?data.slice(0,limit):data;
  return JSON.stringify({section,items,nextCursor:more?section+':'+(offset+limit):null,
    readOnly:true,note:'Refresh concept versions and links before any approved write'});
}

/** Suggestions are never evidence. The assistant/learner must confirm before saving a structured attempt. */
export async function readAtlasTagSuggestions(c:Context,a:{id?:string}):Promise<string>{
  if(!c.userId)throw Error('Authenticated owner required');
  if(!a.id||!/^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/.test(a.id))throw Error('Concept UUID required');
  const target=await c.db.from('concepts').select('id,name').eq('user_id',c.userId).eq('id',a.id).maybeSingle();
  if(target.error)throw Error(target.error.message);
  if(!target.data)throw Error('Concept not found for owner');
  const {id,name}=target.data;
  // Count only relevant rows so the PostgREST cap cannot hide an incomplete result.
  const [old,typed]=await Promise.all([
    c.db.from('concept_links').select('from_id,to_id,kind',{count:'exact'})
      .eq('user_id',c.userId).eq('kind','prereq').eq('to_id',id).limit(500),
    c.db.from('atlas_links').select('id,from_id,to_id,kind,status',{count:'exact'})
      .eq('user_id',c.userId).eq('status','approved')
      .or(`and(kind.eq.uses_technique,from_id.eq.${id}),and(kind.eq.part_of,to_id.eq.${id})`).limit(1000)
  ]);
  if(old.error||typed.error)throw Error((old.error??typed.error).message);
  const prerequisites=old.data??[],typedLinks=typed.data??[];
  if(old.count!==prerequisites.length||typed.count!==typedLinks.length)throw Error('Too many links for a complete tag suggestion; inspect Atlas graph pages');
  const links=[...prerequisites.map((l:any)=>({...l,id:'legacy:'+l.from_id+':'+l.to_id})),...typedLinks];
  const byFacet=Object.fromEntries(FACETS.map(f=>[f,defaultTags(id,f,[],links)]));
  return JSON.stringify({concept:{id,name},byFacet,advisoryOnly:true,
    warning:'Do not infer successful performance from a link. Confirm the relevant concept tags, stages, cues, and results with the learner.'});
}
