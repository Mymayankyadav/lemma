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
// Reuse the ICU collation object across thousands of extreme sibling-sort pairs.
// Intl.Collator's default ordering matches String.localeCompare's defaults.
const compareNames=new Intl.Collator().compare;
/** React StrictMode evaluates useMemo calculations twice in development. Reuse
 * the derived tree for an unchanged immutable query snapshot, rather than
 * sorting and aggregating 2,500 ideas twice on the cold 4x CPU route.
 * A new query data object receives a new tree; weak keys avoid retention.
 */
const derivedAtlasTrees=new WeakMap<AtlasGraph,AtlasTree>();
const isTest=(s:string)=>/zz[-_ ]?selftest|^self[-_ ]test$|^system[-_]test/i.test(s);
export const levelName:Record<ConceptLevel,string>={cluster:'Field',galaxy:'Area',system:'Topic',planet:'Idea',moon:'Detail'};
/** A safe literal label needs no Markdown parser, KaTeX tree or sanitizer.
 * Delimiters/markup fall back to Tex; JSX escapes the plain path automatically.
 * This matters on the cold 2,500-idea Atlas where dozens of rows mount at once.
 */
export function isPlainAtlasLabel(source:string):boolean{
 // Marked/GFM auto-links bare domains such as example.org even without
 // explicit Markdown punctuation. They must use Tex, not the fast text node.
 // The fallback is conservative: mathematical prose remains escaped JSX.
 if(/(?:^|[\s(])(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?=$|[\s),.!?;:])/i.test(source))
  return false;
 return /^[A-Za-z0-9][A-Za-z0-9 ,.:;!?()'+-]*$/.test(source);
}



function synthetic(id:string,name:string,subjectId:string,level:ConceptLevel,parentId:string|null,glyph:string|null):AtlasNode{
 return {id,slug:id,name,subjectId,level,parentId,children:[],depth:0,synthetic:true,glyph,total:0,done:0,revisit:0,due:0,rank:0,
  status:'not_started',blurb:null,pinX:null,pinY:null,checkpointRefs:[],dueCards:0};
}

/** Longest prerequisite chain ending at each idea; cycles are cut where they close.
 * Iterative postorder traversal avoids a JS stack overflow for long chains and
 * eliminates a temporary mapped dependency array at every visited idea.
 * The active-edge fallback of rank zero matches the previous DFS semantics.
 */
function prerequisiteRank(ids:Iterable<string>,links:readonly Link[]):Map<string,number>{
 const needs=new Map<string,string[]>();
 for(const link of links)if(link.kind==='prereq'){
  const bucket=needs.get(link.toId);
  if(bucket)bucket.push(link.fromId);
  else needs.set(link.toId,[link.fromId]);
 }
 // The usual Atlas DAG arrives in prerequisite order. Rank it in one
 // forward pass without allocating a DFS frame or active-set entry per idea.
 // If any dependency is not already ranked (reverse order, cycle or missing
 // ancestor), restart with the exact iterative DFS fallback below.
 const ordered=[...ids],rank=new Map<string,number>();
 let inOrder=true;
 for(const id of ordered){
  let max=-1;
  for(const dependency of needs.get(id)??[]){
   const value=rank.get(dependency);
   if(value===undefined){inOrder=false;break}
   if(value>max)max=value;
  }
  if(!inOrder)break;
  rank.set(id,max+1);
 }
 if(inOrder)return rank;
 rank.clear();
 const active=new Set<string>();
 type Frame={id:string;dependencies:readonly string[];next:number;max:number};
 const stack:Frame[]=[];
 for(const root of ordered){
  if(rank.has(root))continue;
  active.add(root);
  stack.push({id:root,dependencies:needs.get(root)??[],next:0,max:-1});
  while(stack.length){
   const frame=stack[stack.length-1];
   if(frame.next<frame.dependencies.length){
    const dependency=frame.dependencies[frame.next++];
    const known=rank.get(dependency);
    if(known!==undefined)frame.max=Math.max(frame.max,known);
    else if(active.has(dependency))frame.max=Math.max(frame.max,0);
    else{
     active.add(dependency);
     stack.push({id:dependency,dependencies:needs.get(dependency)??[],next:0,max:-1});
    }
   }else{
    const value=frame.max+1;
    rank.set(frame.id,value);
    active.delete(frame.id);
    stack.pop();
    if(stack.length){
     const parent=stack[stack.length-1];
     parent.max=Math.max(parent.max,value);
    }
   }
  }
 }
 return rank;
}
function checkpointNumber(node:AtlasNode):number{
 // Most ideas have no checkpoint refs. Avoid allocating two arrays and a
 // spread call per idea during the 2,500-node first Atlas mount.
 let minimum=Number.POSITIVE_INFINITY;
 for(const ref of node.checkpointRefs){
  const match=/\d+/.exec(ref.code);
  if(!match)continue;
  const value=Number(match[0]);
  if(Number.isFinite(value)&&value<minimum)minimum=value;
 }
 return Number.isFinite(minimum)?minimum:Number.MAX_SAFE_INTEGER;
}

/** Proposed flat ideas are synthetic topics named after the teaching checkpoint. */
function taughtCheckpoint(node:AtlasNode):number|null{
 if(!node.synthetic)return null;
 const match=/^Taught in CP(\d+)$/i.exec(node.name);
 return match?Number(match[1]):null;
}

export function buildAtlasTree(graph:AtlasGraph):AtlasTree{
 const cached=derivedAtlasTrees.get(graph);
 if(cached)return cached;
 const subjects=[...graph.subjects].filter(s=>!isTest(s.name)&&!isTest(s.id))
  .sort((a,b)=>a.position-b.position||compareNames(a.name,b.name));
 const permitted=new Set(subjects.map(s=>s.id)),nodes=new Map<string,AtlasNode>();
 const clustersBySubject=new Map<string,AtlasNode[]>();
 for(const c of graph.concepts){
  if(!permitted.has(c.subjectId)||isTest(c.id)||isTest(c.name))continue;
  const level:ConceptLevel=LEVELS.includes(c.level as ConceptLevel)?c.level!:'planet';
  const node:AtlasNode={...c,level,parentId:c.parentId??null,children:[],depth:0,synthetic:false,glyph:null,
   total:0,done:0,revisit:0,due:0,rank:0};
  nodes.set(c.id,node);
  if(level==='cluster'){
   const own=clustersBySubject.get(c.subjectId)??[];
   own.push(node);clustersBySubject.set(c.subjectId,own);
  }
 }
 const roots:string[]=[],rootBySubject=new Map<string,string>();
 for(const subject of subjects){
  // Group roots while building nodes instead of rescanning all ideas for each field.
  const own=(clustersBySubject.get(subject.id)??[]).sort((a,b)=>compareNames(a.name,b.name));
  for(const field of own){field.glyph=subject.glyph;roots.push(field.id)}
  const id=own[0]?.id??'atlas:root:'+subject.id;
  if(!own.length){nodes.set(id,synthetic(id,subject.name,subject.id,'cluster',null,subject.glyph));roots.push(id)}
  rootBySubject.set(subject.id,id);
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
 // Child ordering may compare the same idea dozens of times. Parse its
 // checkpoint code once, not during every comparison in each sibling sort.
 const checkpointRanks=new Map<string,number>(),taughtRanks=new Map<string,number|null>();
 for(const [id,node] of nodes){
  checkpointRanks.set(id,checkpointNumber(node));
  taughtRanks.set(id,taughtCheckpoint(node));
 }
 const summarise=(id:string,depth:number):AtlasNode=>{
  const n=nodes.get(id)!;n.depth=depth;
  const own=!n.synthetic&&(n.level==='planet'||n.level==='moon'||n.children.length===0);
  // A single postorder pass accumulates all four counts and child status.
  // The previous map + four reduce/some passes allocated one child array
  // per parent and revisited the same 2,500-node cold Atlas tree repeatedly.
  let total=own?1:0,done=own&&n.status==='demonstrated'?1:0;
  let revisit=own&&n.status==='revisit'?1:0,due=n.dueCards;
  let minRank=rank.get(id)??Number.MAX_SAFE_INTEGER,childInProgress=false;
  for(const childId of n.children){
   const child=summarise(childId,depth+1);
   total+=child.total;
   done+=child.done;
   revisit+=child.revisit;
   due+=child.due;
   if(child.rank<minRank)minRank=child.rank;
   if(child.status==='in_progress')childInProgress=true;
  }
  n.total=total;n.done=done;n.revisit=revisit;n.due=due;n.rank=minRank;
  if(n.synthetic||!own){
   n.status=revisit?'revisit':total&&done===total?'demonstrated':
    done>0||childInProgress?'in_progress':n.status;
  }
  // Study order: what is needed first comes first, so prerequisite links mostly run downwards.
  const compareChildren=(a:string,b:string)=>{
   const x=nodes.get(a)!,y=nodes.get(b)!;
   const taughtX=taughtRanks.get(a)??null,taughtY=taughtRanks.get(b)??null;
   // A proposed plan must read CP1, CP2, …, CP10, never CP1, CP10, CP2.
   if(taughtX!==null&&taughtY!==null&&taughtX!==taughtY)return taughtX-taughtY;
   return x.rank-y.rank||(checkpointRanks.get(a)??Number.MAX_SAFE_INTEGER)-(checkpointRanks.get(b)??Number.MAX_SAFE_INTEGER)||compareNames(x.name,y.name)||compareNames(x.id,y.id);
  };
  // The large stress DAG arrives in prerequisite order, as do many real plans.
  // Detect an already ordered sibling list in O(n) and skip a costly ICU sort.
  // Unordered lists still use exactly the same comparator and stable sort.
  let ordered=true;
  for(let i=1;i<n.children.length;i++){
   if(compareChildren(n.children[i-1],n.children[i])>0){ordered=false;break}
  }
  if(!ordered)n.children.sort(compareChildren);
  return n;
 };
 for(const root of roots)summarise(root,0);
 const result={roots,nodes,links};
 derivedAtlasTrees.set(graph,result);
 return result;
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
/** Resolve saved/default folds before the first tree render. An effect-only
 * initialization made the extreme Atlas calculate 8,000 links twice under
 * 4× CPU throttling: once for the closed roots, then for the actual view. */
export function initialExpanded(tree:AtlasTree,stored?:readonly string[]|null):Set<string>{
 const valid=stored?.filter(id=>tree.nodes.has(id));
 return valid?.length?new Set(valid):defaultExpanded(tree);
}

/** First visit: open each field one level and unfold the path to anything in progress or due. */
export function defaultExpanded(tree:AtlasTree):Set<string>{
 const open=new Set(tree.roots);
 // Active ideas often share the same five ancestors. Walk upward only until
 // reaching an already-open branch; its entire ancestor chain was opened by
 // the previous walk. This avoids allocating a path and visited Set per idea.
 for(const n of tree.nodes.values()){
  if(n.synthetic||(n.status!=='in_progress'&&n.status!=='revisit'))continue;
  let parent=n.parentId;
  while(parent&&!open.has(parent)){
   open.add(parent);
   parent=tree.nodes.get(parent)?.parentId??null;
  }
 }
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
 // Resolve each idea's nearest visible ancestor once. In a 2,500-idea
 // Atlas with 8,000 links, walking and allocating a visited Set for both
 // endpoints of every link needlessly repeats the same ancestry work.
 // Cache misses as well as hits; the index is scoped to this exact row set.
 const representatives=new Map<string,number|null>();
 const resolve=(id:string):number|null=>{
  if(representatives.has(id))return representatives.get(id)!;
  const path:string[]=[],seen=new Set<string>();
  let current:string|null=id;
  let found:number|null=null;
  while(current&&!seen.has(current)){
   if(representatives.has(current)){found=representatives.get(current)!;break}
   seen.add(current);
   path.push(current);
   const at=index.get(current);
   if(at!==undefined){found=at;break}
   current=tree.nodes.get(current)?.parentId??null;
  }
  for(const node of path)representatives.set(node,found);
  return found;
 };
 const bundles=new Map<string,Arc>();
 for(const link of tree.links){
  if(!kinds.has(link.kind))continue;
  const from=resolve(link.fromId),to=resolve(link.toId);
  if(from===null||to===null||from===to)continue;
  const [a,b]=link.kind==='related'&&from>to?[to,from]:[from,to];
  const key=link.kind+':'+a+':'+b;
  const arc=bundles.get(key)??{key,from:a,to:b,kind:link.kind,count:0,links:[]};
  arc.count++;arc.links.push(link);bundles.set(key,arc);
 }
 // Do not sort every arc here. Extreme profiles have up to 8,000 links,
 // but the gutter renders at most 60 arcs. Sort only the retained arcs.
 return [...bundles.values()];
}


/** Count distinct visible bundles without allocating thousands of Arc objects.
 * A fully unfolded, unfocused extreme Atlas draws no arcs above the gutter cap;
 * the only visible result is the exact number hidden. */
export function arcCountFor(tree:AtlasTree,rows:readonly Row[],kinds:ReadonlySet<Link['kind']>):number{
 const index=new Map(rows.map((row,i)=>[row.id,i]));
 const cached=new Map<string,number|null>();
 const resolve=(id:string):number|null=>{
  if(cached.has(id))return cached.get(id)!;
  const path:string[]=[];
  let current:string|null=id,found:number|null=null;
  while(current&&!path.includes(current)){
   if(cached.has(current)){found=cached.get(current)!;break}
   path.push(current);
   const at=index.get(current);
   if(at!==undefined){found=at;break}
   current=tree.nodes.get(current)?.parentId??null;
  }
  for(const node of path)cached.set(node,found);
  return found;
 };
 // This count-only first-paint path does not need Arc objects or string keys.
 // Encode (source row, target row, kind) injectively as a safe integer; a
 // fallback retains exact behavior for an unrealistically large row inventory.
 const width=rows.length,packed=width<2**26;
 const keys=new Set<number|string>();
 for(const link of tree.links){
  if(!kinds.has(link.kind))continue;
  const from=resolve(link.fromId),to=resolve(link.toId);
  if(from===null||to===null||from===to)continue;
  const [a,b]=link.kind==='related'&&from>to?[to,from]:[from,to];
  keys.add(packed?(a*width+b)*2+(link.kind==='related'?1:0):link.kind+':'+a+':'+b);
 }
 return keys.size;
}

/** Keep the dependency margin readable under thousands of links. A collapsed
 * branch still summarises its connections; with everything expanded, only
 * connections relevant to the selected idea remain visible above the cap.
 * The count reports arcs (bundled visible connections), not raw database links.
 */
export function budgetArcs(
 tree:AtlasTree,rows:readonly Row[],expanded:ReadonlySet<string>,
 arcs:readonly Arc[],focus:Focus|null,limit=60,
):{visible:Arc[];hidden:number}{
 const bySpan=(a:Arc,b:Arc)=>Math.abs(b.to-b.from)-Math.abs(a.to-a.from);
 if(arcs.length<=limit)return {visible:[...arcs].sort(bySpan),hidden:0};
 // With no selected idea and no folded branches, all arcs are intentionally
 // hidden. Avoid allocating and sorting thousands of scored candidates.
 if(!focus&&!rows.some(row=>{
  const node=tree.nodes.get(row.id);
  return !!node?.children.length&&!expanded.has(node.id);
 }))return {visible:[],hidden:arcs.length};
 const scored=arcs.map((arc,index)=>{
  const focused=!!focus&&arcTone(arc,focus)!=='none';
  const folded=[arc.from,arc.to].some(i=>{
   const node=tree.nodes.get(rows[i]?.id??'');
   return !!node?.children.length&&!expanded.has(node.id);
  });
  return {arc,index,score:focused?2:folded?1:0};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||bySpan(a.arc,b.arc)||a.index-b.index);
 const chosen=new Set(scored.slice(0,limit).map(x=>x.arc.key));
 const visible=arcs.filter(arc=>chosen.has(arc.key)).sort(bySpan);
 return {visible,hidden:arcs.length-visible.length};
}

/**
 * Unfocused first paint needs at most 60 bundled arcs, never their underlying
 * 8,000 individual Link objects. Aggregate counts and folded priorities in
 * one pass; materialize only the selected Arc records. The focused path still
 * uses arcsFor() because arcTone() needs the real underlying links.
 *
 * The ordering and hidden count are identical to
 * budgetArcs(tree, rows, expanded, arcsFor(tree, rows, kinds), null, limit).
 */
export function budgetArcsUnfocused(
 tree:AtlasTree,rows:readonly Row[],expanded:ReadonlySet<string>,
 kinds:ReadonlySet<Link['kind']>,limit=60,
):{visible:Arc[];hidden:number}{
 const index=new Map(rows.map((row,i)=>[row.id,i]));
 const cache=new Map<string,number|null>();
 const resolve=(id:string):number|null=>{
  if(cache.has(id))return cache.get(id)!;
  const path:string[]=[];
  let current:string|null=id,found:number|null=null;
  while(current&&!path.includes(current)){
   if(cache.has(current)){found=cache.get(current)!;break}
   path.push(current);
   const at=index.get(current);
   if(at!==undefined){found=at;break}
   current=tree.nodes.get(current)?.parentId??null;
  }
  for(const part of path)cache.set(part,found);
  return found;
 };
 type Bundle={from:number;to:number;kind:Link['kind'];count:number;index:number;folded:boolean};
 const width=rows.length,packed=width<2**26;
 const bundles=new Map<number|string,Bundle>();
 for(const link of tree.links){
  if(!kinds.has(link.kind))continue;
  const from=resolve(link.fromId),to=resolve(link.toId);
  if(from===null||to===null||from===to)continue;
  const [a,b]=link.kind==='related'&&from>to?[to,from]:[from,to];
  const key=packed?(a*width+b)*2+(link.kind==='related'?1:0):link.kind+':'+a+':'+b;
  const existing=bundles.get(key);
  if(existing){existing.count++;continue}
  const folded=[a,b].some(i=>{
   const node=tree.nodes.get(rows[i]?.id??'');
   return !!node?.children.length&&!expanded.has(node.id);
  });
  bundles.set(key,{from:a,to:b,kind:link.kind,count:1,index:bundles.size,folded});
 }
 const all=[...bundles.values()];
 const bySpan=(a:Bundle,b:Bundle)=>Math.abs(b.to-b.from)-Math.abs(a.to-a.from);
 const toArc=(bundle:Bundle):Arc=>({
  key:bundle.kind+':'+bundle.from+':'+bundle.to,
  from:bundle.from,to:bundle.to,kind:bundle.kind,count:bundle.count,links:[],
 });
 if(all.length<=limit)return {visible:all.sort(bySpan).map(toArc),hidden:0};
 // Same stable insertion-order tiebreak as budgetArcs. Non-folded arcs are
 // intentionally hidden until the user selects a concept.
 // Select only the best 60 folded arcs with a worst-first bounded heap.
 // Sorting every one of 8,000 candidates on each first mount consumed CPU
 // even though the gutter could never display more than the cap. Preserve
 // the original stable insertion-order tiebreak for equal spans.
 const span=(bundle:Bundle)=>Math.abs(bundle.to-bundle.from);
 const worse=(a:Bundle,b:Bundle)=>span(a)<span(b)||(span(a)===span(b)&&a.index>b.index);
 const heap:Bundle[]=[];
 const siftUp=(index:number)=>{
  while(index>0){
   const parent=(index-1)>>1;
   if(!worse(heap[index],heap[parent]))break;
   [heap[index],heap[parent]]=[heap[parent],heap[index]];
   index=parent;
  }
 };
 const siftDown=()=>{
  let index=0;
  while(true){
   const left=index*2+1,right=left+1;
   let worst=index;
   if(left<heap.length&&worse(heap[left],heap[worst]))worst=left;
   if(right<heap.length&&worse(heap[right],heap[worst]))worst=right;
   if(worst===index)break;
   [heap[index],heap[worst]]=[heap[worst],heap[index]];
   index=worst;
  }
 };
 for(const bundle of all){
  if(!bundle.folded||limit<=0)continue;
  if(heap.length<limit){heap.push(bundle);siftUp(heap.length-1)}
  else if(worse(heap[0],bundle)){heap[0]=bundle;siftDown()}
 }
 const selected=new Set(heap);
 const visible=all.filter(bundle=>selected.has(bundle)).sort(bySpan).map(toArc);
 return {visible,hidden:all.length-visible.length};
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
 const pick=(ids:string[])=>[...new Set(ids)].map(x=>tree.nodes.get(x)!).filter(Boolean).sort((a,b)=>a.rank-b.rank||compareNames(a.name,b.name));
 return {
  needs:pick(tree.links.filter(l=>l.kind==='prereq'&&own.has(l.toId)&&!own.has(l.fromId)).map(l=>l.fromId)),
  unlocks:pick(tree.links.filter(l=>l.kind==='prereq'&&own.has(l.fromId)&&!own.has(l.toId)).map(l=>l.toId)),
  related:pick(tree.links.filter(l=>l.kind==='related'&&own.has(l.fromId)!==own.has(l.toId)).map(l=>own.has(l.fromId)?l.toId:l.fromId)),
 };
}
