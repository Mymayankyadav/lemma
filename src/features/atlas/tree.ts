import type {AtlasGraph,ConceptLevel} from '../../data/types';
import {plainMath} from '../../lib/plain-math';

/**
 * The Atlas is an outline of the owner's ideas with their linkages drawn beside it.
 * The stored levels (cluster › galaxy › system › planet › moon) only decide nesting;
 * nothing is laid out in space. Collapsing a branch keeps its links visible by
 * re-attaching them to the nearest visible ancestor, so folding reduces clutter
 * without hiding how ideas depend on each other.
 */
export type Status=AtlasGraph['concepts'][number]['status'];
export type Link=AtlasGraph['links'][number];
export type AtlasNode=AtlasGraph['concepts'][number]&{
 level:ConceptLevel; parentId:string|null; children:string[]; depth:number; synthetic:boolean;
 glyph:string|null; total:number; done:number; revisit:number; due:number; rank:number;
};
export interface AtlasTree{roots:string[]; nodes:Map<string,AtlasNode>; links:Link[]}
export interface Row{id:string; depth:number; match:boolean}
export interface Arc{key:string; from:number; to:number; kind:Link['kind']; count:number; links:Link[]}
export interface Focus{start:Set<string>; up:Set<string>; down:Set<string>; related:Set<string>}

const LEVELS:ConceptLevel[]=['cluster','galaxy','system','planet','moon'];
const isTest=(s:string)=>/zz[-_ ]?selftest|^self[-_ ]test$|^system[-_]test/i.test(s);
export const levelName:Record<ConceptLevel,string>={cluster:'Field',galaxy:'Area',system:'Topic',planet:'Idea',moon:'Detail'};

function synthetic(id:string,name:string,subjectId:string,level:ConceptLevel,parentId:string|null,glyph:string|null):AtlasNode{
 return {id,slug:id,name,subjectId,level,parentId,children:[],depth:0,synthetic:true,glyph,total:0,done:0,revisit:0,due:0,rank:0,
  status:'not_started',blurb:null,pinX:null,pinY:null,checkpointRefs:[],dueCards:0};
}

/** Longest prerequisite chain ending at each idea; cycles are cut where they close. */
function prerequisiteRank(ids:Iterable<string>,links:readonly Link[]):Map<string,number>{
 const needs=new Map<string,string[]>();
 for(const l of links)if(l.kind==='prereq')needs.set(l.toId,[...needs.get(l.toId)??[],l.fromId]);
 const rank=new Map<string,number>(),active=new Set<string>();
 const visit=(id:string):number=>{
  if(rank.has(id))return rank.get(id)!;
  if(active.has(id))return 0;
  active.add(id);
  const value=Math.max(-1,...(needs.get(id)??[]).map(visit))+1;
  active.delete(id);rank.set(id,value);return value;
 };
 for(const id of ids)visit(id);
 return rank;
}
function checkpointNumber(node:AtlasNode):number{
 const numbers=node.checkpointRefs.map(r=>Number(r.code.match(/\d+/)?.[0])).filter(Number.isFinite);
 return numbers.length?Math.min(...numbers):Number.MAX_SAFE_INTEGER;
}

