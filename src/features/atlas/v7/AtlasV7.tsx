import {useStudyUi} from '../../../data/StudyUiRelease';
import {reviewHref} from '../../../data/review-target';
import {useEffect,useMemo,useRef,useState,type KeyboardEvent,type PointerEvent as ReactPointerEvent} from 'react';
import {useMotionReduced} from '../../../ui/v7/effects';
import {Link,useLocation,useNavigate,useSearchParams} from 'react-router';
import {ChevronDown,ChevronLeft,ChevronRight,ChevronUp,Crosshair,Eye,EyeOff,Layers2,List,Minus,Plus,Search,X} from 'lucide-react';
import {useAtlas,useHome} from '../../../data/hooks';
import {getApi} from '../../../data';
import {FastTex} from '../../../ui/FastTex';
import {Button,IconButton} from '../../../ui/v7/components';
import {Dock} from '../../../ui/v7/Dock';
import {ErrorEmblem} from '../../../ui/v7/KitPrimitives';
import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {tutorHref} from '../../tutor/tutorHref';
import {SubjectMark,subjectClass} from '../../../ui/v7/Subject';
import ConceptPin from '../v6/ConceptPin';
import AtlasCommands from '../v6/AtlasCommands';
import AtlasImpactPreview from '../v6/ImpactPreview';
import AtlasMap,{type AtlasMapHandle} from './AtlasMap';
import {computeLayout,layoutInput,type LayoutSource} from './layoutClient';
import type {LayoutResult} from './layout';
import {alphabetical,atlasSummary,buildAtlasModel,checkpointName,searchStars,starCounts,stateLabel,type AtlasModel,type StarState} from './model';
import './atlas.css';
import {isFlagOn} from '../../../flags';
import {matchesFilter,type AtlasFilter} from './filters';
import {rememberRoomItem} from '../../../ui/v7/room';
import {ConceptFacets} from '../../adaptive/panels/ConceptFacets';
import {typedEdges} from './typedLinks';
import {AtlasLayerContent,AtlasLayers,usedBridges} from '../../adaptive/panels/AtlasLayers';
import {useAtlasModel} from '../../../data/adaptive/atlas-api';

/** The peek height, and the floating dock's height (tab bar, margins) the map keeps clear. */
const PAGE=200,PEEK=190;
const legendOrder:StarState[]=['demonstrated','in_progress','up_next','revisit','not_started'];

// A1: the system setting or Settings › Reduce effects (src/ui/v7/effects.ts).
const useReducedMotion=useMotionReduced;
/** The same five marks as the canvas, drawn in SVG for the list, the sheet and the legend. */
export function StarMark({state,subjectClassName}:{state:StarState;subjectClassName:string}){
 const star='M10 2.2l2.2 5 5.4.5-4.1 3.6 1.2 5.3L10 13.9l-4.7 2.7 1.2-5.3-4.1-3.6 5.4-.5z';
 return <svg viewBox="0 0 20 20" className={'v7-atlas-mark '+subjectClassName} data-state={state} aria-hidden="true">
  {state==='demonstrated'&&<path d={star} className="v7-atlas-mark-fill"/>}
  {state==='in_progress'&&<><circle cx="10" cy="10" r="6.5" className="v7-atlas-mark-ring"/><path d="M10 4.5a5.5 5.5 0 0 0 0 11z" className="v7-atlas-mark-fill"/></>}
  {state==='up_next'&&<path d={star} className="v7-atlas-mark-outline"/>}
  {/* KC18: review due is ↻ in the warning colour; a conjecture (not started) is a hollow ○ with a border.default edge. */}
  {state==='revisit'&&<><path d="M15.8 7.2A6.4 6.4 0 1 0 16.2 12" className="v7-atlas-mark-warning"/><path d="M16.6 3.6v3.9h-3.9" className="v7-atlas-mark-warning"/></>}
  {state==='not_started'&&<circle cx="10" cy="10" r="4.5" className="v7-atlas-mark-hollow"/>}
 </svg>;
}
function StateChip({state}:{state:StarState}){
 const tone=state==='demonstrated'?'demonstrated':state==='revisit'?'review':state==='in_progress'?'progress':'conjecture';
 const symbol={demonstrated:'∎',in_progress:'◐',up_next:'☆',revisit:'↻',not_started:'○'}[state];
 return <span className={'v7-badge v7-proof-'+tone}><span className="v7-proof-symbol" aria-hidden="true">{symbol}</span><span>{stateLabel[state]}</span></span>;
}
function SubjectTag({model,index}:{model:AtlasModel;index:number}){
 const cluster=model.clusters.find(entry=>entry.index===model.stars[index].cluster);
 if(!cluster)return null;
 return <span className={'v7-tag '+subjectClass(cluster.subject)}><SubjectMark subject={cluster.subject}/><span>{cluster.name}</span></span>;
}

