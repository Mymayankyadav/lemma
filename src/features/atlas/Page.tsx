import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {ArrowLeft,ChevronRight,Info,MessageCircle,RotateCcw,Search,X} from 'lucide-react';
import {getMode} from '../../data/mode';
import {useAtlas} from '../../data/hooks';
import {Tex} from '../../ui/Tex';
import {plainMath} from '../../lib/plain-math';
import {AtlasDetailsPath,AtlasDetailsTitle} from './DetailsMath';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {Sheet} from '../../ui/Sheet';
import {useToast} from '../../ui/Toast';
import type {AtlasNode,AtlasTree,Link as GraphLink,Tone} from './tree';
import {STORE,clip,statusName,toneColor,StatusMark,Wires,Row} from './Outline';
import {ancestors,arcCountFor,arcsFor,budgetArcs,buildAtlasTree,expandedToDepth,initialExpanded,focusOn,levelName,matches,neighbours,rowTone,visibleRows} from './tree';


interface Saved{expanded:string[];related:boolean}
function load():Saved|null{
 try{const raw=localStorage.getItem(STORE);return raw?JSON.parse(raw) as Saved:null}catch{return null}
}
function save(value:Saved){try{localStorage.setItem(STORE,JSON.stringify(value))}catch{/* per-viewer convenience only */}}

function NeighbourList({label,items,tone,onTrace,tree}:{label:string;items:AtlasNode[];tone:Tone;onTrace:(id:string)=>void;tree:AtlasTree}){
 const [expanded,setExpanded]=useState(false);
 if(!items.length)return null;
 const visible=expanded?items:items.slice(0,8);
 const groups=new Map<string,AtlasNode[]>();
 for(const item of visible){
  const area=label==='Opens up'?ancestors(tree,item.id).map(id=>tree.nodes.get(id)).find(n=>n?.level==='galaxy')?.name??'Other ideas':'';
  groups.set(area,[...(groups.get(area)??[]),item]);
 }
 return <div className="mt-4">
  <h3 className="mb-1 flex items-center gap-2 text-label font-semibold text-ink-2"><span className="h-[2px] w-4" style={{background:toneColor[tone]}}/>{label} · {items.length}</h3>
  {[...groups].map(([area,members])=><div key={area}>
   {area&&<p className="mt-2 text-caption font-semibold text-ink-3">{area}</p>}
   {members.map(item=><button key={item.id} type="button" onClick={()=>onTrace(item.id)}
    className="flex min-h-11 w-full items-center gap-2 border-b border-edge text-left text-body">
    <StatusMark node={item}/><span style={clip} className="min-w-0 flex-1"><Tex source={item.name}/></span>
    <span className="shrink-0 text-caption text-ink-3">{levelName[item.level]}</span><ChevronRight size={14} className="text-ink-3"/></button>)}
  </div>)}
  {items.length>8&&<button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}
   className="min-h-11 w-full rounded-ctl border border-edge px-3 text-left text-label text-amber">
   {expanded?'Show fewer':`Show all ${items.length}`}
  </button>}
 </div>;
}

function Details({tree,node,onClose,onTrace}:{tree:AtlasTree;node:AtlasNode;onClose:()=>void;onTrace:(id:string)=>void}){
 const toast=useToast(),near=neighbours(tree,node.id),path=ancestors(tree,node.id).map(id=>tree.nodes.get(id)!);
 return <Sheet open onClose={onClose} title={<AtlasDetailsTitle name={node.name}/>}>
  <div data-atlas-details="true">
   {path.length>0&&<AtlasDetailsPath names={path.map(p=>p.name)}/>}
   <div className="mt-3 flex items-center justify-between gap-3 text-label text-ink-2">
    <span>{statusName[node.status]}</span>
    <span className="tabular-nums">{node.done} of {node.total} demonstrated</span>
   </div>
   <div aria-label="Demonstrated ideas" role="progressbar" aria-valuemin={0} aria-valuemax={Math.max(1,node.total)} aria-valuenow={node.done}
    className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--paper-2)]">
    <div className="h-full rounded-full bg-[var(--ink-2)]" style={{width:(node.total?100*node.done/node.total:0)+'%'}}/>
   </div>
   {node.blurb&&<Tex source={node.blurb} className="mt-3 block text-body text-ink-soft"/>}
   <NeighbourList label="Builds on" items={near.needs} tone="up" onTrace={onTrace} tree={tree}/>
   <NeighbourList label="Opens up" items={near.unlocks} tone="down" onTrace={onTrace} tree={tree}/>
   <NeighbourList label="Related" items={near.related} tone="related" onTrace={onTrace} tree={tree}/>
   {node.children.length>0&&<NeighbourList label="Inside" items={node.children.map(id=>tree.nodes.get(id)!)} tone="none" onTrace={onTrace} tree={tree}/>}
   {node.checkpointRefs.length>0&&<div className="mt-4 flex flex-wrap gap-2">
    {node.checkpointRefs.map(ref=><Link key={ref.projectSlug+ref.code} to={'/p/'+ref.projectSlug+'/cp/'+ref.code}
     className="flex min-h-11 items-center rounded-ctl border border-edge-2 px-3 text-label">Checkpoint {ref.code}</Link>)}
   </div>}
   <div className="mt-5 grid grid-cols-2 gap-2">
    <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-btn bg-[var(--accent)] px-3 text-body font-semibold text-[var(--paper)]"
     onClick={()=>{void navigator.clipboard.writeText('Quiz me in chat on '+node.name).then(()=>toast('Quiz prompt copied')).catch(()=>toast('Could not copy prompt'))}}>
     <MessageCircle size={16}/>Quiz me</button>
    <Link to={'/review/run?concept='+encodeURIComponent(node.slug)} className="flex min-h-11 items-center justify-center rounded-btn border border-edge-2 px-3 text-body">Review {node.due}</Link>
   </div>
  </div>
 </Sheet>;
}

