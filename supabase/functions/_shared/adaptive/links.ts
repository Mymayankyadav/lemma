import {hash,clamp} from './math.ts';
import type {Concept,Facet} from './kc.ts';
import type {AttemptTag,ModelLink} from './measure.ts';
export const LINK_KINDS=['equivalent','generalises','instance_of','uses_technique','contrasts','analogous','part_of'] as const;
export type LinkKind=typeof LINK_KINDS[number];
export type AtlasLink=ModelLink&{kind:LinkKind;status:'proposed'|'approved'|'rejected';confidence?:number;rationale?:string;from_hash?:string;to_hash?:string;origin?:string};
export const normaliseName=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const contentHash=(c:Concept)=>hash(normaliseName(c.name)+'|'+(c.blurb??'').trim()).toString(16);
const grams=(s:string)=>new Set(Array.from({length:Math.max(0,s.length-2)},(_,i)=>s.slice(i,i+3)));
const jaccard=(a:Set<string>,b:Set<string>)=>{const common=[...a].filter(x=>b.has(x)).length;return common/Math.max(1,a.size+b.size-common);};
export const trigram=(a:string,b:string)=>{const x=normaliseName(a),y=normaliseName(b);return x&&x===y?1:jaccard(grams(x),grams(y));};
export function linkCandidates(fresh:Concept[],old:Concept[],links:AtlasLink[],edges:ModelLink[]=[],limit=50){
 const neighbours=(id:string)=>new Set(edges.filter(e=>e.from_id===id||e.to_id===id).flatMap(e=>[e.from_id,e.to_id]).filter(x=>x!==id));
 const seen=new Set<string>(),out:{from:Concept;to:Concept;score:number;automatic:boolean;from_hash:string;to_hash:string}[]=[];
 for(const a of [...fresh].sort((a,b)=>a.id.localeCompare(b.id)))for(const b of [...old].sort((a,b)=>a.id.localeCompare(b.id))){
  const pair=[a.id,b.id].sort().join(':');if(a.id===b.id||seen.has(pair))continue;seen.add(pair);
  const ah=contentHash(a),bh=contentHash(b);if(links.some(l=>l.from_id===a.id&&l.to_id===b.id&&(l.status!=='rejected'||(l.from_hash===ah&&l.to_hash===bh))))continue;
  const name=trigram(a.name,b.name),blurb=a.blurb&&b.blurb?trigram(a.blurb,b.blurb):0,neighbour=jaccard(neighbours(a.id),neighbours(b.id));
  if(name<.6&&blurb<.5&&neighbour<.3)continue;
  const pa=[...fresh,...old].find(c=>c.id===a.parent_id),pb=[...fresh,...old].find(c=>c.id===b.parent_id);
  out.push({from:a,to:b,score:Math.max(name,blurb,neighbour),automatic:normaliseName(a.name)===normaliseName(b.name)&&!!pa&&!!pb&&normaliseName(pa.name)===normaliseName(pb.name),from_hash:ah,to_hash:bh});
 }
 return out.sort((a,b)=>b.score-a.score||a.from.id.localeCompare(b.from.id)||a.to.id.localeCompare(b.to.id)).slice(0,Math.min(50,limit));
}
export const kindEnabled=(links:AtlasLink[],kind:LinkKind)=>{const decided=links.filter(l=>l.kind===kind&&l.status!=='proposed').slice(-40);return decided.length<40||decided.filter(l=>l.status==='approved').length/40>=.5;};
export function validateLinkLabel(label:any):string[]{const reasons:string[]=[];if(!label||!LINK_KINDS.includes(label.kind))reasons.push('Unknown link kind');if(!['forward','reverse','both'].includes(label?.direction))reasons.push('Invalid direction');if(!(typeof label?.confidence==='number'&&label.confidence>=0&&label.confidence<=1))reasons.push('Invalid confidence');if(typeof label?.rationale!=='string'||label.rationale.length>200||label.rationale.trim().split(/\s+/).length>20)reasons.push('Rationale exceeds 20 words');return reasons;}
export function defaultTags(k:string,facet:Facet,cued:string[],links:ModelLink[]):AttemptTag[]{
 const out:AttemptTag[]=[];for(const l of links){if(l.status&&l.status!=='approved')continue;
  if(l.kind==='prereq'&&l.to_id===k)out.push({concept_id:l.from_id,facet,role:'required',demand:-1});
  if(l.kind==='uses_technique'&&l.from_id===k&&!cued.includes(l.to_id))out.push({concept_id:l.to_id,facet:'select',role:'required',demand:0});
  if(l.kind==='part_of'&&l.to_id===k)out.push({concept_id:l.from_id,facet:'execute',role:'required',demand:0});}
 return out;
}
/** 06 §5: o = uncued attempts in another subject whose solution uses A (A tagged required or incidental); u = those where A was used unprompted and correctly. */
export function bridgeCounts(facts:{attempts:{id:string|number;cued?:string[];voided_at?:string|null;superseded_by?:string|number|null;tags?:{concept_id:string;role?:string;result?:string|null}[]}[];tags?:{attempt_id?:string|number;concept_id:string;role?:string;result?:string|null}[]},concepts:{id:string;subject_id?:string|null}[],from:string):{o:number;u:number}{
 const subject=new Map(concepts.map(c=>[c.id,c.subject_id??null])),ownTags=new Map<string,{concept_id:string;role?:string;result?:string|null}[]>();
 for(const t of facts.tags??[]){const k=String(t.attempt_id);(ownTags.get(k)??ownTags.set(k,[]).get(k)!).push(t);}
 let o=0,u=0;
 for(const a of facts.attempts){
  if(a.voided_at||a.superseded_by)continue;
  const tags=a.tags??ownTags.get(String(a.id))??[];
  const target=tags.find(t=>t.role==='target')?.concept_id,use=tags.find(t=>t.concept_id===from&&(t.role==='required'||t.role==='incidental'));
  if(!use||!target||subject.get(target)===subject.get(from)||(a.cued??[]).includes(from))continue;
  o++;if(use.result==='ok')u++;
 }
 return {o,u};
}
export function bridgeStrength(opportunities:number,uses:number){const o=Math.max(0,opportunities),u=clamp(uses,0,o),mean=(1+u)/(2+o);return {mean,o,u,dashed:o===0,thick:mean>=.5&&o>=3};}
