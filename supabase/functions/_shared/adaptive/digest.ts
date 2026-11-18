// Digest (spec §11.1): one line per episode, newest first, each ending with the raw rows it came from (I9).
// Built from evidence only, never from an earlier digest (I10), within a token budget (≤ 300 tokens).
import type {Level,Outcome,Novelty} from './recheck.ts';
import type {DateStr} from './dates.ts';
/** One live evidence row as the digest and the legacy node card read it. */
export type EvidenceFact={
  id:string;at:number;day:DateStr;concept_id:string|null;level:Level;role?:'primary'|'secondary'|'used';outcome:Outcome;
  hint_level:number;novelty:Novelty;confidence?:number;voided?:boolean;
  minutes_into_session?:number|null;local_hour?:number|null;fingerprint?:string|null;teaches?:boolean;
};
export type DigestLine={text:string;ids:string[]};
const MARK={pass:'pass',partial:'partial',fail:'fail'} as const;
export function buildDigest(evidence:(EvidenceFact&{session_no?:number|null})[],maxTokens=300):DigestLine[]{
  const live=evidence.filter(e=>!e.voided);
  const groups=new Map<string,typeof live>();
  for(const e of live){const k=(e.session_no!=null?'S'+e.session_no:e.day)+'|'+e.level;(groups.get(k)??groups.set(k,[]).get(k)!).push(e)}
  const lines:DigestLine[]=[];
  for(const [key,g] of groups){
    g.sort((a,b)=>a.at-b.at||(a.id<b.id?-1:1));
    const seq=g.map(e=>MARK[e.outcome]).join('→'),hints=Math.max(...g.map(e=>e.hint_level));
    const [who,level]=key.split('|');
    lines.push({text:who+' '+level+' '+seq+(hints>0?', hint'+hints:'')+' ['+'ev:'+g.map(e=>e.id).join(',')+']',ids:g.map(e=>e.id)});
    (lines[lines.length-1] as any).at=g[g.length-1].at;
  }
  lines.sort((a:any,b:any)=>b.at-a.at||(a.text<b.text?-1:1));
  const out:DigestLine[]=[];let used=0;
  for(const l of lines){const t=Math.ceil(l.text.length/3);if(used+t>maxTokens)break;used+=t;out.push({text:l.text,ids:l.ids})}
  return out;
}
export const renderDigest=(d:DigestLine[])=>d.map(l=>l.text).join('\n');