export function buildAtlasTree(graph:AtlasGraph):AtlasTree{
 const subjects=[...graph.subjects].filter(s=>!isTest(s.name)&&!isTest(s.id))
  .sort((a,b)=>a.position-b.position||a.name.localeCompare(b.name));
 const permitted=new Set(subjects.map(s=>s.id)),nodes=new Map<string,AtlasNode>();
 for(const c of graph.concepts){
  if(!permitted.has(c.subjectId)||isTest(c.id)||isTest(c.name))continue;
  const level:ConceptLevel=LEVELS.includes(c.level as ConceptLevel)?c.level!:'planet';
  nodes.set(c.id,{...c,level,parentId:c.parentId??null,children:[],depth:0,synthetic:false,glyph:null,
   total:0,done:0,revisit:0,due:0,rank:0});
 }
 const roots:string[]=[],rootBySubject=new Map<string,string>();
 for(const subject of subjects){
  const own=[...nodes.values()].find(n=>n.subjectId===subject.id&&n.level==='cluster');
  const id=own?.id??'atlas:root:'+subject.id;
  if(own)own.glyph=subject.glyph;
  else nodes.set(id,synthetic(id,subject.name,subject.id,'cluster',null,subject.glyph));
  roots.push(id);rootBySubject.set(subject.id,id);
 }
 for(const node of [...nodes.values()]){
  if(node.level==='cluster'){node.parentId=null;continue}
  const parent=node.parentId?nodes.get(node.parentId):undefined;
  if(parent&&parent.id!==node.id&&parent.subjectId===node.subjectId&&LEVELS.indexOf(parent.level)<LEVELS.indexOf(node.level))continue;
  // Older ideas have only a topic: group them under it rather than one long flat list.
  const topic=node.topic?.trim();
  if((node.level==='planet'||node.level==='moon')&&topic){
   const key='atlas:topic:'+node.subjectId+':'+topic.toLocaleLowerCase();
   if(!nodes.has(key))nodes.set(key,synthetic(key,topic,node.subjectId,'system',rootBySubject.get(node.subjectId)!,null));
   node.parentId=key;
  }else node.parentId=rootBySubject.get(node.subjectId)!;
 }
 for(const node of nodes.values())if(node.parentId)nodes.get(node.parentId)?.children.push(node.id);
 const links=graph.links.filter(l=>l.fromId!==l.toId&&nodes.has(l.fromId)&&nodes.has(l.toId));
 const rank=prerequisiteRank(nodes.keys(),links);
 const summarise=(id:string,depth:number):AtlasNode=>{
  const n=nodes.get(id)!;n.depth=depth;
  const kids=n.children.map(c=>summarise(c,depth+1));
  const own=!n.synthetic&&(n.level==='planet'||n.level==='moon'||n.children.length===0);
  n.total=(own?1:0)+kids.reduce((s,k)=>s+k.total,0);
  n.done=(own&&n.status==='demonstrated'?1:0)+kids.reduce((s,k)=>s+k.done,0);
  n.revisit=(own&&n.status==='revisit'?1:0)+kids.reduce((s,k)=>s+k.revisit,0);
  n.due=n.dueCards+kids.reduce((s,k)=>s+k.due,0);
  n.rank=Math.min(rank.get(id)??Number.MAX_SAFE_INTEGER,...kids.map(k=>k.rank));
  if(n.synthetic||!own){
   n.status=n.revisit?'revisit':n.total&&n.done===n.total?'demonstrated':
    n.done>0||kids.some(k=>k.status==='in_progress')?'in_progress':n.status;
  }
  // Study order: what is needed first comes first, so prerequisite links mostly run downwards.
  n.children.sort((a,b)=>{
   const x=nodes.get(a)!,y=nodes.get(b)!;
   return x.rank-y.rank||checkpointNumber(x)-checkpointNumber(y)||x.name.localeCompare(y.name)||x.id.localeCompare(y.id);
  });
  return n;
 };
 for(const root of roots)summarise(root,0);
 return {roots,nodes,links};
}

export function ancestors(tree:AtlasTree,id:string):string[]{
 const path:string[]=[],seen=new Set<string>();
 let current=tree.nodes.get(id)?.parentId??null;
 while(current&&!seen.has(current)){seen.add(current);path.unshift(current);current=tree.nodes.get(current)?.parentId??null}
 return path;
}
export function descendants(tree:AtlasTree,id:string):string[]{
 const out:string[]=[],stack=[...tree.nodes.get(id)?.children??[]];
 while(stack.length){const next=stack.pop()!;out.push(next);stack.push(...tree.nodes.get(next)?.children??[])}
 return out;
}
/** Expanded to a given depth: 1 shows fields only, 2 their areas, and so on. */
export function expandedToDepth(tree:AtlasTree,depth:number):Set<string>{
 return new Set([...tree.nodes.values()].filter(n=>n.children.length&&n.depth<depth-1).map(n=>n.id));
}
/** First visit: open each field one level and unfold the path to anything in progress or due. */
export function defaultExpanded(tree:AtlasTree):Set<string>{
 const open=new Set(tree.roots);
 for(const n of tree.nodes.values())if(!n.synthetic&&(n.status==='in_progress'||n.status==='revisit'))
  for(const a of ancestors(tree,n.id))open.add(a);
 return open;
}

export function matches(node:AtlasNode,query:string):boolean{
 const q=query.trim().toLocaleLowerCase();
 return !!q&&(plainMath(node.name).toLocaleLowerCase().includes(q)||node.name.toLocaleLowerCase().includes(q));
}
/** Rows in reading order. A filter shows matching ideas with the path that leads to them. */
export function visibleRows(tree:AtlasTree,expanded:ReadonlySet<string>,filter?:(n:AtlasNode)=>boolean):Row[]{
 const rows:Row[]=[];
 let keep:Set<string>|null=null;
 if(filter){
  keep=new Set();
  for(const n of tree.nodes.values())if(filter(n)){keep.add(n.id);for(const a of ancestors(tree,n.id))keep.add(a)}
 }
 const walk=(id:string)=>{
  if(keep&&!keep.has(id))return;
  const n=tree.nodes.get(id)!;
  rows.push({id,depth:n.depth,match:!!filter&&filter(n)});
  if(keep||expanded.has(id))for(const c of n.children)walk(c);
 };
 for(const r of tree.roots)walk(r);
 return rows;
}

