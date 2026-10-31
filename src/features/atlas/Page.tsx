import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {ArrowLeft,ChevronRight,Info,MessageCircle,RotateCcw,Search,X} from 'lucide-react';
import {getMode} from '../../data/mode';
import {useAtlas} from '../../data/hooks';
import {Tex} from '../../ui/Tex';
import {plainMath} from '../../lib/plain-math';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {Sheet} from '../../ui/Sheet';
import {useToast} from '../../ui/Toast';
import type {AtlasNode,AtlasTree,Link as GraphLink,Tone} from './tree';
import {STORE,clip,statusName,toneColor,StatusMark,Wires,Row} from './Outline';
import {ancestors,arcsFor,budgetArcs,buildAtlasTree,defaultExpanded,expandedToDepth,focusOn,levelName,matches,neighbours,rowTone,visibleRows} from './tree';


interface Saved{expanded:string[];related:boolean}
function load():Saved|null{
 try{const raw=localStorage.getItem(STORE);return raw?JSON.parse(raw) as Saved:null}catch{return null}
}
function save(value:Saved){try{localStorage.setItem(STORE,JSON.stringify(value))}catch{/* per-viewer convenience only */}}

function Details({tree,node,onClose,onTrace}:{tree:AtlasTree;node:AtlasNode;onClose:()=>void;onTrace:(id:string)=>void}){
 const toast=useToast(),near=neighbours(tree,node.id),path=ancestors(tree,node.id).map(id=>tree.nodes.get(id)!);
 const List=({label,items,tone}:{label:string;items:AtlasNode[];tone:Tone})=>items.length?<div className="mt-4">
  <h3 className="mb-1 flex items-center gap-2 text-caption font-semibold text-ink-3"><span className="h-[2px] w-4" style={{background:toneColor[tone]}}/>{label}</h3>
  {items.map(item=><button key={item.id} type="button" onClick={()=>onTrace(item.id)}
   className="flex min-h-11 w-full items-center gap-2 border-b border-edge text-left text-body">
   <StatusMark node={item}/><span style={clip} className="min-w-0 flex-1"><Tex source={item.name}/></span>
   <span className="shrink-0 text-caption text-ink-3">{levelName[item.level]}</span><ChevronRight size={14} className="text-ink-3"/></button>)}
 </div>:null;
 return <Sheet open onClose={onClose} title={plainMath(node.name)}>
  <div data-atlas-details="true">
   {path.length>0&&<p className="-mt-3 mb-2 truncate text-caption text-ink-3">{path.map(p=>plainMath(p.name)).join(' › ')}</p>}
   <p className="text-label text-ink-2">{levelName[node.level]} · {statusName[node.status]}{node.total>1?` · ${node.done} of ${node.total} ideas demonstrated`:''}</p>
   {node.blurb&&<Tex source={node.blurb} className="mt-3 block text-body text-ink-soft"/>}
   <List label="Builds on" items={near.needs} tone="up"/>
   <List label="Opens up" items={near.unlocks} tone="down"/>
   <List label="Related" items={near.related} tone="related"/>
   {node.children.length>0&&<List label="Inside" items={node.children.map(id=>tree.nodes.get(id)!)} tone="none"/>}
   {node.checkpointRefs.length>0&&<div className="mt-4 flex flex-wrap gap-2">
    {node.checkpointRefs.map(ref=><Link key={ref.projectSlug+ref.code} to={'/p/'+ref.projectSlug+'/cp/'+ref.code}
     className="flex min-h-11 items-center rounded-ctl border border-edge-2 px-3 text-label">Checkpoint {ref.code}</Link>)}
   </div>}
   <div className="mt-4 grid grid-cols-2 gap-2">
    <Link to={'/review/run?concept='+encodeURIComponent(node.slug)} className="flex min-h-11 items-center justify-center rounded-btn border border-edge-2 text-body">Review {node.due}</Link>
    <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-btn border border-edge-2 text-body"
     onClick={()=>{void navigator.clipboard.writeText('Quiz me in chat on '+node.name).then(()=>toast('Quiz prompt copied')).catch(()=>toast('Could not copy prompt'))}}>
     <MessageCircle size={16}/>Quiz me</button>
   </div>
  </div>
 </Sheet>;
}

