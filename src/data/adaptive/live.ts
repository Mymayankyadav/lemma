import {liveClient} from '../live/client';
import {checked,owner,rows,type Row} from '../live/helpers';
import type {AdaptiveData} from './contract';

/** The same row selections and bounds as MCP loadRows; browser reads only, never refreshes caches. */
export async function readAdaptiveData(now=new Date()):Promise<AdaptiveData>{
 const db=liveClient(),uid=await owner(db),since=new Date(now.getTime()-3*86400000).toISOString();
 const select=(table:string,fields='*')=>{const q=db.from(table).select(fields).eq('user_id',uid);return table==='projects'?q.neq('status','archived'):q;};
 const list=async(query:PromiseLike<{data:unknown;error:unknown}>)=>checked(await query) as Row[];
 const read=async(table:string,fields='*')=>list(select(table,fields).limit(1000));
 async function dueCardsByProject():Promise<Record<string,number>>{
  try{
   const due=await list(select('v_due_cards','card_id,state,due').limit(2000));
   if(!due.length)return {};
   const [cards,notes]=await Promise.all([read('cards','id,note_id'),read('notes','id,project_id')]);
   const noteProject=new Map(notes.map(n=>[n.id,n.project_id])),cardNote=new Map(cards.map(c=>[c.id,c.note_id]));
   const dueCards:Record<string,number>={};
   for(const d of due){const p=noteProject.get(cardNote.get(d.card_id));if(p)dueCards[p]=(dueCards[p]??0)+1;}
   return dueCards;
  }catch{return {}}
 }
 const [settings,projects,checkpoints,prereqs,cpConcepts,concepts,conceptLinks,misconceptions,decisions,baselines,overrides,sessions,
  evidence,intervals,busy,dueCards,rechecks]=await Promise.all([
  select('settings').single().then(r=>checked(r) as Row),read('projects'),read('checkpoints'),read('checkpoint_prereqs'),read('checkpoint_concepts'),
  read('concepts'),read('concept_links'),read('misconceptions'),read('recheck_decisions'),read('plan_baselines'),read('capacity_overrides'),read('sessions'),
  list(select('evidence').is('voided_at',null).order('id').limit(5000)),
  list(select('study_intervals','kind,started_at,ended_at').gte('started_at',since).limit(500)),
  list(select('calendar_blocks','kind,status,starts_at,ends_at,time_zone').gte('ends_at',since).limit(500)),
  dueCardsByProject(),
  rows(db,'rechecks',uid),
 ]);
 return {rows:{settings,projects:projects.filter(p=>!p.system&&p.status!=='archived'),checkpoints,prereqs,cpConcepts,concepts,conceptLinks,
  misconceptions,decisions,baselines,overrides,sessions,evidence,intervals,busy,dueCards},rechecks:rechecks as AdaptiveData['rechecks']};
}
