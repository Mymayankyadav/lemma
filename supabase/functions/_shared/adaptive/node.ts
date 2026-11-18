// get(what=node): the Atlas as memory (spec §11). Card ≤ 100 tokens, trail ≤ 600, digest ≤ 300, raw ≤ 1500 per call (paged).
// Pure: derived from facts at read time; nothing here is stored. Every digest line and raw row names the evidence it came from (I9).
import type {State,Rows} from './facts.ts';
import {buildDigest,renderDigest,type EvidenceFact} from './digest.ts';
import {retrievabilityOf,LEVELS,type Level} from './recheck.ts';
import {brier,buckets,weeklyReport,scribeAudit} from './calibration.ts';

export type NodeArgs={id?:string;depth?:'card'|'digest'|'raw';trail?:boolean;cursor?:string;limit?:number};
const tok=(t:string)=>Math.ceil(t.length/3);
const trim=(lines:string[],budget:number)=>{const out:string[]=[];let used=0;for(const l of lines){const t=tok(l)+1;if(used+t>budget)break;used+=t;out.push(l)}return out};
export function findConcept(rows:Rows,id:string|undefined):{concept:any}|{error:string}{
  if(!id)return {error:'Provide id: a concept slug or id'};
  const q=String(id).toLowerCase().trim();
  const hits=rows.concepts.filter((c:any)=>c.id===id||(c.slug&&c.slug===q)||String(c.name).toLowerCase()===q);
  if(hits.length===1)return {concept:hits[0]};
  if(!hits.length)return {error:'No concept "'+id+'"'};
  return {error:'Several concepts match "'+id+'": '+hits.slice(0,5).map((c:any)=>c.id.slice(0,8)+' '+c.name).join('; ')+'. Use the id.'};
}
// Before the Atlas v3 cutover a node card counts the live evidence per level (passes/attempts); it carries no model
// estimate (the Beta model is gone, 07 Acceptance 5). A migrated owner reads Atlas v3 cards instead (renderAtlasRead).
const SHORT:Record<Level,string>={recall:'R',use:'Us',understand:'Un',transfer:'T'};
const classEvidence=(s:State,cls:string):EvidenceFact[]=>s.evidenceFacts.filter(e=>e.concept_id&&s.classOf(e.concept_id)===cls);
const passShare=(evs:EvidenceFact[])=>evs.length?evs.reduce((a,e)=>a+(e.outcome==='pass'?1:e.outcome==='partial'?0.5:0),0)/evs.length:null;
function cardOf(s:State,rows:Rows,concept:any):string{
  const cls=s.classOf(concept.id),evs=classEvidence(s,cls);
  const R:Partial<Record<Level,number>>={};
  for(const r of s.rechecks.rechecks)if(r.class_id===cls&&r.state==='open')R[r.level]=retrievabilityOf(r,s.today);
  const open=s.rechecks.rechecks.filter(r=>r.class_id===cls&&(r.state==='open'||r.state==='escalated')).map(r=>'recheck-'+r.level.slice(0,2));
  const mis=(rows.misconceptions??[]).filter((m:any)=>m.concept_id&&s.classOf(m.concept_id)===cls&&!m.resolved_at).map((m:any)=>String(m.label??'misconception').slice(0,24).replace(/\s+/g,'-'));
  const assume=(rows.assumptions??[]).filter((a:any)=>!s.withdrawn.includes(String(a.id))&&s.classOf(a.concept_id)===cls).map((a:any)=>a.level.slice(0,2)+(a.mean_at!=null?'~'+Number(a.mean_at).toFixed(1).replace(/^0/,''):''));
  const seen=evs.map(e=>e.day).sort().pop()??null;
  const levels=LEVELS.map(l=>{const at=evs.filter(e=>e.level===l),pass=at.filter(e=>e.outcome==='pass').length;return SHORT[l]+(at.length?pass+'/'+at.length:'-')+(R[l]!=null?'~'+R[l]!.toFixed(2).replace(/^0/,''):'')}).join(' ');
  return String(concept.name).slice(0,30)+' '+levels+' gaps:['+[...mis,...open].slice(0,3).join(',')+'] assume:['+assume.slice(0,2).join(',')+']'+(seen?' seen:'+seen:'');
}
export const cardFor=(s:State,rows:Rows,conceptId:string)=>{const c=rows.concepts.find((x:any)=>x.id===conceptId);return c?cardOf(s,rows,c):''};
function digestOf(s:State,rows:Rows,cls:string,maxTokens:number){
  const no=new Map<string,number>(rows.sessions.map((x:any)=>[x.id,x.number]));
  const evs=(rows.evidence??[]).filter((e:any)=>!e.voided_at&&e.concept_id&&s.classOf(e.concept_id)===cls).map((e:any)=>({
    id:String(e.id),at:Date.parse(e.occurred_at),day:String(e.occurred_at).slice(0,10),concept_id:e.concept_id,level:e.level,outcome:e.outcome,hint_level:e.hint_level,novelty:e.novelty,session_no:no.get(e.session_id)??null}));
  return buildDigest(evs as any,maxTokens);
}
export function renderNode(s:State,rows:Rows,a:NodeArgs):string{
  const f=findConcept(rows,a.id);if('error' in f)return f.error;
  const c=f.concept,cls=s.classOf(c.id),depth=a.depth??'card';
  const out=['NODE '+cardOf(s,rows,c)];
  // A system carries a roll-up of its planets: the weakest first, so the tutor drills down only where a gap points.
  const kids=rows.concepts.filter((x:any)=>x.parent_id===c.id);
  if(kids.length){
    const scored=kids.map((k:any)=>({name:k.name,m:passShare(classEvidence(s,s.classOf(k.id)))})).filter((x):x is {name:string;m:number}=>x.m!=null).sort((p,q)=>p.m-q.m);
    out.push('PLANETS '+kids.length+(scored.length?'; weakest: '+scored.slice(0,3).map(x=>x.name.slice(0,24)+' '+x.m.toFixed(2).replace(/^0/,'')).join(', '):'; none examined yet'));
  }
  if(depth==='digest'||depth==='raw'){const d=digestOf(s,rows,cls,300);out.push('DIGEST',...(d.length?d.map(l=>l.text):['(no evidence yet)']))}
  if(depth==='raw'){
    const no=new Map<string,number>(rows.sessions.map((x:any)=>[x.id,x.number]));
    const all=(rows.evidence??[]).filter((e:any)=>e.concept_id&&s.classOf(e.concept_id)===cls).sort((x:any,y:any)=>y.id-x.id);
    const from=Number(a.cursor||0)||0;
    const lines=all.slice(from).map((e:any)=>'ev:'+e.id+' '+String(e.occurred_at).slice(0,10)+' S'+(no.get(e.session_id)??'?')+' '+e.level+' '+e.outcome+(e.hint_level?' hint'+e.hint_level:'')+(e.voided_at?' (voided)':'')+' '+e.origin);
    const shown=trim(lines,1500);
    out.push('RAW',...shown);
    if(shown.length<lines.length)out.push('more: cursor='+(from+shown.length));
  }
  if(a.trail){
    const links=rows.conceptLinks.filter((l:any)=>l.kind==='prereq');
    const pre=links.filter((l:any)=>l.to_id===c.id).map((l:any)=>l.from_id),dep=links.filter((l:any)=>l.from_id===c.id).map((l:any)=>l.to_id);
    const lines:string[]=[];
    for(const [tag,ids] of [['PRE',pre],['NEXT',dep]] as [string,string[]][])for(const id of [...new Set(ids)].sort()){
      const x=rows.concepts.find((y:any)=>y.id===id);if(!x)continue;
      lines.push(tag+' '+cardOf(s,rows,x));
      for(const d of digestOf(s,rows,s.classOf(id),80).slice(0,2))lines.push('  '+d.text);
    }
    out.push(...trim(lines,600));
  }
  return out.join('\n');
}
/** get(what=calibration) before the cutover: the Beta predictions are gone, so there is nothing to calibrate until
 *  Atlas v3 is active (a migrated owner gets the Atlas v3 calibration through renderAtlasRead). */
export function renderCalibration(_s:State,audit?:{agree:boolean}[]):string{
  return weeklyReport({pairs:[],uncalibratedItems:0,audit:audit?scribeAudit(audit):undefined})+'\n(predictions start with Atlas v3 after the cutover)';
}
export {brier,buckets};
