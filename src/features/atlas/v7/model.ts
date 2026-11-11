import type {AtlasGraph} from '../../../data/types';
import {plainMath} from '../../../lib/plain-math';
import {subjects,type Subject} from '../../../ui/v7/Subject';

/**
 * v7 Atlas model (PLAN §6.12). Every stored concept is a star; stars group into
 * one constellation per subject. Pure and allocation-light so the same model can
 * feed the canvas, the list, search and the layout worker.
 */
export type StarState='demonstrated'|'in_progress'|'up_next'|'not_started'|'revisit';
export interface Star{
 id:string; slug:string; name:string; label:string; subjectId:string; cluster:number; state:StarState;
 /** Drawn radius in map units (6–14 px diameter at 1× zoom). */
 radius:number; due:number; checkpoints:readonly {projectSlug:string;code:string}[]; pin:readonly [number,number]|null; degree:number;
}
export interface Cluster{id:string; name:string; subject:Subject; index:number; size:number}
export interface Edge{from:number; to:number; kind:'prereq'|'related'}
export interface AtlasModel{
 stars:Star[]; index:ReadonlyMap<string,number>; clusters:Cluster[]; edges:Edge[];
 /** Distinct linked stars per star, in a stable order. */
 neighbours:number[][];
 counts:{concepts:number;connections:number;demonstrated:number};
}

export const stateLabel:Record<StarState,string>={demonstrated:'Demonstrated',in_progress:'In progress',up_next:'Up next',not_started:'Not started',revisit:'Needs a recheck'};

/** Subject names map onto the kit's eight hues; "Linear algebra" is "Algebra" (one name per subject). */
export function kitSubject(name:string):Subject{
 const lower=name.trim().toLowerCase();
 const exact=subjects.find(subject=>subject.toLowerCase()===lower);
 if(exact)return exact;
 const partial=subjects.find(subject=>lower.includes(subject.toLowerCase()));
 return partial??'Other';
}
export const subjectToken=(subject:Subject)=>subject==='Other'?'--v7-role-text-secondary':'--v7-role-subject-'+subject.toLowerCase().replace(/\s+/g,'-');

export function buildAtlasModel(graph:AtlasGraph):AtlasModel{
 const clusterBySubject=new Map<string,number>(),clusters:Cluster[]=[];
 const subjectName=new Map(graph.subjects.map(subject=>[subject.id,subject.name]));
 const clusterFor=(subjectId:string)=>{
  let index=clusterBySubject.get(subjectId);
  if(index===undefined){
   index=clusters.length;clusterBySubject.set(subjectId,index);
   const name=subjectName.get(subjectId)??'Other';
   clusters.push({id:subjectId,name,subject:kitSubject(name),index,size:0});
  }
  return index;
 };
 // Clusters follow the subject list's order (creation order, OD6), then any unknown subject.
 for(const subject of graph.subjects)clusterFor(subject.id);
 const index=new Map<string,number>();
 const stars:Star[]=graph.concepts.map((concept,i)=>{
  index.set(concept.id,i);
  const cluster=clusterFor(concept.subjectId);clusters[cluster].size++;
  return {id:concept.id,slug:concept.slug,name:concept.name,label:plainMath(concept.name),subjectId:concept.subjectId,cluster,
   state:concept.status,radius:3,due:concept.dueCards,checkpoints:concept.checkpointRefs,
   pin:concept.pinX!==null&&concept.pinY!==null?[concept.pinX,concept.pinY] as const:null,degree:0};
 });
 const edges:Edge[]=[],linked=stars.map(()=>new Set<number>()),prerequisites=stars.map(()=>[] as number[]);
 for(const link of graph.links){
  const from=index.get(link.fromId),to=index.get(link.toId);
  if(from===undefined||to===undefined||from===to)continue;
  edges.push({from,to,kind:link.kind});
  linked[from].add(to);linked[to].add(from);
  if(link.kind==='prereq')prerequisites[to].push(from);
 }
 const neighbours=linked.map(set=>[...set].sort((a,b)=>a-b));
 // AtlasGraph exposes due cards and checkpoints per concept, not total linked cards,
 // so a star's weight is what is linked to it: due cards, checkpoints and connections.
 let heaviest=1;
 const weights=stars.map((star,i)=>{star.degree=neighbours[i].length;const weight=star.due+2*star.checkpoints.length+star.degree;heaviest=Math.max(heaviest,weight);return weight;});
 let demonstrated=0;
 stars.forEach((star,i)=>{
  star.radius=(6+8*Math.sqrt(weights[i]/heaviest))/2;
  if(star.state==='demonstrated')demonstrated++;
  // Up next: not started, but every prerequisite is already demonstrated.
  if(star.state==='not_started'&&prerequisites[i].length>0&&prerequisites[i].every(p=>stars[p].state==='demonstrated'))star.state='up_next';
 });
 return {stars,index,clusters:clusters.filter(cluster=>cluster.size>0),edges,neighbours,counts:{concepts:stars.length,connections:edges.length,demonstrated}};
}

const plural=(n:number,one:string,many=one+'s')=>n+' '+(n===1?one:many);
/** The one-line summary screen readers hear instead of the canvas. */
export function atlasSummary(model:AtlasModel):string{
 const {concepts,connections,demonstrated}=model.counts;
 return plural(concepts,'concept')+', '+plural(connections,'connection')+', '+demonstrated+' demonstrated';
}
/** "CP4" → "Checkpoint 4"; other codes are shown as written. */
export function checkpointName(code:string):string{
 const match=/^cp\s*(\d+)$/i.exec(code.trim());
 return match?'Checkpoint '+match[1]:'Checkpoint '+code;
}
export function starCounts(model:AtlasModel,i:number):string{
 const star=model.stars[i];
 const first=star.checkpoints[0];
 return [first?checkpointName(first.code):'No checkpoint',star.due?plural(star.due,'card')+' due':'No cards due',plural(model.neighbours[i].length,'neighbour')].join(' · ');
}
/** Name search (names only, so results stay predictable); prefix matches first. */
export function searchStars(model:AtlasModel,query:string,limit=50):number[]{
 const needle=query.trim().toLowerCase();
 if(!needle)return [];
 const hits:number[]=[];
 model.stars.forEach((star,i)=>{if(star.label.toLowerCase().includes(needle))hits.push(i);});
 const collator=new Intl.Collator(undefined,{sensitivity:'base'});
 hits.sort((a,b)=>{
  const pa=model.stars[a].label.toLowerCase().startsWith(needle)?0:1,pb=model.stars[b].label.toLowerCase().startsWith(needle)?0:1;
  return pa-pb||collator.compare(model.stars[a].label,model.stars[b].label);
 });
 return hits.slice(0,limit);
}
/** Alphabetical order used by the List view. */
export function alphabetical(model:AtlasModel):number[]{
 const collator=new Intl.Collator(undefined,{sensitivity:'base'});
 return model.stars.map((_,i)=>i).sort((a,b)=>collator.compare(model.stars[a].label,model.stars[b].label));
}
