// A tiny in-memory stand-in for the Supabase client: enough of the query builder for the MCP read paths.
import type {Context} from '../../../supabase/functions/mcp/db';
import type {Rows} from '../../../supabase/functions/_shared/adaptive/facts';
export const OWNER='11111111-1111-4111-8111-111111111111';
export function fakeContext(tables:Record<string,any[]>,writes:{table:string;op:string;values:any}[]=[]):Context{
  const rows=(t:string)=>(tables[t]??[]).map(r=>({user_id:OWNER,...r}));
  const from=(table:string)=>{
    let data=rows(table);let single=false,maybe=false;
    const q:any={
      select:()=>q,eq:(k:string,v:any)=>{data=data.filter(r=>r[k]===v);return q},neq:(k:string,v:any)=>{data=data.filter(r=>r[k]!==v);return q},
      is:(k:string,v:any)=>{data=data.filter(r=>(r[k]??null)===v);return q},gte:(k:string,v:any)=>{data=data.filter(r=>String(r[k])>=String(v));return q},
      in:(k:string,vs:any[])=>{data=data.filter(r=>vs.includes(r[k]));return q},order:(k:string,o?:{ascending?:boolean})=>{data=[...data].sort((a,b)=>(a[k]>b[k]?1:a[k]<b[k]?-1:0)*(o?.ascending===false?-1:1));return q},
      limit:(n:number)=>{data=data.slice(0,n);return q},range:(a:number,b:number)=>{data=data.slice(a,b+1);return q},
      maybeSingle:()=>{maybe=true;return q},single:()=>{single=true;return q},
      insert:(v:any)=>{writes.push({table,op:'insert',values:v});return q},upsert:(v:any)=>{writes.push({table,op:'upsert',values:v});return q},delete:()=>{writes.push({table,op:'delete',values:null});return q},
      then:(res:any,rej:any)=>Promise.resolve({data:single||maybe?(data[0]??null):data,error:null}).then(res,rej)
    };
    return q;
  };
  return {userId:OWNER,db:{from,rpc:async()=>({data:null,error:null})} as any} as Context;
}
export function tablesFrom(r:Rows,extra:Record<string,any[]>={}):Record<string,any[]>{
  return {settings:[{...r.settings,connector_last_client:'claude',master_prompt:null,tutor_rules:null}],projects:r.projects.map((p:any)=>({style:'socratic',next_session_number:5,last_activity_at:'2026-11-16T10:00:00Z',system:false,pinned:false,...p})),
    checkpoints:r.checkpoints.map((c:any)=>({objective:'Prove the main result',criterion:'Prove it unaided',pages:null,source_id:null,...c})),
    checkpoint_prereqs:r.prereqs,checkpoint_concepts:r.cpConcepts,concepts:r.concepts,concept_links:r.conceptLinks,
    evidence:r.evidence,misconceptions:r.misconceptions,recheck_decisions:r.decisions,plan_baselines:r.baselines,capacity_overrides:r.overrides,
    sessions:r.sessions.map((s:any)=>({number:1,goal:'g',style:'socratic',last_activity_at:'2026-11-16T12:00:00Z',summary:'Covered continuity',resume_step:1,...s})),
    items:r.items??[],assumptions:r.assumptions??[],concept_aliases:r.aliases??[],scheduler_runs:r.frozen??[],study_intervals:r.intervals,calendar_blocks:r.busy,v_due_cards:[],cards:[],notes:[],proposals:[],card_comments:[],reviews:[],diagnostics:[],sources:[],styles:[{key:'socratic',name:'Socratic',instructions:'Ask, do not tell.'}],
    ...extra};
}