function ConceptSheet({model,index,expanded,onExpand,onClose,onPick,onPin,onEdit,onPreview}:{
 model:AtlasModel;index:number;expanded:boolean;onExpand:(open:boolean)=>void;onClose:()=>void;onPick:(index:number)=>void;
 onPin:()=>void;onEdit:()=>void;onPreview:()=>void;
}){
 const studyRepair=useStudyUi();
 const star=model.stars[index],checkpoint=star.checkpoints[0];
 const drag=useRef<{y:number;moved:boolean}|null>(null),dragged=useRef(false),[offset,setOffset]=useState(0);
 const sheetRef=useRef<HTMLElement|null>(null);
 // The map's legend and controls sit above the sheet: tell them how tall it really is.
 useEffect(()=>{
  const node=sheetRef.current,root=node?.closest<HTMLElement>('.v7-atlas');
  if(!node||!root||typeof ResizeObserver==='undefined')return;
  const apply=()=>root.style.setProperty('--v7-atlas-sheet-h',Math.ceil(node.getBoundingClientRect().height)+'px');
  apply();
  const observer=new ResizeObserver(apply);observer.observe(node);
  return ()=>{observer.disconnect();root.style.removeProperty('--v7-atlas-sheet-h');};
 },[]);
 const needs=model.edges.filter(edge=>edge.to===index&&edge.kind==='prereq').map(edge=>edge.from);
 const opens=model.edges.filter(edge=>edge.from===index&&edge.kind==='prereq').map(edge=>edge.to);
 const related=model.neighbours[index].filter(other=>!needs.includes(other)&&!opens.includes(other));
 const handleDown=(event:ReactPointerEvent<HTMLButtonElement>)=>{drag.current={y:event.clientY,moved:false};event.currentTarget.setPointerCapture?.(event.pointerId);};
 const handleMove=(event:ReactPointerEvent<HTMLButtonElement>)=>{const state=drag.current;if(!state)return;const dy=event.clientY-state.y;if(Math.abs(dy)>6)state.moved=true;if(state.moved)setOffset(Math.max(expanded?0:-120,dy));};
 // Drag the handle: up expands, down collapses, and down from the peek closes the sheet.
 const handleUp=(event:ReactPointerEvent<HTMLButtonElement>)=>{
  const state=drag.current;drag.current=null;setOffset(0);dragged.current=!!state?.moved;if(!state?.moved)return;
  const dy=event.clientY-state.y;
  if(dy<-40)onExpand(true);else if(dy>60&&!expanded)onClose();else if(dy>40)onExpand(false);
 };
 const group=(title:string,items:number[])=>items.length>0&&<div className="v7-atlas-neighbours">
  <h3 className="v7-atlas-eyebrow">{title} · {items.length}</h3>
  <ul>{items.map(other=><li key={model.stars[other].id}><button type="button" onClick={()=>onPick(other)}>
   <StarMark state={model.stars[other].state} subjectClassName={subjectClass(model.clusters.find(c=>c.index===model.stars[other].cluster)?.subject??'Other')}/>
   <span className="v7-atlas-row-name"><FastTex source={model.stars[other].name}/></span><ChevronRight aria-hidden="true"/></button></li>)}</ul>
 </div>;
 return <section ref={sheetRef} className="v7-atlas-sheet" data-expanded={expanded} aria-labelledby="v7-atlas-sheet-title"
  style={offset?{transform:`translateY(${offset}px)`}:undefined}>
  <div className="v7-atlas-sheet-head">
   <h2 id="v7-atlas-sheet-title" tabIndex={-1} className="v7-atlas-sheet-title"><FastTex source={star.name}/></h2>
   <div className="v7-atlas-sheet-controls">
    <button type="button" className="v7-icon-button v7-atlas-handle" aria-expanded={expanded} aria-controls="v7-atlas-sheet-more"
     aria-label={expanded?'Show less':'Show neighbours and actions'} onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp}
     onPointerCancel={()=>{drag.current=null;setOffset(0);}}
     onClick={()=>{if(dragged.current){dragged.current=false;return;}onExpand(!expanded);}}>
     {expanded?<ChevronDown aria-hidden="true"/>:<ChevronUp aria-hidden="true"/>}
    </button>
    <IconButton label="Close details" onClick={onClose}><X aria-hidden="true"/></IconButton>
   </div>
  </div>
  <div className="v7-atlas-sheet-meta"><StateChip state={star.state}/><SubjectTag model={model} index={index}/></div>
  <p className={expanded?"v7-atlas-counts":"v7-sr-only"} data-testid="atlas-counts">{starCounts(model,index)}</p>
  <div className="v7-atlas-actions">
   {checkpoint&&<Link className="v7-button v7-primary v7-small" to={tutorHref(checkpoint.projectSlug,checkpoint.code)}>Continue with tutor</Link>}
   {star.due>0&&<Link className="v7-button v7-secondary v7-small" to={studyRepair?reviewHref({kind:'concept',id:star.id}):'/review/run?concept='+encodeURIComponent(star.slug)}>Review {star.due}</Link>}
   {expanded&&checkpoint&&<Link className="v7-button v7-secondary v7-small" to={'/p/'+checkpoint.projectSlug+'/cp/'+checkpoint.code}
     aria-label={'Open '+checkpointName(checkpoint.code)}>Open checkpoint</Link>}
  </div>
  {expanded&&<div id="v7-atlas-sheet-more" className="v7-atlas-sheet-more">
   <ConceptFacets id={star.id}/>
   {group('Needs',needs)}{group('Opens up',opens)}{group('Related',related)}
   {model.neighbours[index].length===0&&<p className="v7-atlas-meta">No connections yet.</p>}
   <div className="v7-atlas-more-actions">
    <Button small onClick={onPin}>{star.pin?'Edit map pin':'Pin on map'}</Button>
    <Button small onClick={onEdit}>Edit concept</Button>
    <Button small onClick={onPreview}>Preview edits</Button>
   </div>
  </div>}
 </section>;
}

