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
import {STORE,clip,statusName,toneColor,StatusMark,MemoWires,Row} from './Outline';
import {resolveAtlasDeepLink} from './deep-link';
import {atlasRowAt,buildAtlasRowGeometry} from './rowGeometry';
import {atlasFoldDepth} from './depthOf';
import {ancestors,arcCountFor,arcsFor,budgetArcs,budgetArcsUnfocused,buildAtlasTree,expandedToDepth,initialExpanded,focusOn,matches,neighbours,rowTone,visibleRows} from './tree';


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
   {area&&<p data-atlas-area-heading="true" className="mt-2 min-w-0 max-w-full overflow-x-auto text-[13.5px] font-semibold text-ink-3"><Tex source={area} className="text-[16px] leading-6"/></p>}
   {members.map(item=><button key={item.id} type="button" onClick={()=>onTrace(item.id)}
    className="flex min-h-11 w-full items-center gap-2 border-b border-edge text-left text-body">
    <StatusMark node={item}/><span style={clip} className="min-w-0 flex-1"><Tex source={item.name}/></span>
    <ChevronRight size={14} className="shrink-0 text-ink-3"/></button>)}
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
   {path.length>0&&<AtlasDetailsPath names={path.map(p=>p.name)} onSelect={index=>onTrace(path[index].id)}/>}
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
     className="inline-flex min-h-11 min-w-11 items-center text-label text-ink-2 underline decoration-[var(--ink-3)] underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2">Checkpoint {ref.code}</Link>)}
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
 const [ambiguousIds,setAmbiguousIds]=useState<string[]>([]);
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
 const geometry=useMemo(()=>buildAtlasRowGeometry(rows.map(row=>tree?.nodes.get(row.id)?.level??'planet')),[rows,tree]);
 // Window all outlines above 40 rows, including the normal 82-row demo.
 // FIX #519b additionally requires every Field in a moderate (≤150-node)
 // outline to remain keyboard/screen-reader reachable. Mount only those
 // off-window Field rows at their true absolute offsets, rather than
 // disabling virtualization for every child in the moderate outline.
 const virtual=rows.length>40;
 const first=virtual?Math.max(0,atlasRowAt(geometry.offsets,scrollTop)-8):0;
 const last=virtual?Math.min(rows.length,atlasRowAt(geometry.offsets,scrollTop+viewportHeight)+9):rows.length;
 // A virtual Field must remain a genuine 56px visual heading even after its
 // original row leaves the mounted window. Derive its identity from logical
 // row offsets, never from the overscan row's nearest (often Topic) ancestor.
 const fieldRows=useMemo(()=>rows.flatMap((row,index)=>tree?.nodes.get(row.id)?.level==='cluster'?[index]:[]),[rows,tree]);
 // One sorted, keyed absolute row list keeps moderate Fields permanently
 // mounted, in logical screen-reader order, even as the viewport moves.
 // Unlike switching a Field between separate offscreen/window containers,
 // reconciliation never unmounts its focused 44px keyboard control.
 const mountedIndices=useMemo(()=>{
  if(!virtual)return [];
  const indices=new Set<number>();
  for(let index=first;index<last;index++)indices.add(index);
  if(tree&&tree.nodes.size<=150)for(const index of fieldRows)indices.add(index);
  return [...indices].sort((a,b)=>a-b);
 },[virtual,first,last,fieldRows,tree]);
 const activeFieldIndex=fieldRows.filter(index=>geometry.offsets[index]<=scrollTop).at(-1)??-1;
 const activeField=virtual&&activeFieldIndex>=0?tree?.nodes.get(rows[activeFieldIndex].id):null;
 const nextFieldIndex=fieldRows.find(index=>index>activeFieldIndex);
 const stickyField=activeField&&scrollTop>geometry.offsets[activeFieldIndex]?activeField:null;
 const stickyPush=nextFieldIndex===undefined?0:Math.min(0,geometry.offsets[nextFieldIndex]-scrollTop-56);
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
  if(!focus)return budgetArcsUnfocused(tree,rows,open,kinds);
  return budgetArcs(tree,rows,open,arcsFor(tree,rows,kinds),focus);
 },[tree,rows,open,kinds,focus]);
 const selected=selectedId?tree?.nodes.get(selectedId)??null:null;
 const {ideas,demonstrated,links,recheckCount}=useMemo(()=>{
  let ideas=0,demonstrated=0,links=0,recheckCount=0;
  if(tree){
   for(const node of tree.nodes.values()){
    if(node.synthetic)continue;
    ideas++;
    if(node.status==='demonstrated')demonstrated++;
    if(!node.children.length&&node.status==='revisit')recheckCount++;
   }
   for(const link of tree.links)if(link.kind==='prereq')links++;
  }
  return {ideas,demonstrated,links,recheckCount};
 },[tree]);

 const written=useRef<string|null>(null);
 const select=useCallback((id:string|null,openDetails=false)=>{
  setSelectedId(id);setDetails(!!id&&openDetails);setAmbiguousIds([]);
  const next=new URLSearchParams(params),node=id?tree?.nodes.get(id):null;
  const real=node&&!node.synthetic?node:null;
  written.current=real?.id??null;
  // A manual selection supersedes every incoming name fallback. The stable
  // concept ID makes a copied link unambiguous across subjects.
  next.delete('name');
  if(real){next.set('focus',real.slug);next.set('id',real.id)}
  else {next.delete('focus');next.delete('id')}
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
  if(targetIndex>=0&&targetRows.length>40&&scroller.current){
   const targetGeometry=buildAtlasRowGeometry(targetRows.map(row=>tree.nodes.get(row.id)?.level??'planet'));
   scroller.current.scrollTop=Math.max(0,targetGeometry.offsets[targetIndex]-scroller.current.clientHeight/2);
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
 const renderRow=(row:typeof rows[number],sticky:boolean)=>{
  if(!tree)return null;
  const node=tree.nodes.get(row.id)!;
  return <Row key={row.id} node={node} sticky={sticky}
   open={!!filter||open.has(row.id)}
   tone={rowTone(tree,row.id,focus,selectedId,!filter&&!open.has(row.id))}
   match={row.match} focused={!!focus}
   onToggle={()=>{if(!filter)toggle(row.id)}} onSelect={()=>onRow(node)}/>;
 };
 const focusSlug=params.get('focus'),focusName=params.get('name'),focusId=params.get('id');
 const seen=useRef<string|null>(null);
 useEffect(()=>{
  const incoming=(focusId??'')+'|'+(focusSlug??'')+'|'+(focusName??'');
  if(!tree||incoming===seen.current)return;
  seen.current=incoming;
  if(!focusId&&!focusSlug&&!focusName)return;
  // A missing id is not a previously handled selection: legacy slug-only
  // links must still resolve on the first Atlas mount.
  if(focusId&&focusId===written.current&&!focusName)return;
  written.current=focusId;
  const result=resolveAtlasDeepLink(tree.nodes.values(),{id:focusId,slug:focusSlug,name:focusName});
  if(result.kind==='found'){
   setAmbiguousIds([]);reveal(result.id);setSelectedId(result.id);setDetails(true);
  }else if(result.kind==='ambiguous'){
   setSelectedId(null);setDetails(false);setAmbiguousIds(result.ids);
  }else{
   // Missing targets must lead to an editable search, never to an unrelated idea.
   setAmbiguousIds([]);setSearching(true);setSearch(focusName??focusSlug??'');
  }
 },[tree,focusId,focusSlug,focusName,reveal]);
 const depthOf=useMemo(()=>tree?atlasFoldDepth(tree,open):null,[tree,open]);
 const near=selected&&tree?neighbours(tree,selected.id):null;

 if(query.isPending)return <main aria-label="Atlas" className="h-dvh p-4"><Skeleton h={52}/><div className="mt-5"><Skeleton h="65%"/></div></main>;
 if(query.error||!tree)return <main aria-label="Atlas" className="h-dvh p-4">
  <button type="button" className="min-h-11" onClick={()=>navigate(-1)}>Back</button>
  <EmptyState art="plug" title="Could not open Atlas" body="Check your connection." action={{label:'Try again',onClick:()=>void query.refetch()}}/></main>;

 return <main aria-label="Atlas" className="relative flex h-dvh flex-col text-ink">
  <header className={'z-20 shrink-0 border-b border-edge bg-obsidian/95 px-3 '+(getMode()==='demo'?'pt-[calc(env(safe-area-inset-top)+30px)]':'pt-[env(safe-area-inset-top)]')}>
   <div className="flex min-h-14 items-center gap-2 py-1">
    <button type="button" aria-label="Back" onClick={()=>navigate(-1)} className="flex size-11 items-center justify-center rounded-ctl"><ArrowLeft size={19}/></button>
    <div className="min-w-0 flex-1"><h1 className="font-serif text-[28px] leading-[31px] font-medium">Atlas</h1>
     <p data-atlas-summary className="whitespace-normal break-words text-caption leading-[18px] text-ink-3">{ideas} ideas · {links} links · {demonstrated} demonstrated</p></div>
    <button type="button" aria-label="Find an idea" aria-pressed={searching} onClick={()=>{setSearching(v=>!v);if(searching)setSearch('')}}
     className="flex size-11 items-center justify-center rounded-ctl"><Search size={19}/></button>
   </div>
   {searching&&<div className="pb-2"><input autoFocus aria-label="Find an idea" placeholder="Find an idea" value={search} onChange={e=>setSearch(e.target.value)}
    className="min-h-11 w-full rounded-ctl border border-edge bg-[var(--card)] px-3 text-body"/></div>}
   <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-2" role="toolbar" aria-label="Atlas view">
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
  <div ref={scroller} onScroll={e=>setScrollTop(e.currentTarget.scrollTop)} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--paper)] pb-24" data-atlas-stage="true">
   {tree.roots.length===0?<div className="flex h-full items-center justify-center"><EmptyState art="compass" title="Your Atlas is empty" body="Ideas appear here as your plans grow."/></div>
   :rows.length===0?<p className="px-4 py-10 text-center text-body text-ink-3">{search?'No idea matches “'+search+'”.':'Nothing to re-check.'}</p>
   :<>
    {stickyField&&<div className="sticky top-0 z-20 h-0 pointer-events-none" style={{transform:`translateY(${stickyPush}px)`}}>
     <div data-atlas-sticky-field="true" aria-label="Current Field"
      className="flex h-14 items-center gap-2 border-b border-[var(--hair)] bg-[var(--paper)] px-3 text-ink">
      {stickyField.glyph&&<span aria-hidden="true" className="shrink-0 font-math text-[22px] text-[var(--accent)]">{stickyField.glyph}</span>}
      <span className="min-w-0 flex-1 font-serif text-[21px] italic leading-[24px]" style={clip}><Tex source={stickyField.name}/></span>
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] tabular-nums text-ink-3">
       <span aria-hidden="true" className="h-1.5 w-11 overflow-hidden rounded-full bg-[var(--paper-2)]">
        <span className="block h-full rounded-full bg-[var(--ink-2)]" style={{width:(stickyField.total?100*stickyField.done/stickyField.total:0)+'%'}}/>
       </span>
       {stickyField.done}/{stickyField.total}
      </span>
     </div>
    </div>}
    <div className="relative flow-root" role="tree" aria-label="Ideas and their links" data-atlas-field-count={tree.roots.length} data-atlas-row-count={rows.length} style={virtual?{height:geometry.totalHeight}:undefined}>
    {virtual?mountedIndices.map(index=><div key={rows[index].id}
     className="absolute inset-x-0 flow-root" style={{top:geometry.offsets[index]}}>
     {renderRow(rows[index],false)}
    </div>):rows.map(row=>renderRow(row,true))}
    {arcBudget.visible.length>0&&<MemoWires arcs={arcBudget.visible} rows={rows.length} focus={focus} centers={geometry.centers} heightPx={geometry.totalHeight}/>}
   </div></>}
   {arcBudget.hidden>0&&<p role="status" className="px-4 py-2 text-caption text-ink-3">{arcBudget.hidden} links hidden — fold or select an idea to trace connections.</p>}
   {rows.length>0&&<div aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 text-caption text-ink-3">
    <span className="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden="true"><path d="M1 4H19M15 1L19 4L15 7" fill="none" stroke="var(--ink-3)" strokeWidth="1.3"/></svg>needed for</span>
    <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-[var(--link)]"/>builds on</span>
    <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-[var(--accent)]"/>opens up</span>
    <span className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="var(--ink-2)"/></svg>demonstrated</span>
    <span className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="var(--late)" strokeWidth="1.8" strokeDasharray="2.4 1.8"/></svg>re-check</span>
   </div>}
  </div>
  {selected&&!details&&<div data-atlas-peek="true" className="absolute inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-[528px] items-center gap-2 rounded-slab border border-edge-2 bg-[var(--paper)] py-2 pl-4 pr-2">
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
  <Sheet open={ambiguousIds.length>1} onClose={()=>{setAmbiguousIds([]);select(null)}} title="Choose an idea">
   <p className="text-body text-ink-2">Several subjects have an idea with this name. Choose the intended subject; no idea has been selected automatically.</p>
   <div className="mt-3 flex flex-col gap-2">
    {ambiguousIds.map(id=>{
     const node=tree.nodes.get(id);
     if(!node)return null;
     const subject=graph?.subjects.find(item=>item.id===node.subjectId)?.name??'Unknown subject';
     return <button key={id} type="button"
      aria-label={plainMath(node.name)+' in '+plainMath(subject)}
      onClick={()=>{setAmbiguousIds([]);reveal(id);select(id,true)}}
      className="flex min-h-11 min-w-0 flex-col items-start rounded-ctl border border-edge px-3 py-2 text-left">
      <span className="max-w-full overflow-x-auto text-body font-medium"><Tex source={node.name}/></span>
      <span className="text-caption text-ink-2"><Tex source={subject}/></span>
     </button>;
    })}
   </div>
  </Sheet>
  <Sheet open={confirmAll} onClose={()=>setConfirmAll(false)} title="Unfold every idea?">
   <p className="text-body text-ink-2">This Atlas contains {ideas} ideas. Showing every branch may be slower; folded groups keep the connections readable.</p>
   <div className="mt-4 flex gap-2">
    <button type="button" onClick={()=>setConfirmAll(false)} className="min-h-11 flex-1 rounded-btn border border-edge px-3 text-body">Keep folded</button>
    <button type="button" onClick={()=>{setExpanded(new Set([...tree.nodes.values()].filter(n=>n.children.length).map(n=>n.id)));setConfirmAll(false)}} className="min-h-11 flex-1 rounded-btn border border-amber-line px-3 text-body text-amber">Unfold all</button>
   </div>
  </Sheet>
 </main>;
}