export default function Page(){
 const navigate=useNavigate(),[params,setParams]=useSearchParams();
 const query=useAtlas(),graph=query.data;
 const tree=useMemo(()=>graph?buildAtlasTree(graph):null,[graph]);
 const saved=useRef(load());
 const [expanded,setExpanded]=useState<Set<string>|null>(null);
 const [related,setRelated]=useState(saved.current?.related??false);
 const [selectedId,setSelectedId]=useState<string|null>(null),[details,setDetails]=useState(false);
 const [searching,setSearching]=useState(false),[search,setSearch]=useState(''),[recheckOnly,setRecheckOnly]=useState(false);
 const scroller=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!tree||expanded)return;
  const stored=saved.current?.expanded.filter(id=>tree.nodes.has(id));
  setExpanded(stored?.length?new Set(stored):defaultExpanded(tree));
 },[tree,expanded]);
 useEffect(()=>{if(expanded)save({expanded:[...expanded],related})},[expanded,related]);
 const open=expanded??new Set<string>();
 const filter=useMemo(()=>search.trim()?(n:AtlasNode)=>matches(n,search):recheckOnly?(n:AtlasNode)=>!n.synthetic&&n.status==='revisit'&&!n.children.length:undefined,[search,recheckOnly]);
 const rows=useMemo(()=>tree?visibleRows(tree,open,filter):[],[tree,open,filter]);
 const kinds=useMemo(()=>new Set<GraphLink['kind']>(related?['prereq','related']:['prereq']),[related]);
 const arcs=useMemo(()=>tree?arcsFor(tree,rows,kinds):[],[tree,rows,kinds]);
 const focus=useMemo(()=>tree&&selectedId&&tree.nodes.has(selectedId)?focusOn(tree,selectedId):null,[tree,selectedId]);
 const arcBudget=useMemo(()=>tree?budgetArcs(tree,rows,open,arcs,focus):{visible:[],hidden:0},[tree,rows,open,arcs,focus]);
 const selected=selectedId?tree?.nodes.get(selectedId)??null:null;
 const recheckCount=useMemo(()=>tree?[...tree.nodes.values()].filter(n=>!n.synthetic&&!n.children.length&&n.status==='revisit').length:0,[tree]);

 const written=useRef<string|null>(null);
 const select=useCallback((id:string|null,openDetails=false)=>{
  setSelectedId(id);setDetails(!!id&&openDetails);
  const next=new URLSearchParams(params),slug=id?tree?.nodes.get(id)?.slug:null;
  const real=slug&&!tree?.nodes.get(id!)?.synthetic?slug:null;
  written.current=real;
  if(real)next.set('focus',real);else next.delete('focus');
  setParams(next,{replace:true});
 },[params,setParams,tree]);
 const reveal=useCallback((id:string)=>{
  if(!tree)return;
  setSearch('');setSearching(false);setRecheckOnly(false);
  setExpanded(prev=>new Set([...(prev??[]),...ancestors(tree,id)]));
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const el=scroller.current?.querySelector(`[data-atlas-row="${CSS.escape(id)}"]`);
   el?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }));
 },[tree]);
 const trace=(id:string)=>{reveal(id);select(id,false)};
 const toggle=(id:string)=>setExpanded(prev=>{const next=new Set(prev??[]);if(next.has(id))next.delete(id);else next.add(id);return next});
 const onRow=(node:AtlasNode)=>{
  // From a search or the re-check list, jump to the idea in its place in the tree.
  if(filter){trace(node.id);return}
  if(node.children.length)toggle(node.id);
  if(selectedId===node.id&&!node.children.length){setDetails(true);return}
  select(selectedId===node.id?null:node.id);
 };
 const focusSlug=params.get('focus');
 const seen=useRef<string|null>(null);
 useEffect(()=>{
  // React only when ?focus= itself changes to a slug this page did not write: an incoming
  // link from elsewhere unfolds to the idea and opens it. (The URL updates a render after
  // a selection here, so comparing against the current selection would undo it.)
  if(!tree||!expanded||focusSlug===seen.current)return;
  seen.current=focusSlug;
  if(!focusSlug||focusSlug===written.current)return;
  written.current=focusSlug;
  const found=[...tree.nodes.values()].find(n=>n.slug===focusSlug);
  if(found){reveal(found.id);setSelectedId(found.id);setDetails(true)}
 },[tree,expanded,focusSlug,reveal]);
 const depthOf=useMemo(()=>{
  if(!tree||!expanded)return null;
  for(const d of [1,2,3]){const set=expandedToDepth(tree,d);if(set.size===expanded.size&&[...set].every(x=>expanded.has(x)))return d}
  const all=[...tree.nodes.values()].filter(n=>n.children.length);
  return all.every(n=>expanded.has(n.id))?99:null;
 },[tree,expanded]);
 const near=selected&&tree?neighbours(tree,selected.id):null;

 if(query.isPending)return <main aria-label="Atlas" className="h-dvh p-4"><Skeleton h={52}/><div className="mt-5"><Skeleton h="65%"/></div></main>;
 if(query.error||!tree)return <main aria-label="Atlas" className="h-dvh p-4">
  <button type="button" className="min-h-11" onClick={()=>navigate(-1)}>Back</button>
  <EmptyState art="plug" title="Could not open Atlas" body="Check your connection." action={{label:'Try again',onClick:()=>void query.refetch()}}/></main>;
 const ideas=[...tree.nodes.values()].filter(n=>!n.synthetic).length;
 return <main aria-label="Atlas" className="relative flex h-dvh flex-col text-ink">
  <header className={'z-20 shrink-0 border-b border-edge bg-obsidian/95 px-3 '+(getMode()==='demo'?'pt-[calc(env(safe-area-inset-top)+30px)]':'pt-[env(safe-area-inset-top)]')}>
   <div className="flex h-14 items-center gap-2">
    <button type="button" aria-label="Back" onClick={()=>navigate(-1)} className="flex size-11 items-center justify-center rounded-ctl"><ArrowLeft size={19}/></button>
    <div className="min-w-0 flex-1"><h1 className="font-serif text-title-s leading-tight">Atlas</h1>
     <p className="truncate text-caption text-ink-3">{ideas} ideas · {tree.links.filter(l=>l.kind==='prereq').length} dependencies</p></div>
    <button type="button" aria-label="Find an idea" aria-pressed={searching} onClick={()=>{setSearching(v=>!v);if(searching)setSearch('')}}
     className="flex size-11 items-center justify-center rounded-ctl"><Search size={19}/></button>
   </div>
   {searching&&<div className="pb-2"><input autoFocus aria-label="Find an idea" placeholder="Find an idea" value={search} onChange={e=>setSearch(e.target.value)}
    className="min-h-11 w-full rounded-ctl border border-edge bg-[var(--card)] px-3 text-body"/></div>}
   <div className="flex flex-wrap items-center gap-2 pb-2" role="toolbar" aria-label="Atlas view">
    <div role="group" aria-label="Fold to depth" className="flex overflow-hidden rounded-ctl border border-edge">
     {[1,2,3,99].map(d=><button key={d} type="button" aria-pressed={depthOf===d} title={d===99?'Unfold everything':'Fold to level '+d} onClick={()=>setExpanded(d===99?new Set([...tree.nodes.values()].filter(n=>n.children.length).map(n=>n.id)):expandedToDepth(tree,d))}
      className={'min-h-11 min-w-11 px-2 text-label '+(depthOf===d?'bg-amber-tint text-amber':'text-ink-2')}>{d===99?'All':d}</button>)}
    </div>
    <button type="button" aria-pressed={related} onClick={()=>setRelated(v=>!v)}
     className={'flex min-h-11 items-center gap-1.5 rounded-ctl border px-2.5 text-label '+(related?'border-amber-line-2 text-amber':'border-edge text-ink-2')}>
     <svg width="16" height="6" aria-hidden="true"><path d="M1 3H15" stroke="currentColor" strokeDasharray="2 3" strokeLinecap="round"/></svg>Related</button>
    {recheckCount>0&&<button type="button" aria-pressed={recheckOnly} aria-label={'Re-check '+recheckCount} title="Ideas due for a re-check" onClick={()=>setRecheckOnly(v=>!v)}
     className={'flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-ctl border px-2.5 text-label tabular-nums '+(recheckOnly?'border-[var(--hard)] text-[var(--hard)]':'border-edge text-ink-2')}>
     <RotateCcw size={14} className="text-[var(--hard)]"/>{recheckCount}</button>}
   </div>
  </header>
  <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-24" data-atlas-stage="true">
   {tree.roots.length===0?<div className="flex h-full items-center justify-center"><EmptyState art="compass" title="Your Atlas is empty" body="Ideas appear here as your plans grow."/></div>
   :rows.length===0?<p className="px-4 py-10 text-center text-body text-ink-3">{search?'No idea matches “'+search+'”.':'Nothing to re-check.'}</p>
   :<div className="relative" role="tree" aria-label="Ideas and their links">
    {rows.map(row=>{const node=tree.nodes.get(row.id)!;
     return <Row key={row.id} node={node} open={!!filter||open.has(row.id)} tone={rowTone(tree,row.id,focus,selectedId,!filter&&!open.has(row.id))} match={row.match}
      onToggle={()=>{if(!filter)toggle(row.id)}} onSelect={()=>onRow(node)}/>})}
    <Wires arcs={arcBudget.visible} rows={rows.length} focus={focus}/>
   </div>}
   {arcBudget.hidden>0&&<p role="status" className="px-4 py-2 text-caption text-ink-3">{arcBudget.hidden} links hidden — fold or select an idea to trace connections.</p>}
   {rows.length>0&&<div aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 text-caption text-ink-3">
    <span className="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden="true"><path d="M1 4H19M15 1L19 4L15 7" fill="none" stroke="var(--ink-3)" strokeWidth="1.3"/></svg>needed for</span>
    <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-[var(--grade-good)]"/>builds on</span>
    <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-[var(--accent)]"/>opens up</span>
    <span className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="var(--accent)"/></svg>demonstrated</span>
    <span className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="var(--hard)" strokeWidth="1.8" strokeDasharray="2.4 1.8"/></svg>re-check</span>
   </div>}
  </div>
  {selected&&!details&&<div data-atlas-peek="true" className="absolute inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-[528px] items-center gap-2 rounded-slab border border-edge-2 bg-raised py-2 pl-4 pr-2 shadow-[var(--e-float)]">
   <div className="min-w-0 flex-1">
    <p style={clip} className="text-body font-semibold"><Tex source={selected.name}/></p>
    <p style={clip} className="text-caption text-ink-3">
     <span style={{color:'var(--grade-good)'}}>builds on {focus?.up.size??0}</span> · <span style={{color:'var(--accent)'}}>opens up {focus?.down.size??0}</span>
     {near&&near.related.length>0?' · '+near.related.length+' related':''}</p>
   </div>
   <button type="button" onClick={()=>setDetails(true)} className="flex min-h-11 items-center gap-1.5 rounded-btn border border-edge-2 px-3 text-label"><Info size={15}/>Details</button>
   <button type="button" aria-label="Clear selection" onClick={()=>select(null)} className="flex size-11 items-center justify-center rounded-ctl text-ink-2"><X size={18}/></button>
  </div>}
  {selected&&details&&<Details tree={tree} node={selected} onClose={()=>setDetails(false)} onTrace={trace}/>}
 </main>;
}
