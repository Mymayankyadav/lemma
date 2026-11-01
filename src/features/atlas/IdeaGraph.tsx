import {useEffect,useMemo,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {Sheet} from '../../ui/Sheet';
import {AtlasDetailsPath} from './DetailsMath';
import {Tex} from '../../ui/Tex';
import type {AtlasNode,AtlasTree,Link as GraphLink} from './tree';
import {ancestors,arcsFor,budgetArcs,expandedToDepth,focusOn,levelName,neighbours,rowTone,visibleRows} from './tree';
import {Row,StatusMark,Wires,toneColor,statusName} from './Outline';
import {buildAtlasRowGeometry} from './rowGeometry';

/**
 * The Atlas's collapsible graph, embedded in a page: fold clusters, see their links
 * merge, and trace one idea's chain. Used to review the ideas a plan would add.
 */
export function IdeaGraph({tree,label,onCheckpoint}:{tree:AtlasTree;label:string;onCheckpoint?:(code:string)=>void}){
 const branches=useMemo(()=>[...tree.nodes.values()].filter(n=>n.children.length),[tree]);
 const ideas=useMemo(()=>[...tree.nodes.values()].filter(n=>!n.synthetic).length,[tree]);
 // Small plans open fully; large ones open one level so the clusters and their links read first.
 const initial=()=>ideas>14?expandedToDepth(tree,2):new Set(branches.map(n=>n.id));
 const [expanded,setExpanded]=useState<Set<string>>(initial);
 const [related,setRelated]=useState(false),[selectedId,setSelectedId]=useState<string|null>(null);
 const [details,setDetails]=useState(false);
 const box=useRef<HTMLDivElement>(null);
 const previousTree=useRef(tree);
 // The lazy useState initializer already chose the correct folds on mount.
 // Re-running it in a mount effect forces a second expensive tree/arc render
 // under StrictMode. Reset only when a *different* proposal tree arrives.
 useEffect(()=>{
  if(previousTree.current===tree)return;
  previousTree.current=tree;
  setExpanded(initial());setSelectedId(null);setDetails(false);
 },[tree]);
 const rows=useMemo(()=>visibleRows(tree,expanded),[tree,expanded]);
 // Match the 56/44px Field/idea rows and notebook gaps in both the embedded
 // plan graph and its orthogonal dependency lanes. Row indices alone are not
 // physical y-coordinates after the v4 hierarchy change.
 const geometry=useMemo(()=>buildAtlasRowGeometry(rows.map(row=>tree.nodes.get(row.id)!.level)),[tree,rows]);
 const kinds=useMemo(()=>new Set<GraphLink['kind']>(related?['prereq','related']:['prereq']),[related]);
 const arcs=useMemo(()=>arcsFor(tree,rows,kinds),[tree,rows,kinds]);
 const focus=useMemo(()=>selectedId&&tree.nodes.has(selectedId)?focusOn(tree,selectedId):null,[tree,selectedId]);
 const arcBudget=useMemo(()=>budgetArcs(tree,rows,expanded,arcs,focus),[tree,rows,expanded,arcs,focus]);
 const selected=selectedId?tree.nodes.get(selectedId)??null:null;
 const near=selected?neighbours(tree,selected.id):null;
 // The proposed ideas are not in the approved Atlas yet: breadcrumbs and
 // neighbour controls stay entirely inside this review, never deep-linking
 // to a nonexistent approved idea.
 const selectedPath:AtlasNode[]=[];
 if(selected){
  const seen=new Set<string>();let current:AtlasNode|undefined=selected;
  while(current&&!seen.has(current.id)){
   selectedPath.unshift(current);seen.add(current.id);
   current=current.parentId?tree.nodes.get(current.parentId):undefined;
  }
 }
 const depth=useMemo(()=>{
  for(const d of [1,2,3]){const set=expandedToDepth(tree,d);if(set.size===expanded.size&&[...set].every(x=>expanded.has(x)))return d}
  return branches.every(n=>expanded.has(n.id))?99:null;
 },[tree,expanded,branches]);
 const toggle=(id:string)=>setExpanded(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next});
 const jump=(id:string)=>{
  setExpanded(prev=>new Set([...prev,...ancestors(tree,id)]));setSelectedId(id);setDetails(false);
  requestAnimationFrame(()=>requestAnimationFrame(()=>box.current?.querySelector(`[data-atlas-row="${CSS.escape(id)}"]`)
   ?.scrollIntoView({block:'nearest',behavior:'smooth'})));
 };
 const Names=({title,items,tone}:{title:string;items:AtlasNode[];tone:'up'|'down'})=>items.length?<p className="flex flex-wrap items-center gap-1.5">
  <span className="text-caption font-semibold" style={{color:toneColor[tone]}}>{title}</span>
  {items.map(n=><button key={n.id} type="button" onClick={()=>jump(n.id)} className="min-h-11 rounded-chip border border-edge px-2 text-[16px]"><Tex source={n.name}/></button>)}
 </p>:null;
 return <div ref={box} className="flex flex-col gap-2" data-idea-graph="true">
  <div role="toolbar" aria-label={label+' view'} className="flex flex-wrap items-center gap-2">
   <div role="group" aria-label="Fold ideas to level" className="flex flex-wrap overflow-hidden rounded-ctl border border-edge">
    {([{depth:1,label:'Fields'},{depth:2,label:'Areas'},{depth:3,label:'Topics'},{depth:99,label:'All'}] as const)
     .map(({depth:d,label:foldLabel})=><button key={d} type="button" aria-pressed={depth===d}
     aria-label={'Show '+foldLabel.toLowerCase()+' level'} title={'Show '+foldLabel.toLowerCase()+' level'}
     onClick={()=>setExpanded(d===99?new Set(branches.map(n=>n.id)):expandedToDepth(tree,d))}
     className={'min-h-11 min-w-11 px-2 text-label '+(depth===d?'bg-amber-tint text-amber':'text-ink-2')}>{foldLabel}</button>)}
   </div>
   <button type="button" aria-pressed={related} onClick={()=>setRelated(v=>!v)}
    className={'flex min-h-11 items-center gap-1.5 rounded-ctl border px-2.5 text-label '+(related?'border-amber-line-2 text-amber':'border-edge text-ink-2')}>
    <svg width="16" height="6" aria-hidden="true"><path d="M1 3H15" stroke="currentColor" strokeDasharray="2 3" strokeLinecap="round"/></svg>Related</button>
  </div>
  {selected&&near&&<div data-idea-selection="true" className="flex flex-col gap-2 rounded-ctl border border-edge p-3" style={{background:'var(--paper)'}}>
   <div className="flex items-start gap-2">
    <StatusMark node={selected}/>
    <p className="min-w-0 flex-1 text-body font-semibold"><Tex source={selected.name}/></p>
    <button type="button" aria-label="Clear selection" onClick={()=>setSelectedId(null)} className="-m-2 flex size-11 shrink-0 items-center justify-center text-ink-2"><X size={17}/></button>
   </div>
   <p className="text-label text-ink-2" aria-label="Idea connections">
    <span style={{color:'var(--link)'}}>Builds on {near.needs.length}</span>
    <span aria-hidden="true"> · </span>
    <span className="text-ink-2">Opens up {near.unlocks.length}</span>
   </p>
   <button type="button" onClick={()=>setDetails(true)}
    className="min-h-11 self-start rounded-ctl border border-edge px-4 text-body font-semibold text-ink">Details</button>
  </div>}
  <Sheet open={details&&!!selected} onClose={()=>setDetails(false)}
   title={selected?<Tex source={selected.name}/>:undefined}>
   {selected&&near&&<div data-proposed-idea-details="true" className="flex flex-col gap-3 rounded-ctl p-3 text-body"
    style={{background:'var(--paper)'}}>
    <AtlasDetailsPath names={selectedPath.map(n=>n.name)} onSelect={i=>jump(selectedPath[i].id)}/>
    <p className="text-label text-ink-2">{levelName[selected.level]} · {statusName[selected.status]}</p>
    {selected.blurb&&<Tex source={selected.blurb} className="block text-[16px] text-ink-2"/>}
    <p className="text-label" aria-label="Idea connections">
     <span style={{color:'var(--link)'}}>Builds on {near.needs.length}</span>
     <span aria-hidden="true"> · </span>Opens up {near.unlocks.length}
    </p>
    <Names title="Builds on" items={near.needs} tone="up"/>
    <Names title="Opens up" items={near.unlocks} tone="down"/>
    <Names title="Related" items={near.related} tone="up"/>
    {selected.children.length>0&&<Names title="Inside" items={selected.children.map(id=>tree.nodes.get(id)!).filter(Boolean)} tone="down"/>}
    {selected.checkpointRefs.length>0&&<p className="flex flex-wrap items-center gap-1.5">
     <span className="text-caption font-semibold text-ink-3">Taught in</span>
     {selected.checkpointRefs.map(r=><button key={r.code} type="button" disabled={!onCheckpoint}
      onClick={()=>{setDetails(false);onCheckpoint?.(r.code)}}
      className="min-h-11 min-w-11 rounded-s border border-edge px-3 text-body font-semibold text-ink">{r.code}</button>)}
    </p>}
   </div>}
  </Sheet>
  <div className="relative overflow-hidden rounded-ctl border border-edge" style={{background:'var(--paper)'}} role="tree" aria-label={label}>
   {rows.map(row=>{const node=tree.nodes.get(row.id)!;
    return <Row key={row.id} node={node} open={expanded.has(row.id)} tone={rowTone(tree,row.id,focus,selectedId,!expanded.has(row.id))} match={false}
     onToggle={()=>toggle(row.id)} onSelect={()=>{if(node.children.length)toggle(node.id);setSelectedId(selectedId===node.id?null:node.id);setDetails(false)}}/>})}
   <Wires arcs={arcBudget.visible} rows={rows.length} focus={focus}
    centers={geometry.centers} heightPx={geometry.totalHeight}/>
  </div>
  {arcBudget.hidden>0&&<p role="status" className="text-caption text-ink-3">{arcBudget.hidden} links hidden — fold or select an idea to trace connections.</p>}
 </div>;
}
export default IdeaGraph;