/** Nearest visible row for an idea: itself, or the folded branch that contains it. */
export function representative(tree:AtlasTree,index:ReadonlyMap<string,number>,id:string):number|null{
 let current:string|null=id;const seen=new Set<string>();
 while(current&&!seen.has(current)){
  seen.add(current);
  const at=index.get(current);if(at!==undefined)return at;
  current=tree.nodes.get(current)?.parentId??null;
 }
 return null;
}
/** Links between visible rows. Links inside one folded branch disappear; parallel links bundle. */
export function arcsFor(tree:AtlasTree,rows:readonly Row[],kinds:ReadonlySet<Link['kind']>):Arc[]{
 const index=new Map(rows.map((r,i)=>[r.id,i]));
 const bundles=new Map<string,Arc>();
 for(const link of tree.links){
  if(!kinds.has(link.kind))continue;
  const from=representative(tree,index,link.fromId),to=representative(tree,index,link.toId);
  if(from===null||to===null||from===to)continue;
  const [a,b]=link.kind==='related'&&from>to?[to,from]:[from,to];
  const key=link.kind+':'+a+':'+b;
  const arc=bundles.get(key)??{key,from:a,to:b,kind:link.kind,count:0,links:[]};
  arc.count++;arc.links.push(link);bundles.set(key,arc);
 }
 // Short arcs are drawn last so they sit on top of the long ones they nest inside.
 return [...bundles.values()].sort((x,y)=>Math.abs(y.to-y.from)-Math.abs(x.to-x.from));
}

/** Everything the selected idea (or branch) builds on, and everything it opens up. */
export function focusOn(tree:AtlasTree,id:string):Focus{
 const start=new Set([id,...descendants(tree,id)]);
 const needs=new Map<string,string[]>(),unlocks=new Map<string,string[]>(),related=new Set<string>();
 for(const l of tree.links){
  if(l.kind==='prereq'){needs.set(l.toId,[...needs.get(l.toId)??[],l.fromId]);unlocks.set(l.fromId,[...unlocks.get(l.fromId)??[],l.toId])}
  else if(start.has(l.fromId)&&!start.has(l.toId))related.add(l.toId);
  else if(start.has(l.toId)&&!start.has(l.fromId))related.add(l.fromId);
 }
 const spread=(edges:Map<string,string[]>)=>{
  const seen=new Set<string>(),stack=[...start];
  while(stack.length){
   const next=stack.pop()!;
   for(const other of edges.get(next)??[])if(!seen.has(other)&&!start.has(other)){seen.add(other);stack.push(other)}
  }
  return seen;
 };
 return {start,up:spread(needs),down:spread(unlocks),related};
}
export type Tone='up'|'down'|'related'|'self'|'none';
export function arcTone(arc:Arc,focus:Focus|null):Tone{
 if(!focus)return 'none';
 const up=(x:string)=>focus.up.has(x)||focus.start.has(x),down=(x:string)=>focus.down.has(x)||focus.start.has(x);
 if(arc.kind==='related')return arc.links.some(l=>focus.start.has(l.fromId)!==focus.start.has(l.toId))?'related':'none';
 if(arc.links.some(l=>focus.up.has(l.fromId)&&up(l.toId)))return 'up';
 if(arc.links.some(l=>down(l.fromId)&&focus.down.has(l.toId)))return 'down';
 return 'none';
}
/** A row is marked when it is on the chain, or when it is folded and the chain runs inside it. */
export function rowTone(tree:AtlasTree,id:string,focus:Focus|null,selectedId:string|null,folded=true):Tone{
 if(!focus)return 'none';
 if(id===selectedId)return 'self';
 if(focus.start.has(id))return 'none';
 const inside=folded?[id,...descendants(tree,id)]:[id];
 if(inside.some(x=>focus.up.has(x)))return 'up';
 if(inside.some(x=>focus.down.has(x)))return 'down';
 if(inside.some(x=>focus.related.has(x)))return 'related';
 return 'none';
}
/** Direct neighbours for the details sheet. */
export function neighbours(tree:AtlasTree,id:string){
 const own=new Set([id,...descendants(tree,id)]);
 const pick=(ids:string[])=>[...new Set(ids)].map(x=>tree.nodes.get(x)!).filter(Boolean).sort((a,b)=>a.rank-b.rank||a.name.localeCompare(b.name));
 return {
  needs:pick(tree.links.filter(l=>l.kind==='prereq'&&own.has(l.toId)&&!own.has(l.fromId)).map(l=>l.fromId)),
  unlocks:pick(tree.links.filter(l=>l.kind==='prereq'&&own.has(l.fromId)&&!own.has(l.toId)).map(l=>l.toId)),
  related:pick(tree.links.filter(l=>l.kind==='related'&&own.has(l.fromId)!==own.has(l.toId)).map(l=>own.has(l.fromId)?l.toId:l.fromId)),
 };
}