/** R2 · F12: past this many concepts or links the map becomes a hairball on a phone, so the list is the default. */
const TYPED_LINKS_KEY='lemma.atlas.typed-links';
export function atlasTooDense(stars:number,edges:number):boolean{return stars>250||edges>600;}
/** v7 Atlas (PLAN §6.12): a seeded, searchable star map with a list view for assistive technology. */
export default function AtlasV7(){
 const studyRepair=useStudyUi();
 const [legacyView,setLegacyView]=useState<'map'|'themes'|'bridges'>('map'),[atlasFilter,setAtlasFilter]=useState<AtlasFilter>('all'),[atlasKind,setAtlasKind]=useState<string>('any');
 const room=isFlagOn('v7Room'),home=useHome();
 const [subset,setSubset]=useState<'All'|'Tonight'|'Shaky'|'Demonstrated'>('All');
 const [stale,setStale]=useState(false),[layers,setLayers]=useState(false);
 // N227: Atlas V3's typed links on the map, an optional view kept per device.
 const [typedOn,setTypedOn]=useState(()=>{try{return localStorage.getItem(TYPED_LINKS_KEY)==='1';}catch{return false;}});
 const showTyped=(on:boolean)=>{setTypedOn(on);try{localStorage.setItem(TYPED_LINKS_KEY,on?'1':'0');}catch{/* the view still changes */}};
 const [mapFrame,setMapFrame]=useState<'initial'|'here'|'all'>('initial'),allSky=mapFrame==='all';
 const [panning,setPanning]=useState(false);
 const query=useAtlas(),navigate=useNavigate(),location=useLocation(),[params,setParams]=useSearchParams();
 const repair=studyRepair,urlView=params.get('view');
 const requestedLayer=repair?(urlView==='themes'||urlView==='bridges'?urlView:'map'):legacyView;
 const setAtlasView=(value:'map'|'themes'|'bridges')=>{
  if(!repair){setLegacyView(value);return;}
  const next=new URLSearchParams(params);next.set('view',value);setParams(next);
 };
 const atlasModel=useAtlasModel();
 const atlasView=requestedLayer==='themes'&&atlasModel.data?.themes.length?'themes':
  requestedLayer==='bridges'&&usedBridges(atlasModel.data).length?'bridges':'map';
 const reduced=useReducedMotion();
 const model=useMemo(()=>query.data?buildAtlasModel({...query.data,concepts:query.data.concepts.map(c=>({...c,kind:atlasModel.data?.model.index[c.id]?.kind??c.kind,facets:atlasModel.data?.facets[c.id],gap:atlasModel.data?{p:Math.max(.05,...(atlasModel.data.facets[c.id]??[]).map(f=>f.gap)),lastAt:(d=>d?.length?new Date(d[d.length-1].at).toISOString():null)(atlasModel.data.model.direct[c.id])}:undefined}))}):null,[query.data,atlasModel.data]);
 const typed=useMemo(()=>model&&atlasModel.data?typedEdges(model.stars,atlasModel.data.links??[]):[],[model,atlasModel.data]);
 const focusCluster=useMemo(()=>{
  if(!model)return null;
  const resume=home.data?.resume;
  return model.stars.find(star=>star.state==='in_progress'&&star.checkpoints.some(cp=>cp.projectSlug===resume?.projectSlug))?.cluster
   ??model.stars.find(star=>star.state==='in_progress')?.cluster
   ??model.clusters[0]?.index??null;
 },[model,home.data?.resume]);
 const highlighted=useMemo(()=>{
  if(!model||atlasFilter==='all'&&atlasKind==='any'&&!stale&&subset==='All')return null;
  return model.stars.flatMap((star,index)=>matchesFilter(star,atlasFilter,atlasKind)&&(!stale||star.stale)&&(subset==='All'||(subset==='Tonight'?(star.due>0||star.state==='in_progress'||star.state==='up_next'):subset==='Shaky'?star.state==='revisit':star.state==='demonstrated'))?[index]:[]);
 },[model,atlasFilter,atlasKind,stale,subset]);
 // R2 · F12: a sky too dense to read opens as the list; the map stays one tap away (?view=map).
 const dense=!!model&&atlasTooDense(model.stars.length,model.edges.length);
 const view=urlView==='list'||(dense&&urlView!=='map')?'list':'map';
 const mapVisible=atlasView==='map'&&view==='map';
 const [layout,setLayout]=useState<{model:AtlasModel;result:LayoutResult;source:LayoutSource}|null>(null);
 const [layoutError,setLayoutError]=useState(false);
 const [optionsShown,setOptionsShown]=useState(true);
 const [searching,setSearching]=useState(false),[term,setTerm]=useState(''),[expanded,setExpanded]=useState(false);
 const [shown,setShown]=useState(PAGE);
 const [dialog,setDialog]=useState<null|'pin'|'edit'|'preview'|'new'>(null);
 const map=useRef<AtlasMapHandle>(null),searchInput=useRef<HTMLInputElement>(null),searchButton=useRef<HTMLButtonElement>(null);
 const searchResults=useRef<HTMLUListElement>(null),focusResult=useRef<string|null>(null);
 const listButton=useRef<HTMLButtonElement>(null),optionToggle=useRef<HTMLButtonElement>(null),returnFocusToList=useRef(false);
 useEffect(()=>{
  if(!model||!mapVisible||layout?.model===model)return;
  const job=new AbortController();
  setLayoutError(false);
  // Portrait phones stack the constellations. Reuse the painted layout when returning from List.
  computeLayout(layoutInput(model,'lemma-atlas',typeof innerWidth==='number'&&innerWidth>0?Math.min(2,innerHeight/innerWidth):1),job.signal)
   .then(next=>{if(!job.signal.aborted)setLayout({model,...next});},()=>{if(!job.signal.aborted)setLayoutError(true);});
  return ()=>job.abort();
 },[model,mapVisible,layout?.model]);
 // Deep links: ?id=<concept id>, or the legacy ?focus=<slug>.
 const selected=useMemo(()=>{
  if(!model)return null;
  const id=params.get('id'),slug=params.get('focus');
  const byId=id?model.index.get(id):undefined;
  if(byId!==undefined)return byId;
  const bySlug=slug?model.stars.findIndex(star=>star.slug===slug):-1;
  return bySlug>=0?bySlug:null;
 },[model,params]);
 const update=(next:{view?:'map'|'list';id?:string|null})=>{
  const out=new URLSearchParams(params);
  if(next.view)out.set('view',next.view);
  if(next.id!==undefined){out.delete('focus');if(next.id)out.set('id',next.id);else out.delete('id');}
  setParams(out,{replace:next.view!=='list',state:next.view==='list'?{atlasListFromMap:mapVisible}:location.state});
 };
 const select=(index:number|null,fly=false,openActions=false)=>{
  if(!model)return;
  setExpanded(index!==null&&(view==='list'||openActions));
  if(room&&index!==null)rememberRoomItem({id:'concept:'+model.stars[index].id,group:'Concepts',title:model.stars[index].name,to:'/atlas?id='+encodeURIComponent(model.stars[index].id)});
  update({id:index===null?null:model.stars[index].id});
  if(index!==null&&fly&&mapVisible)map.current?.flyTo(index);
 };
 const closeSearch=()=>{
  setSearching(false);setTerm('');
  requestAnimationFrame(()=>searchButton.current?.focus());
 };
 const pickSearchResult=(index:number)=>{
  if(!model)return;
  setSearching(false);setTerm('');focusResult.current=model.stars[index].id;
  select(index,true,true);
 };
 const onSearchKey=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(event.nativeEvent.isComposing)return;
  if(event.key==='Escape'){
   event.preventDefault();event.stopPropagation();closeSearch();return;
  }
  if(event.key==='Enter'&&event.target===searchInput.current&&results.length){
   event.preventDefault();pickSearchResult(results[0]);return;
  }
  if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
  const buttons=[...(searchResults.current?.querySelectorAll('button')??[])];
  if(!buttons.length)return;
  const active=buttons.indexOf(document.activeElement as HTMLButtonElement);
  event.preventDefault();
  if(event.key==='ArrowUp'&&active===0)searchInput.current?.focus();
  else buttons[active<0?(event.key==='ArrowDown'?0:buttons.length-1):Math.min(buttons.length-1,active+(event.key==='ArrowDown'?1:-1))]?.focus();
 };
 useEffect(()=>{if(searching)searchInput.current?.focus();},[searching]);
 useEffect(()=>{
  if(searching||!focusResult.current||selected===null||model?.stars[selected].id!==focusResult.current)return;
  focusResult.current=null;
  document.getElementById('v7-atlas-sheet-title')?.focus();
 },[model,searching,selected]);
 useEffect(()=>{
  if(view!=='list'||selected===null||!model)return;
  document.getElementById('v7-atlas-row-'+model.stars[selected].id)?.scrollIntoView({block:'nearest'});
 },[view,selected,model]);
 const results=useMemo(()=>model?searchStars(model,term):[],[model,term]);
 const rows=useMemo(()=>model?alphabetical(model).filter(index=>!highlighted||highlighted.includes(index)):[],[model,highlighted]);
 const listedClusters=useMemo(()=>new Set(rows.map(index=>model?.stars[index].cluster)),[model,rows]);
 const back=()=>{
  if(!mapVisible){
   returnFocusToList.current=true;
   setSearching(false);setTerm('');
   if(!repair&&requestedLayer!=='map')setAtlasView('map');
   if(location.state?.atlasListFromMap&&urlView==='list')navigate(-1);
   else update({view:'map'});
  }else if(location.key!=='default')navigate(-1);
  else navigate('/');
 };
 useEffect(()=>{
  if(mapVisible&&returnFocusToList.current){
   returnFocusToList.current=false;
   (optionsShown?listButton.current:optionToggle.current)?.focus();
  }
 },[mapVisible,optionsShown]);
 const refetch=async()=>{await query.refetch();};
 const header=<header className="v7-atlas-bar">
  <IconButton label={mapVisible?'Back':'Back to map'} onClick={back}><ChevronLeft aria-hidden="true"/></IconButton>
  <h1 className="v7-sr-only">Atlas</h1>
  <div className="v7-atlas-option-rail" role="group" aria-label="Atlas options">
   <button type="button" ref={optionToggle} className="v7-icon-button" aria-label={optionsShown?'Hide options':'Show options'}
    title={optionsShown?'Hide options':'Show options'} aria-expanded={optionsShown} aria-controls="v7-atlas-options"
    onClick={()=>{if(optionsShown){setSearching(false);setTerm('');}setOptionsShown(shown=>!shown);}}>
    {optionsShown?<EyeOff aria-hidden="true"/>:<Eye aria-hidden="true"/>}
   </button>
   <div id="v7-atlas-options" className="v7-atlas-controls" hidden={!optionsShown}>
    {searching?<span className="v7-atlas-search-slot" aria-hidden="true"/>:
     <button type="button" ref={searchButton} className="v7-icon-button" aria-label="Search concepts" title="Search concepts" aria-expanded={false}
      onClick={event=>{event.currentTarget.parentElement?.scrollTo({top:0});setSearching(true);}} disabled={!model?.stars.length}><Search aria-hidden="true"/></button>}
    {view==='map'&&<button type="button" ref={listButton} className="v7-icon-button" aria-label="List" title="List" onClick={()=>{setSearching(false);setTerm('');if(!repair&&requestedLayer!=='map')setAtlasView('map');update({view:'list'});}}><List aria-hidden="true"/></button>}
    <IconButton label="Layers" onClick={()=>setLayers(true)} aria-haspopup="dialog" disabled={!model?.stars.length}><Layers2 aria-hidden="true"/></IconButton>
    {mapVisible&&!!model?.stars.length&&<>
     <IconButton label="Recentre map" aria-pressed={allSky} onClick={()=>setMapFrame(allSky?'here':'all')}><Crosshair aria-hidden="true"/></IconButton>
     <div className="v7-atlas-zoom" role="group" aria-label="Map zoom">
      <IconButton label="Zoom in" onClick={()=>map.current?.zoomBy(1.5)}><Plus aria-hidden="true"/></IconButton>
      <IconButton label="Zoom out" onClick={()=>map.current?.zoomBy(1/1.5)}><Minus aria-hidden="true"/></IconButton>
     </div>
     {/* N221 (Owner report): a button for every subject, the one in view marked. */}
     {model.clusters.length>1&&<nav className="v7-atlas-compass" aria-label="Subjects">
      {model.clusters.map(cluster=>
       <IconButton key={cluster.id} label={'Go to '+cluster.name} title={cluster.name} aria-current={!allSky&&cluster.index===focusCluster?'true':undefined}
        onClick={()=>map.current?.flyToCluster(cluster.index)}>
        <SubjectMark subject={cluster.subject}/></IconButton>)}
     </nav>}
    </>}
   </div>
  </div>
  {searching&&model&&<div className="v7-atlas-search" role="search" onKeyDown={onSearchKey}>
   <div className="v7-atlas-search-field">
    <Search aria-hidden="true"/>
    <input ref={searchInput} type="search" aria-label="Find a concept" placeholder="Find a concept" value={term} aria-controls="v7-atlas-search-results"
     onChange={event=>setTerm(event.target.value)}/>
    <IconButton label="Close search" onClick={closeSearch}><X aria-hidden="true"/></IconButton>
   </div>
   <div className="v7-atlas-suggestions">
    {term.trim()&&<p className="v7-atlas-meta" role="status">{results.length} matching {results.length===1?'concept':'concepts'}</p>}
    <ul ref={searchResults} id="v7-atlas-search-results" aria-label="Matching concepts">{results.map(i=><li key={model.stars[i].id}>
     <button type="button" onClick={()=>pickSearchResult(i)}>
      <StarMark state={model.stars[i].state} subjectClassName={subjectClass(model.clusters.find(c=>c.index===model.stars[i].cluster)?.subject??'Other')}/>
      <span className="v7-atlas-row-name"><FastTex source={model.stars[i].name}/></span>
      <span className="v7-atlas-meta">{model.clusters.find(c=>c.index===model.stars[i].cluster)?.name}</span>
     </button></li>)}</ul>
   </div>
  </div>}
 </header>;
 if(query.isPending)return <main id="main-content" className="v7-atlas" aria-label="Atlas" aria-busy="true">{header}
  <p role="status" className="v7-atlas-state">Loading the Atlas…</p></main>;
 if(query.error||!model)return <main id="main-content" className="v7-atlas" aria-label="Atlas">{header}
  <div className="v7-atlas-state" role="alert"><ErrorEmblem/><Button onClick={()=>{void query.refetch();}}>Retry loading the Atlas</Button></div></main>;
 if(model.stars.length===0)return <main id="main-content" className="v7-atlas" aria-label="Atlas" data-view={view} data-options={optionsShown||undefined} data-atlas-layer={view==='list'||dialog!==null||undefined}>{header}
  <div className="v7-atlas-state"><EmptyMoment art="atlas" title="No concepts yet"
   action={home.data?.projects.some(path=>!path.system)?{label:'New concept',onClick:()=>setDialog('new')}
    :{label:'Start a path',to:'/projects/new'}}/></div>
  {dialog==='new'&&query.data&&<AtlasCommands kit graph={query.data} sourceId={null} onClose={()=>setDialog(null)} onSaved={refetch}/>}
 </main>;

 const summary=atlasSummary(model);
 const selectedStar=selected===null?null:model.stars[selected];
 const details=selected!==null&&<ConceptSheet key={'concept-sheet:'+model.stars[selected].id} model={model} index={selected} expanded={expanded} onExpand={setExpanded}
   onClose={()=>select(null)} onPick={index=>select(index,true)}
   onPin={()=>setDialog('pin')} onEdit={()=>setDialog('edit')} onPreview={()=>setDialog('preview')}/>;
 return <main id="main-content" className="v7-atlas" aria-label="Atlas" data-study-ui={repair?'':undefined} data-view={mapVisible?'map':'list'} data-options={optionsShown||undefined} data-atlas-layer={!mapVisible||selectedStar!==null||layers||dialog!==null||undefined} data-panning={panning||undefined} data-sheet={selectedStar?(expanded?'expanded':'peek'):'closed'}>
  {header}
  <p className="v7-sr-only" data-testid="atlas-summary">{summary}</p>
  {repair&&highlighted!==null&&<div className="v7-atlas-filter-summary" role="status">
   {rows.length+' matching '+(rows.length===1?'concept':'concepts')}
   {rows.length===0&&<Button small onClick={()=>{setAtlasFilter('all');setAtlasKind('any');setStale(false);setSubset('All');}}>Clear filters</Button>}
  </div>}
  {atlasView==='map'&&(mapVisible||layout?.model===model)&&<section className="v7-atlas-map" aria-label="Atlas map" aria-describedby="v7-atlas-map-summary" data-covered={!mapVisible||undefined} inert={!mapVisible} aria-hidden={!mapVisible||undefined}>
   <p id="v7-atlas-map-summary" className="v7-sr-only">{summary}. The map is visual; use List view to browse concepts with assistive technology.</p>
   {layout?.model===model?<AtlasMap ref={map} model={model} layout={layout.result} source={layout.source} selected={selected} reduced={reduced} paused={!mapVisible}
     focusCluster={allSky?null:focusCluster} focusSelected={mapFrame==='initial'} highlighted={highlighted} typedLinks={typedOn?typed:undefined}
     insets={{top:64,right:8,bottom:selectedStar?PEEK:0,left:8}} labelMargin={{top:56,right:optionsShown?72:12,bottom:selectedStar?PEEK+16:8,left:8}}
     onSelect={index=>select(index,index!==null)} onPan={setPanning}/>
    :layoutError?<div className="v7-atlas-state" role="alert"><p>Couldn't arrange the map. The List view still works.</p>
      <Button onClick={()=>update({view:'list'})}>Show the list</Button></div>
    :<p role="status" className="v7-atlas-state">Arranging the sky…</p>}
  </section>}
  {atlasView!=='map'?<AtlasLayerContent view={atlasView} model={atlasModel.data}/>:view==='list'?<section className="v7-atlas-list" aria-label="Concept list">
   {model.clusters.map(cluster=>{
    const members=rows.slice(0,shown).filter(index=>model.stars[index].cluster===cluster.index);
    return members.length>0&&<section key={cluster.id} id={'atlas-subject-'+cluster.index} className="v7-atlas-subject" aria-label={cluster.name}>
     <h2><SubjectMark subject={cluster.subject}/>{cluster.name}</h2>
     <ul>{members.map(i=>{const star=model.stars[i];return <li key={star.id} id={'v7-atlas-row-'+star.id}>
      <button type="button" aria-current={i===selected?'true':undefined} onClick={()=>select(i)}>
       <StarMark state={star.state} subjectClassName={subjectClass(cluster.subject)}/>
       <span className="v7-sr-only">{stateLabel[star.state]}</span>
       <span className="v7-atlas-row-name"><FastTex source={star.name}/></span>
       {star.due>0&&<span className="v7-meta-chip">{star.due} due</span>}
       <ChevronRight aria-hidden="true"/>
      </button></li>;})}</ul>
    </section>;
   })}
   {rows.length>shown&&<Button onClick={()=>setShown(count=>count+PAGE)}>Show more concepts ({rows.length-shown} left)</Button>}
   <Button onClick={()=>setDialog('new')}>New concept</Button>
  </section>:null}
  <AtlasLayers subset={subset} onSubset={setSubset} subjects={atlasView==='map'?model.clusters.filter(cluster=>view!=='list'||listedClusters.has(cluster.index)).map(cluster=>({id:cluster.index,name:cluster.name})):[]} onSubject={id=>{setLayers(false);if(view==='map')map.current?.flyToCluster(id);else{setShown(rows.length);requestAnimationFrame(()=>document.getElementById('atlas-subject-'+id)?.scrollIntoView({block:'start'}));}}} open={layers} onClose={()=>setLayers(false)} view={atlasView} onView={setAtlasView} filter={atlasFilter}
   onFilter={setAtlasFilter} kind={atlasKind} onKind={setAtlasKind} stale={stale} onStale={setStale} model={atlasModel.data} typedLinks={typed} typedOn={typedOn} onTyped={showTyped}
   legend={<ul className="v7-atlas-key">
    {legendOrder.map(state=><li key={state}><StarMark state={state} subjectClassName={subjectClass('Other')}/>{stateLabel[state]}</li>)}
    <li><svg viewBox="0 0 20 20" className="v7-atlas-mark" aria-hidden="true"><path d="M2 10h12M10 6l5 4-5 4" className="v7-atlas-mark-link"/></svg>Needs (prerequisite)</li>
    <li><svg viewBox="0 0 20 20" className="v7-atlas-mark" aria-hidden="true"><path d="M2 10h16" className="v7-atlas-mark-link v7-atlas-mark-dotted"/></svg>Related</li>
   </ul>}/>
  {details&&(mapVisible?details:<Dock inset="edge" className="v7-atlas-detail-dock">{details}</Dock>)}
  {dialog==='pin'&&selectedStar&&<ConceptPin kit key={'concept-pin:'+selectedStar.id} id={selectedStar.id} name={selectedStar.name}
   x={selectedStar.pin?.[0]??null} y={selectedStar.pin?.[1]??null}
   onSave={async(id,x,y)=>{await getApi().pinConcept(id,x,y);await refetch();}} onClose={()=>setDialog(null)}/>}
  {(dialog==='edit'||dialog==='new')&&query.data&&<AtlasCommands kit key={'atlas-command:'+(dialog==='new'?'new':selectedStar?.id)} graph={query.data}
   sourceId={dialog==='new'?null:selectedStar?.id??null} onClose={()=>setDialog(null)} onSaved={refetch}/>}
  {dialog==='preview'&&selectedStar&&query.data&&<AtlasImpactPreview kit key={selectedStar.id} graph={query.data} sourceId={selectedStar.id} onClose={()=>setDialog(null)}/>}
 </main>;
}