export default function Page(){
 const navigate=useNavigate(),[params,setParams]=useSearchParams();
 const query=useAtlas(),graph=query.data;
 const tree=useMemo(()=>graph?buildAtlasTree(graph):null,[graph]);
 const [saved]=useState(load);
 const [expanded,setExpanded]=useState<Set<string>|null>(null);
 const [related,setRelated]=useState(saved?.related??false);
 const [selectedId,setSelectedId]=useState<string|null>(null),[details,setDetails]=useState(false);
 const [searching,setSearching]=useState(false),[search,setSearch]=useState(''),[recheckOnly,setRecheckOnly]=useState(false);
 const [confirmAll,setConfirmAll]=useState(false);
 const scroller=useRef<HTMLDivElement>(null);
 const [scrollTop,setScrollTop]=useState(0),[viewportHeight,setViewportHeight]=useState(740);
 useEffect(()=>{
  const el=scroller.current;if(!el)return;
  const update=()=>setViewportHeight(el.clientHeight);
  update();const observer=new ResizeObserver(update);observer.observe(el);
  return ()=>observer.disconnect();
 },[query.isPending]);
 // Resolve saved/default folds synchronously. A null override means the
 // user has not changed them yet; do not schedule a redundant state update
 // that would reconcile thousands of tree rows on the next frame.
 const initialOpen=useMemo(()=>tree?initialExpanded(tree,saved?.expanded):new Set<string>(),[tree]);
 const open=expanded??initialOpen;
 useEffect(()=>{if(expanded)save({expanded:[...expanded],related})},[expanded,related]);
 const filter=useMemo(()=>search.trim()?(n:AtlasNode)=>matches(n,search):recheckOnly?(n:AtlasNode)=>!n.synthetic&&n.status==='revisit'&&!n.children.length:undefined,[search,recheckOnly]);
 const rows=useMemo(()=>tree?visibleRows(tree,open,filter):[],[tree,open,filter]);
 const kinds=useMemo(()=>new Set<GraphLink['kind']>(related?['prereq','related']:['prereq']),[related]);
 // Fixed 44px rows allow windowing without a new dependency. Keep a generous
 // overscan for keyboard focus and scrolling, and preserve total scroll height.
 const virtual=rows.length>200;
 const first=virtual?Math.max(0,Math.floor(scrollTop/44)-12):0;
 const last=virtual?Math.min(rows.length,Math.ceil((scrollTop+viewportHeight)/44)+12):rows.length;
 const visible=virtual?rows.slice(first,last):rows;
 const stickyParent=virtual&&first>0&&tree?ancestors(tree,rows[Math.min(first,rows.length-1)].id).at(-1):null;
 const focus=useMemo(()=>tree&&selectedId&&tree.nodes.has(selectedId)?focusOn(tree,selectedId):null,[tree,selectedId]);
 const arcBudget=useMemo(()=>{
  if(!tree)return {visible:[],hidden:0};
  // When every visible branch is unfolded and no idea is selected, the
  // 60-arc gutter intentionally hides the extreme graph. Count bundles
  // without constructing 8,000 link arrays or sorting invisible arcs.
  if(!focus&&tree.links.length>60&&!rows.some(row=>{
   const node=tree.nodes.get(row.id);
   return !!node?.children.length&&!open.has(node.id);
  })){
   const count=arcCountFor(tree,rows,kinds);
   if(count>60)return {visible:[],hidden:count};
  }
  return budgetArcs(tree,rows,open,arcsFor(tree,rows,kinds),focus);
 },[tree,rows,open,kinds,focus]);
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
  setExpanded(prev=>new Set([...(prev??initialOpen),...ancestors(tree,id)]));
  // Scroll to the target's absolute row before asking the windowed list for
  // its element; otherwise a distant idea does not exist in the DOM yet.
  const expandedPath=new Set([...open,...ancestors(tree,id)]);
  const targetRows=visibleRows(tree,expandedPath);
  const targetIndex=targetRows.findIndex(row=>row.id===id);
  if(targetIndex>=0&&targetRows.length>200&&scroller.current){
   scroller.current.scrollTop=Math.max(0,targetIndex*44-scroller.current.clientHeight/2);
   setScrollTop(scroller.current.scrollTop);
  }
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const el=scroller.current?.querySelector(`[data-atlas-row="${CSS.escape(id)}"]`);
   el?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }));
 },[tree,open,initialOpen]);
 const trace=(id:string)=>{reveal(id);select(id,false)};
 const toggle=(id:string)=>setExpanded(prev=>{const next=new Set(prev??initialOpen);if(next.has(id))next.delete(id);else next.add(id);return next});
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
  if(!tree||focusSlug===seen.current)return;
  seen.current=focusSlug;
  if(!focusSlug||focusSlug===written.current)return;
  written.current=focusSlug;
  const found=[...tree.nodes.values()].find(n=>n.slug===focusSlug);
  if(found){reveal(found.id);setSelectedId(found.id);setDetails(true)}
 },[tree,focusSlug,reveal]);
 const depthOf=useMemo(()=>{
  if(!tree)return null;
  for(const d of [1,2,3]){const set=expandedToDepth(tree,d);if(set.size===open.size&&[...set].every(x=>open.has(x)))return d}
  const all=[...tree.nodes.values()].filter(n=>n.children.length);
  return all.every(n=>open.has(n.id))?99:null;
 },[tree,open]);
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
    <div className="min-w-0 flex-1"><h1 className="font-serif text-[28px] leading-[31px] font-medium">Atlas</h1>
     <p className="text-caption text-ink-3" style={clip}>{ideas} ideas · {tree.links.filter(l=>l.kind==='prereq').length} links · {[...tree.nodes.values()].filter(n=>!n.synthetic&&n.status==='demonstrated').length} demonstrated</p></div>
    <button type="button" aria-label="Find an idea" aria-pressed={searching} onClick={()=>{setSearching(v=>!v);if(searching)setSearch('')}}
     className="flex size-11 items-center justify-center rounded-ctl"><Search size={19}/></button>
   </div>
   {searching&&<div className="pb-2"><input autoFocus aria-label="Find an idea" placeholder="Find an idea" value={search} onChange={e=>setSearch(e.target.value)}
    className="min-h-11 w-full rounded-ctl border border-edge bg-[var(--card)] px-3 text-body"/></div>}
   <div className="flex flex-wrap items-center gap-2 pb-2" role="toolbar" aria-label="Atlas view">
    <div role="group" aria-label="Fold to depth" className="flex max-w-full overflow-x-auto rounded-full bg-[var(--paper-2)]">
     {([['Fields',1],['Areas',2],['Topics',3],['All',99]] as const).map(([label,d])=><button key={d} type="button" aria-pressed={depthOf===d} title={d===99?'Unfold everything':'Fold to '+label.toLowerCase()} onClick={()=>{if(d===99&&ideas>300){setConfirmAll(true);return}setExpanded(d===99?new Set([...tree.nodes.values()].filter(n=>n.children.length).map(n=>n.id)):expandedToDepth(tree,d))}}
      className={'min-h-11 min-w-11 shrink-0 rounded-full px-2 text-label '+(depthOf===d?'bg-[var(--ink)] text-[var(--paper)]':'text-ink-2')}>{label}</button>)}
    </div>
    <button type="button" aria-pressed={related} onClick={()=>setRelated(v=>!v)}
     className={'flex min-h-11 min-w-11 items-center gap-1.5 rounded-full px-3 text-label '+(related?'bg-[var(--paper-2)] font-semibold text-ink':'text-ink-2')}>
     <svg width="16" height="6" aria-hidden="true"><path d="M1 3H15" stroke="currentColor" strokeDasharray="2 3" strokeLinecap="round"/></svg>Related</button>
    {recheckCount>0&&<button type="button" aria-pressed={recheckOnly} aria-label={'Re-check '+recheckCount} title="Ideas due for a re-check" onClick={()=>setRecheckOnly(v=>!v)}
     className={'flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 text-label tabular-nums '+(recheckOnly?'bg-[var(--paper-2)] font-semibold text-[var(--late)]':'text-[var(--late)]')}>
     <RotateCcw size={14}/>Re-check {recheckCount}</button>}
   </div>
  </header>
  <div ref={scroller} onScroll={e=>setScrollTop(e.currentTarget.scrollTop)} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-24" data-atlas-stage="true">
   {tree.roots.length===0?<div className="flex h-full items-center justify-center"><EmptyState art="compass" title="Your Atlas is empty" body="Ideas appear here as your plans grow."/></div>
   :rows.length===0?<p className="px-4 py-10 text-center text-body text-ink-3">{search?'No idea matches “'+search+'”.':'Nothing to re-check.'}</p>
   :<>
    {stickyParent&&<div className="sticky top-0 z-10 h-0 pointer-events-none" aria-label="Current branch"><div className="flex h-11 items-center border-b border-edge bg-raised/95 px-3 text-label font-semibold text-ink-2"><span className="truncate">{plainMath(tree.nodes.get(stickyParent)?.name??'')}</span></div></div>}
    <div className="relative" role="tree" aria-label="Ideas and their links" style={virtual?{height:rows.length*44}:undefined}>
    <div style={virtual?{position:"absolute",top:first*44,left:0,right:0}:undefined}>
    {visible.map(row=>{const node=tree.nodes.get(row.id)!;
     return <Row key={row.id} node={node} open={!!filter||open.has(row.id)} tone={rowTone(tree,row.id,focus,selectedId,!filter&&!open.has(row.id))} match={row.match}
      onToggle={()=>{if(!filter)toggle(row.id)}} onSelect={()=>onRow(node)}/>})}
    </div>
    {arcBudget.visible.length>0&&<Wires arcs={arcBudget.visible} rows={rows.length} focus={focus}/>}
   </div></>}
   {arcBudget.hidden>0&&<p role="status" className="px-4 py-2 text-caption text-ink-3">{arcBudget.hidden} links hidden — fold or select an idea to trace connections.</p>}
   {rows.length>0&&<div aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 text-caption text-ink-3">
    <span className="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden="true"><path d="M1 4H19M15 1L19 4L15 7" fill="none" stroke="var(--ink-3)" strokeWidth="1.3"/></svg>needed for</span>
    <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-[var(--grade-good)]"/>builds on</span>
    <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-[var(--accent)]"/>opens up</span>
    <span className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="var(--accent)"/></svg>demonstrated</span>
    <span className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="var(--hard)" strokeWidth="1.8" strokeDasharray="2.4 1.8"/></svg>re-check</span>
   </div>}
  </div>
  {selected&&!details&&<div data-atlas-peek="true" className="absolute inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-[528px] items-center gap-2 rounded-slab border border-edge bg-[var(--paper)] py-2 pl-4 pr-2">
   <div className="min-w-0 flex-1">
    <p style={clip} className="text-body font-semibold"><Tex source={selected.name}/></p>
    <p style={clip} className="text-caption text-ink-3">
     <span style={{color:'var(--link)'}}>builds on {focus?.up.size??0}</span> · <span style={{color:'var(--accent)'}}>opens up {focus?.down.size??0}</span>
     {near&&near.related.length>0?' · '+near.related.length+' related':''}</p>
   </div>
   <button type="button" onClick={()=>setDetails(true)} className="flex min-h-11 items-center gap-1.5 rounded-btn border border-edge-2 px-3 text-label"><Info size={15}/>Details</button>
   <button type="button" aria-label="Clear selection" onClick={()=>select(null)} className="flex size-11 items-center justify-center rounded-ctl text-ink-2"><X size={18}/></button>
  </div>}
  {selected&&details&&<Details tree={tree} node={selected} onClose={()=>setDetails(false)} onTrace={trace}/>}
  <Sheet open={confirmAll} onClose={()=>setConfirmAll(false)} title="Unfold every idea?">
   <p className="text-body text-ink-2">This Atlas contains {ideas} ideas. Showing every branch may be slower; folded groups keep the connections readable.</p>
   <div className="mt-4 flex gap-2">
    <button type="button" onClick={()=>setConfirmAll(false)} className="min-h-11 flex-1 rounded-btn border border-edge px-3 text-body">Keep folded</button>
    <button type="button" onClick={()=>{setExpanded(new Set([...tree.nodes.values()].filter(n=>n.children.length).map(n=>n.id)));setConfirmAll(false)}} className="min-h-11 flex-1 rounded-btn border border-amber-line px-3 text-body text-amber">Unfold all</button>
   </div>
  </Sheet>
 </main>;
}
