import {Context,scoped,all,insert,update,rpc} from '../db.ts';
import {project,checkpoint,session,source} from '../resolve.ts';
import {settings} from '../packet.ts';
import {slug,cut} from '../text.ts';
import {studyClock,studyDayBounds} from '../../_shared/calendar.ts';
import FSRS from '../../_shared/fsrs.js';
const allowed:Record<string,string[]|string>={
 projects:'title slug goal style status subject prompt',checkpoints:'code title objective criterion steps pages book prereqs ideas status current_step recheck_prompt recheck_due needs_revisit after',
 sessions:'goal style checkpoint state goal_met summary resume_question resume_note resume_step minutes',notes:'front back type kind tags checkpoint idea page status due',card_comments:'body status',
 concepts:'name blurb subject prereqs related',subjects:'name glyph hue',styles:'name instructions',sources:'title short',settings:'desired_retention new_per_day reviews_per_day learn_steps relearn_steps rollover_hour default_style tutor_rules mix_decks preferred_chat master_prompt time_zone'
};
const enqueue=(c:Context,table:string,where:any,values:any)=>c.batch!.push({op:'update',table,where,values});
async function find(c:Context,table:string,key:string,value:any){const {data,error}=await scoped(c,table).eq(key,value).maybeSingle();if(error)throw Error(error.message);if(!data)throw Error('No '+table+' '+value);return data;}
export async function target(c:Context,a:any):Promise<{table:string;row:any;p?:any}>{
 const t=a.target;
 if(t==='settings')return {table:'settings',row:await settings(c)};
 if(/^N\d+$/i.test(t))return {table:'notes',row:await find(c,'notes','no',Number(t.slice(1)))};
 if(/^#\d+$/.test(t))return {table:'card_comments',row:await find(c,'card_comments','no',Number(t.slice(1)))};
 if(/^P\d+$/i.test(t))return {table:'proposals',row:await find(c,'proposals','no',Number(t.slice(1)))};
 const named=t.match(/^(idea|subject|style|book):(.+)$/);
 if(named){const [,kind,name]=named;if(kind==='book'){const p=await project(c,a.project);return {table:'sources',row:await source(c,p,name),p};}
 const table=({idea:'concepts',subject:'subjects',style:'styles'} as Record<string,string>)[kind]!,key=kind==='style'?'key':'name';return {table,row:await find(c,table,key,name)};}
 if(/^CP/i.test(t)){const p=await project(c,a.project);return {table:'checkpoints',row:await checkpoint(c,p,t),p};}
 if(/^S\d+$/i.test(t)){const p=await project(c,a.project);return {table:'sessions',row:await session(c,p,t),p};}
 return {table:'projects',row:await project(c,t)};
}
function pk(table:string,row:any){return table==='settings'?{user_id:row.user_id}:table==='styles'?{user_id:row.user_id,key:row.key}:{id:row.id};}
async function idea(c:Context,name:string,subject_id:string){
 const matches=(x:any)=>x.user_id===c.userId&&x.subject_id===subject_id&&x.name.toLowerCase()===name.toLowerCase();
 // Queued inserts have UUIDs already, but are not visible to database reads yet.
 const pending=c.batch?.find(x=>x.op==='insert'&&x.table==='concepts'&&matches(x.values));
 if(pending)return pending.values;
 const existing=(await all(c,'concepts')).find(matches);
 return existing||insert(c,'concepts',{subject_id,slug:slug(name),name});
}
async function ideaLinks(c:Context,row:any,fields:any,replace:boolean){
 const kinds={prereqs:'prereq',related:'related'} as const;
 const existing=(await all(c,'concept_links')).filter(x=>x.to_id===row.id);
 const replacing=new Set(Object.entries(kinds).filter(([field])=>replace&&field in fields).map(([,kind])=>kind));
 const linked=new Map<string,string>();
 for(const x of existing){
  if(replacing.has(x.kind))c.batch!.push({op:'delete',table:'concept_links',where:{from_id:x.from_id,to_id:x.to_id}});
  else linked.set(x.from_id,x.kind);
 }
 for(const [field,kind] of Object.entries(kinds))for(const name of fields[field]||[]){
  const other=await idea(c,name,row.subject_id);
  if(other.id===row.id)throw Error('An idea cannot link to itself');
  const previous=linked.get(other.id);
  if(previous&&previous!==kind)throw Error('Idea "'+name+'" cannot be both prerequisite and related; clear the previous relationship explicitly');
  if(previous)continue;
  linked.set(other.id,kind);
  c.batch!.push({op:'insert',table:'concept_links',values:{from_id:other.id,to_id:row.id,kind}});
 }
}
export async function setPrompt(c:Context,a:any){const global=a.scope==='all',r=global?await settings(c):await project(c,a.scope),key=global?'master_prompt':'prompt';
 const value=a.mode==='clear'?null:a.mode==='replace'?a.text:[r[key],a.text].filter(Boolean).join('\n');
 if((value?.length||0)>(global?2000:1000))throw Error('Prompt exceeds '+(global?2000:1000)+' characters');
 enqueue(c,global?'settings':'projects',global?{user_id:c.userId}:{id:r.id},{[key]:value});return 'saved for '+(global?'all chats':r.slug)+' ('+(value?.length||0)+' chars)';}
export async function history(c:Context,a:any){const fetched=await scoped(c,'v_history').order('no',{ascending:false}).limit(1000);if(fetched.error)throw Error(fetched.error.message);let acts:any[]=(fetched.data||[]).filter((x:any)=>x.tool!=='heartbeat');if(a.project){const p=await project(c,a.project);const changes=await c.db.from('action_changes').select('action_no,old,new').in('action_no',acts.map(x=>x.no));if(changes.error)throw Error(changes.error.message);const ids=new Set((changes.data||[]).filter((x:any)=>[x.old,x.new].some(v=>v?.project_id===p.id||v?.id===p.id)).map((x:any)=>x.action_no));acts=acts.filter(x=>ids.has(x.no));}
 const ordered=acts.sort((a,b)=>b.no-a.no).slice(0,a.limit||10),lines:string[]=[];
 for(let i=0;i<ordered.length;i++){const x=ordered[i];if(x.source==='app'&&['record_review','grade'].includes(x.tool)&&!x.undone_by){let end=i;while(end+1<ordered.length&&ordered[end+1].source==='app'&&['record_review','grade'].includes(ordered[end+1].tool)&&!ordered[end+1].undone_by&&ordered[end+1].created_at.slice(0,10)===x.created_at.slice(0,10))end++;if(end>i){lines.push('A'+ordered[end].no+'–A'+x.no+' app '+(end-i+1)+' reviews');i=end;continue;}}
 lines.push('A'+x.no+' '+x.created_at.slice(0,16).replace('T',' ')+' '+x.source+' '+(x.tool||'app')+': '+x.summary+(x.undone_by?' (undone by A'+x.undone_by+')':''));}
 return lines.join('\n')||'No changes.';}
export async function undo(c:Context,a:any){await rpc(c,'undo_action',{p_no:a.action,p_force:!!a.force});return 'undid A'+a.action;}
export async function edit(c:Context,a:any){const {table,row,p:given}=await target(c,a);if(!row)throw Error('Target not found');const valid=String(allowed[table]||'').split(' '),patch={...a.set};
 for(const k of Object.keys(patch))if(!valid.includes(k))throw Error('Valid fields: '+valid.join(', '));
 if(!Object.keys(patch).length)throw Error('Provide fields to change');
 const p=given||(row.project_id?await find(c,'projects','id',row.project_id):null);
 if(table==='notes'&&patch.status!==undefined&&!['active','suspended'].includes(patch.status))throw Error('Card status must be active or suspended');
 if(patch.subject!==undefined){const sub=await find(c,'subjects','name',patch.subject);patch.subject_id=sub.id;delete patch.subject;}
 if(patch.checkpoint!==undefined){patch.checkpoint_id=patch.checkpoint===null?null:(await checkpoint(c,p,patch.checkpoint)).id;delete patch.checkpoint;}
 if(patch.book!==undefined){patch.source_id=patch.book===null?null:(await source(c,p,patch.book)).id;delete patch.book;}
 if(patch.idea!==undefined){patch.concept_id=patch.idea===null?null:(await idea(c,patch.idea,p.subject_id)).id;delete patch.idea;}
 if(patch.page!==undefined){patch.page_label=patch.page;delete patch.page;}
 if(table==='notes'&&['front','back','type'].some(k=>k in patch)){
  const payload:any={note_no:row.no};for(const k of ['front','back','type'])if(k in patch){payload[k]=patch[k];delete patch[k];}
  const proposal=await insert(c,'proposals',{project_id:row.project_id,kind:'card_edit',origin:'other',payload});await rpc(c,'approve_proposal',{p_id:proposal.id});
 }
 if(patch.due!==undefined){const due=patch.due==='now'?new Date().toISOString():new Date(patch.due).toISOString();for(const x of (await all(c,'cards')).filter(x=>x.note_id===row.id))enqueue(c,'cards',{id:x.id},{due});delete patch.due;}
 if(patch.after!==undefined){const cps=(await all(c,'checkpoints')).filter(x=>x.project_id===p.id&&x.id!==row.id).sort((a,b)=>a.position-b.position);const i=patch.after===null?-1:cps.findIndex(x=>x.code===patch.after);if(patch.after!==null&&i<0)throw Error('Unknown insertion point');patch.position=i<0?(cps[0]?.position||10)-10:(cps[i].position+(cps[i+1]?.position||cps[i].position+20))/2;delete patch.after;}
 for(const [field,join,left,right] of [['prereqs','checkpoint_prereqs','checkpoint_id','prereq_id'],['ideas','checkpoint_concepts','checkpoint_id','concept_id']] as const){if(table==='checkpoints'&&field in patch){for(const x of (await all(c,join)).filter(x=>x[left]===row.id))c.batch!.push({op:'delete',table:join,where:{[left]:x[left],[right]:x[right]}});const linked=new Set<string>();for(const name of patch[field]){const r=field==='prereqs'?await checkpoint(c,p,name):await idea(c,name,p.subject_id);if(linked.has(r.id))continue;linked.add(r.id);const vals:any={[left]:row.id,[right]:r.id};c.batch!.push({op:'insert',table:join,values:vals});}delete patch[field];}}
 if(table==='concepts'){await ideaLinks(c,row,patch,true);delete patch.prereqs;delete patch.related;}
 if(Object.keys(patch).length)enqueue(c,table,pk(table,row),patch);
 return 'edited '+a.target+': '+Object.keys(a.set).join(', ');
}
export async function add(c:Context,a:any){const f={...a.fields};const valid=String(allowed[({checkpoint:'checkpoints',card:'notes',subject:'subjects',idea:'concepts',style:'styles',comment:'card_comments',book:'sources'} as Record<string,string>)[a.kind]]||'').split(' ').concat(['card','key']);for(const k of Object.keys(f))if(!valid.includes(k))throw Error('Valid fields: '+valid.join(', '));const p=['checkpoint','card','book'].includes(a.kind)?await project(c,a.project):null;
 if(a.kind==='card'){
  const cp=f.checkpoint?await checkpoint(c,p,f.checkpoint):null,concept=f.idea?await idea(c,f.idea,p.subject_id):null;
  const n=await insert(c,'notes',{project_id:p.id,front:f.front,back:f.back||'',type:f.type||'basic',kind:f.kind||'other',tags:f.tags||[],status:f.status||'active',checkpoint_id:cp?.id||null,concept_id:concept?.id||null,page_label:f.page||null,origin:'other'});
  await rpc(c,'reconcile_cards',{p_note:n.id});if(f.due!==undefined)enqueue(c,'cards',{note_id:n.id},{due:f.due==='now'?new Date().toISOString():new Date(f.due).toISOString()});return 'added card';
 }
 if(a.kind==='checkpoint'){
  const cps=await all(c,'checkpoints');if(!f.code){if(f.after){const base=f.after.match(/^CP[0-9]+/)?.[0];if(!base)throw Error('Invalid insertion point');for(let k=97;k<=122;k++){const code=base+String.fromCharCode(k);if(!cps.some(x=>x.project_id===p.id&&x.code===code)){f.code=code;break;}}}else f.code='CP'+(1+Math.max(0,...cps.filter(x=>x.project_id===p.id).map(x=>Number(x.code.match(/^CP([0-9]+)/)?.[1]||0))));}
  if(!f.code)throw Error('No free checkpoint code');const prop=await insert(c,'proposals',{project_id:p.id,kind:'plan_change',origin:'other',payload:{ops:[{...f,op:'add',concepts:f.ideas,source:f.book}]}});await rpc(c,'approve_proposal',{p_id:prop.id});
  const extra:any={};for(const k of ['status','current_step','recheck_due','needs_revisit'])if(k in f)extra[k]=f[k];if(Object.keys(extra).length)enqueue(c,'checkpoints',{project_id:p.id,code:f.code},extra);return 'added '+f.code;
 }
 if(a.kind==='subject'){for(const k of Object.keys(f))if(!['name','glyph','hue'].includes(k))throw Error('Valid fields: name, glyph, hue');await insert(c,'subjects',{glyph:f.name?.slice(0,1)||'M',hue:'amber',...f});}
 else if(a.kind==='idea'){const sub=await find(c,'subjects','name',f.subject);const row=await idea(c,f.name,sub.id);if(f.blurb!==undefined)enqueue(c,'concepts',{id:row.id},{blurb:f.blurb});await ideaLinks(c,row,f,false);}
 else if(a.kind==='style'){const key=f.key||slug(f.name).replace(/-/g,'_').slice(0,20);if(!/^[a-z_]{2,20}$/.test(key))throw Error('Style key must contain lowercase letters or underscores');c.batch!.push({op:'insert',table:'styles',values:{user_id:c.userId,key,name:f.name,instructions:f.instructions,icon:'sparkles'}});}
 else if(a.kind==='comment'){const n=await find(c,'notes','no',Number(String(f.card).replace(/^N/i,'')));await insert(c,'card_comments',{note_id:n.id,body:f.body});}
 else if(a.kind==='book'){await insert(c,'sources',{project_id:p.id,title:f.title,short:f.short||slug(f.title).slice(0,20),filename:'attached.pdf',status:'ready',has_text:false,page_count:0});}
 else throw Error('Unknown kind');return 'added '+a.kind;
}
export async function remove(c:Context,a:any){const {table,row}=await target(c,a);if(['settings'].includes(table))throw Error('Settings cannot be deleted');
 if(table==='subjects'){const ps=(await all(c,'projects')).filter(x=>x.subject_id===row.id);if(ps.length)throw Error('Subject used by '+ps.map(x=>x.slug).join(', '));}
 if(table==='styles'){const ps=(await all(c,'projects')).filter(x=>x.style===row.key);if(ps.length)throw Error('Style used by '+ps.map(x=>x.slug).join(', '));}
 const relations=[['projects','sources','project_id'],['projects','checkpoints','project_id'],['projects','sessions','project_id'],['projects','misconceptions','project_id'],['projects','notes','project_id'],['projects','proposals','project_id'],['projects','diagnostics','project_id'],['subjects','concepts','subject_id'],['sources','source_pages','source_id'],['checkpoints','checkpoint_prereqs','checkpoint_id'],['checkpoints','checkpoint_prereqs','prereq_id'],['checkpoints','checkpoint_concepts','checkpoint_id'],['sessions','session_events','session_id'],['notes','cards','note_id'],['notes','card_comments','note_id'],['cards','reviews','card_id'],['concepts','concept_links','from_id'],['concepts','concept_links','to_id'],['concepts','checkpoint_concepts','concept_id']];
 const names=[...new Set(relations.flatMap(x=>x.slice(0,2)))];const snapshots=new Map(await Promise.all(names.map(async t=>[t,await all(c,t)] as const)));const removed=new Map<string,any[]>([[table,[row]]]);let changed=true;
 while(changed){changed=false;for(const [parent,child,fk] of relations){const parents=removed.get(parent)||[],current=removed.get(child)||[];for(const r of snapshots.get(child)||[])if(parents.some(x=>x.id===r[fk])&&!current.includes(r)){current.push(r);changed=true;}removed.set(child,current);}}
 const counts=[...removed].filter(([t,rows])=>t!==table&&rows.length).map(([t,rows])=>rows.length+' '+t);
 if(!a.confirm)return a.target+': '+(counts.join(', ')||'1 '+table)+'. Confirm before deleting.';
 c.batch!.push({op:'delete',table,where:pk(table,row)});return 'deleted '+a.target+(counts.length?' and '+counts.join(', '):'');}
export async function review(c:Context,a:any){const p=a.project?await project(c,a.project):null,s=await settings(c),today=new Date();
 const ps=await all(c,'projects'),notes=(await all(c,'notes')).filter(x=>x.status==='active'&&ps.some(p=>p.id===x.project_id)&&(!p||x.project_id===p.id));const nm=new Map(notes.map(x=>[x.id,x]));
 const cards=(await all(c,'cards')).filter(x=>nm.has(x.note_id)&&(x.state!==0?Date.parse(x.due)<studyDayBounds(+today,s.time_zone,s.rollover_hour).end:a.new!==false));
 const {day}=await import('../derive.ts');const logs=(await all(c,'reviews')).filter(x=>!x.undone_at&&day(s,x.reviewed_at)===day(s));const newLeft=Math.max(0,s.new_per_day-logs.filter(x=>x.state_before===0).length),left=Math.max(0,s.reviews_per_day-logs.length);
 const seenNotes=new Set<string>();const priority=(x:any)=>[1,3].includes(x.state)?0:x.state===2?1:2;
 const eligible=cards.sort((a,b)=>priority(a)-priority(b)||Date.parse(a.due)-Date.parse(b.due)||nm.get(a.note_id).no-nm.get(b.note_id).no||a.ord-b.ord).filter(x=>seenNotes.has(x.note_id)?false:(seenNotes.add(x.note_id),true));
 const learning=eligible.filter(x=>[1,3].includes(x.state)),due=eligible.filter(x=>x.state===2),fresh=eligible.filter(x=>x.state===0).slice(0,newLeft);const queue:any[]=[];let since=0,last='',ratio=Math.max(1,Math.ceil(due.length/(fresh.length+1)));
 const key=(x:any)=>{const n=nm.get(x.note_id);return n.project_id+':'+(n.checkpoint_id||'');};
 const take=(list:any[])=>{let i=s.mix_decks?list.findIndex(x=>key(x)!==last):0;if(i<0)i=0;const [x]=list.splice(i,1);if(x){last=key(x);queue.push(x);}return x;};
 while(queue.length<left&&(learning.length||due.length||fresh.length)){
  if(learning.some(x=>Date.parse(x.due)<=+today)){const ready=learning.findIndex(x=>Date.parse(x.due)<=+today);const [x]=learning.splice(ready,1);queue.push(x);last=key(x);continue;}if(!due.length&&!fresh.length){const i=learning.findIndex(x=>Date.parse(x.due)<=+today+s.learn_ahead_minutes*60000);if(i<0)break;queue.push(learning.splice(i,1)[0]);continue;}let pickNew=!!fresh.length&&(!due.length||since>=ratio);
  if(s.mix_decks&&last){const pref=pickNew?fresh:due,alt=pickNew?due:fresh;if(!pref.some(x=>key(x)!==last)&&alt.some(x=>key(x)!==last))pickNew=!pickNew;}
  take(pickNew?fresh:due);since=pickNew?0:since+1;
 }
 return queue.length+' due.\n'+queue.slice(0,a.count||5).map(x=>{const n=nm.get(x.note_id);return 'N'+n.no+'.'+x.ord+' Front: '+n.front+' / Back: '+n.back;}).join('\n');}
export async function grade(c:Context,a:any){const s=await settings(c),notes=await all(c,'notes'),cards=await all(c,'cards'),out:string[]=[];const seen=new Set<string>();
 for(const ans of a.answers){if(seen.has(ans.card))throw Error('Duplicate card');seen.add(ans.card);const m=ans.card.match(/^N(\d+)\.(\d+)$/i);if(!m)throw Error('Use N7.1');const n=notes.find(x=>x.no===Number(m[1])),card=cards.find(x=>x.note_id===n?.id&&x.ord===Number(m[2]));if(!card||n.status!=='active')throw Error('Card not found');
 const now=Date.now(),rating=['again','hard','good','easy'].indexOf(ans.rating)+1;const cfg={w:s.fsrs_weights||FSRS.DEFAULT_W,retention:s.desired_retention,maxIvl:s.max_interval_days,learn:FSRS.parseSteps(s.learn_steps),relearn:FSRS.parseSteps(s.relearn_steps),fuzz:s.fuzz,loadBalance:s.load_balance};
 const x=(FSRS.preview({st:card.state,due:Date.parse(card.due),s:card.stability,d:card.difficulty,last:card.last_review?Date.parse(card.last_review):0,step:card.step,reps:card.reps,lapses:card.lapses},now,cfg,{clock:studyClock(s.rollover_hour,s.time_zone)}) as any)[rating];
 const v=x.card,next={state:v.st,due:new Date(v.due).toISOString(),stability:v.s,difficulty:v.d,last_review:new Date(v.last).toISOString(),step:v.step,reps:v.reps,lapses:v.lapses};
 await rpc(c,'record_review',{p_card:card.id,p_rating:rating,p_confidence:ans.confidence||null,p_duration_ms:0,p_next:next,expected:{reps:card.reps,due:card.due}});out.push(ans.card+' in '+FSRS.formatIvl(x.delay));}
 return 'graded '+out.length+': next '+out.join(', ');
}
