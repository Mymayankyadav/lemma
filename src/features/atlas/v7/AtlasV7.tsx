import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Illustration} from '../../../ui/v7/Illustration';
import {useMotionReduced} from '../../../ui/v7/effects';
import {Link,useLocation,useNavigate,useSearchParams} from 'react-router';
import {ChevronLeft,ChevronRight,Crosshair,Minus,Plus,Search,X} from 'lucide-react';
import {useAtlas,useHome} from '../../../data/hooks';
import {getApi} from '../../../data';
import {FastTex} from '../../../ui/FastTex';
import {Button,IconButton,Segmented} from '../../../ui/v7/components';
import {ErrorEmblem,StateButton} from '../../../ui/v7/KitPrimitives';
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
import {rememberRoomItem} from '../../../ui/v7/room';

/** The peek height, and the floating dock's height (tab bar, margins) the map keeps clear. */
const PAGE=200,PEEK=180,DOCK=92;
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
 const star=model.stars[index],checkpoint=star.checkpoints[0];
 const drag=useRef<{y:number;moved:boolean}|null>(null),dragged=useRef(false),[offset,setOffset]=useState(0);
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
 return <section className="v7-atlas-sheet" data-expanded={expanded} aria-labelledby="v7-atlas-sheet-title"
  style={offset?{transform:`translateY(${offset}px)`}:undefined}>
  <button type="button" className="v7-atlas-handle" aria-expanded={expanded} aria-controls="v7-atlas-sheet-more"
   aria-label={expanded?'Show less':'Show neighbours and actions'} onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp}
   onPointerCancel={()=>{drag.current=null;setOffset(0);}}
   onClick={()=>{if(dragged.current){dragged.current=false;return;}onExpand(!expanded);}}><span/></button>
  <div className="v7-atlas-sheet-head">
   <h2 id="v7-atlas-sheet-title" className="v7-atlas-sheet-title"><FastTex source={star.name}/></h2>
   <IconButton label="Close details" onClick={onClose}><X aria-hidden="true"/></IconButton>
  </div>
  <div className="v7-atlas-sheet-meta"><StateChip state={star.state}/><SubjectTag model={model} index={index}/></div>
  <p className="v7-atlas-counts" data-testid="atlas-counts">{starCounts(model,index)}</p>
  <div className="v7-atlas-actions">
   {checkpoint?<Link className="v7-button v7-primary" to={'/p/'+checkpoint.projectSlug+'/cp/'+checkpoint.code}
     aria-label={'Open '+checkpointName(checkpoint.code)}><span>Open checkpoint</span></Link>
    :<StateButton variant="primary" disabledReason="Unavailable · No checkpoint uses this concept yet.">Open checkpoint</StateButton>}
   {star.due>0?<Link className="v7-button v7-secondary" to={'/review/run?concept='+encodeURIComponent(star.slug)}><span>Review cards</span></Link>
    :<StateButton disabledReason="Unavailable · No cards are due.">Review cards</StateButton>}
  </div>
  {expanded&&<div id="v7-atlas-sheet-more" className="v7-atlas-sheet-more">
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
export function atlasTooDense(stars:number,edges:number):boolean{return stars>250||edges>600;}
/** v7 Atlas (PLAN §6.12): a seeded, searchable star map with a list view for assistive technology. */
export default function AtlasV7(){
 const room=isFlagOn('v7Room'),home=useHome();
 const [subset,setSubset]=useState<'All'|'Tonight'|'Shaky'|'Demonstrated'>('All');
 const query=useAtlas(),navigate=useNavigate(),location=useLocation(),[params,setParams]=useSearchParams();
 const reduced=useReducedMotion();
 const model=useMemo(()=>query.data?buildAtlasModel(query.data):null,[query.data]);
 const focusCluster=useMemo(()=>{
  if(!room||!model)return null;
  return model.stars.find(star=>star.checkpoints.some(cp=>cp.projectSlug===home.data?.resume?.projectSlug))?.cluster??model.stars.find(star=>star.state==='in_progress')?.cluster??model.clusters[0]?.index??null;
 },[room,model,home.data?.resume?.projectSlug]);
 const highlighted=useMemo(()=>!room||subset==='All'||!model?null:model.stars.flatMap((star,index)=>{
  const matches=subset==='Tonight'?star.due>0||star.state==='in_progress'||star.state==='up_next':subset==='Shaky'?star.state==='revisit':star.state==='demonstrated';
  return matches?[index]:[];
 }),[room,subset,model]);
 // R2 · F12: a sky too dense to read opens as the list; the map stays one tap away (?view=map).
 const dense=!!model&&atlasTooDense(model.stars.length,model.edges.length);
 const view=params.get('view')==='list'||(dense&&params.get('view')!=='map')?'list':'map';
 const [layout,setLayout]=useState<{result:LayoutResult;source:LayoutSource}|null>(null);
 const [layoutError,setLayoutError]=useState(false);
 const [searching,setSearching]=useState(false),[term,setTerm]=useState(''),[expanded,setExpanded]=useState(false);
 const [legend,setLegend]=useState(false),[shown,setShown]=useState(PAGE);
 const [dialog,setDialog]=useState<null|'pin'|'edit'|'preview'|'new'>(null);
 const map=useRef<AtlasMapHandle>(null),searchInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  if(!model)return;let live=true;setLayoutError(false);
  // AT2: lay the constellations out for the screen's shape (portrait phones stack them), so the first view fills the screen.
  computeLayout(layoutInput(model,'lemma-atlas',typeof innerWidth==='number'&&innerWidth>0?Math.min(2,innerHeight/innerWidth):1)).then(next=>{if(live)setLayout(next);},()=>{if(live)setLayoutError(true);});
  return ()=>{live=false;};
 },[model]);
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
  const out=new URLSearchParams(params);out.delete('focus');
  const nextView=next.view??view;if(nextView==='list'&&!dense)out.set('view','list');else if(nextView==='map'&&dense)out.set('view','map');else if(nextView==='map')out.delete('view');else out.delete('view');
  const id=next.id===undefined?params.get('id'):next.id;if(id)out.set('id',id);else out.delete('id');
  setParams(out,{replace:true});
 };
 const select=(index:number|null,fly=false)=>{
  if(!model)return;setExpanded(false);
  if(room&&index!==null)rememberRoomItem({id:'concept:'+model.stars[index].id,group:'Concepts',title:model.stars[index].name,to:'/atlas?id='+encodeURIComponent(model.stars[index].id)});
  update({id:index===null?null:model.stars[index].id});
  if(index!==null&&fly&&view==='map')map.current?.flyTo(index);
 };
 useEffect(()=>{if(searching)searchInput.current?.focus();},[searching]);
 useEffect(()=>{
  if(view!=='list'||selected===null||!model)return;
  document.getElementById('v7-atlas-row-'+model.stars[selected].id)?.scrollIntoView({block:'nearest'});
 },[view,selected,model]);
 const results=useMemo(()=>model?searchStars(model,term):[],[model,term]);
 const rows=useMemo(()=>model?alphabetical(model).filter(index=>!highlighted||highlighted.includes(index)):[],[model,highlighted]);
 const back=()=>{if(location.key!=='default')navigate(-1);else navigate('/');};
 const refetch=async()=>{await query.refetch();};

 const header=<header className="v7-atlas-bar">
  <IconButton label="Back" onClick={back}><ChevronLeft aria-hidden="true"/></IconButton>
  <h1 className="v7-atlas-title">Atlas</h1>
  <Segmented label="Atlas view" options={['Map','List']} value={view==='list'?'List':'Map'} onChange={value=>update({view:value==='List'?'list':'map'})}/>
  <IconButton label="Search concepts" aria-expanded={searching} aria-controls="v7-atlas-search" onClick={()=>setSearching(open=>!open)}><Search aria-hidden="true"/></IconButton>
 </header>;
 if(query.isPending)return <main id="main-content" className="v7-atlas" aria-label="Atlas" aria-busy="true">{header}
  <p role="status" className="v7-atlas-state">Loading the Atlas…</p></main>;
 if(query.error||!model)return <main id="main-content" className="v7-atlas" aria-label="Atlas">{header}
  <div className="v7-atlas-state" role="alert"><ErrorEmblem/><Button onClick={()=>{void query.refetch();}}>Retry loading the Atlas</Button></div></main>;
 if(model.stars.length===0)return <main id="main-content" className="v7-atlas" aria-label="Atlas">{header}
  <div className="v7-atlas-state"><Illustration name="atlas" width={160}/><p>No concepts yet. They appear as your plans grow.</p>
   <Button variant="primary" onClick={()=>setDialog('new')}>New concept</Button></div>
  {dialog==='new'&&query.data&&<AtlasCommands graph={query.data} sourceId={null} onClose={()=>setDialog(null)} onSaved={refetch}/>}
 </main>;

 const summary=atlasSummary(model);
 const selectedStar=selected===null?null:model.stars[selected];
 return <main id="main-content" className="v7-atlas" aria-label="Atlas" data-view={view} data-sheet={selectedStar?(expanded?'expanded':'peek'):'closed'}>
  {header}
  {room&&<nav className="v7-room-atlas-subsets" aria-label="Concept subsets">{(['All','Tonight','Shaky','Demonstrated'] as const).map(label=><button key={label} className="v7-filter-chip" type="button" aria-pressed={subset===label} onClick={()=>{setSubset(label);setShown(PAGE);}}>{label}</button>)}</nav>}
  <p className="v7-sr-only" data-testid="atlas-summary">{summary}</p>
  {searching&&<div id="v7-atlas-search" className="v7-atlas-search" role="search" onKeyDown={event=>{if(event.key==='Escape'){setSearching(false);}}}>
   <label className="v7-atlas-search-field"><span className="v7-sr-only">Find a concept</span>
    <Search aria-hidden="true"/><input ref={searchInput} type="search" placeholder="Find a concept" value={term} onChange={event=>setTerm(event.target.value)}/></label>
   {term.trim()&&<p className="v7-atlas-meta" role="status">{results.length} matching {results.length===1?'concept':'concepts'}</p>}
   <ul aria-label="Matching concepts">{results.map(i=><li key={model.stars[i].id}><button type="button" onClick={()=>{setSearching(false);select(i,true);}}>
    <StarMark state={model.stars[i].state} subjectClassName={subjectClass(model.clusters.find(c=>c.index===model.stars[i].cluster)?.subject??'Other')}/>
    <span className="v7-atlas-row-name"><FastTex source={model.stars[i].name}/></span>
    <span className="v7-atlas-meta">{model.clusters.find(c=>c.index===model.stars[i].cluster)?.name}</span></button></li>)}</ul>
  </div>}
  {view==='map'?<section className="v7-atlas-map" aria-label="Atlas map" aria-describedby="v7-atlas-map-summary">
   <p id="v7-atlas-map-summary" className="v7-sr-only">{summary}. The map is visual; use List view to browse concepts with assistive technology.</p>
   {layout?<AtlasMap ref={map} model={model} layout={layout.result} source={layout.source} selected={selected} reduced={reduced} focusCluster={focusCluster} highlighted={highlighted}
     insets={{top:room?120:72,right:0,bottom:DOCK+(selectedStar?PEEK+16:0),left:0}} onSelect={index=>select(index)}/>
    :layoutError?<div className="v7-atlas-state" role="alert"><p>Couldn't arrange the map. The List view still works.</p>
      <Button onClick={()=>update({view:'list'})}>Show the list</Button></div>
    :<p role="status" className="v7-atlas-state">Arranging the sky…</p>}
   <div className="v7-atlas-legend">
    <button type="button" className="v7-atlas-chip" aria-expanded={legend} aria-controls="v7-atlas-legend" onClick={()=>setLegend(open=>!open)}>Legend</button>
    {legend&&<ul id="v7-atlas-legend" aria-label="Star states">{legendOrder.map(state=><li key={state}><StarMark state={state} subjectClassName={subjectClass('Other')}/>{stateLabel[state]}</li>)}
     <li><svg viewBox="0 0 20 20" className="v7-atlas-mark" aria-hidden="true"><path d="M2 10h12M10 6l5 4-5 4" className="v7-atlas-mark-link"/></svg>Needs (prerequisite)</li>
     <li><svg viewBox="0 0 20 20" className="v7-atlas-mark" aria-hidden="true"><path d="M2 10h16" className="v7-atlas-mark-link v7-atlas-mark-dotted"/></svg>Related</li></ul>}
   </div>
   <div className="v7-atlas-controls">
    <IconButton label="Zoom in" onClick={()=>map.current?.zoomBy(1.5)}><Plus aria-hidden="true"/></IconButton>
    <IconButton label="Zoom out" onClick={()=>map.current?.zoomBy(1/1.5)}><Minus aria-hidden="true"/></IconButton>
    <IconButton label="Recentre map" onClick={()=>map.current?.recentre()}><Crosshair aria-hidden="true"/></IconButton>
   </div>
  </section>
  :<section className="v7-atlas-list" aria-label="Concept list">
   <p className="v7-atlas-meta">{summary}</p>
   {dense&&params.get('view')!=='list'&&<p className="v7-atlas-meta" role="note">Your sky has {model.stars.length.toLocaleString('en-GB')} concepts, so it opens as a list. Choose Map to see the whole sky.</p>}
   {room&&<nav className="v7-room-atlas-index" aria-label="Subject index">{model.clusters.filter(cluster=>rows.some(index=>model.stars[index].cluster===cluster.index)).map(cluster=><button type="button" key={cluster.id} aria-label={'Jump to '+cluster.name} onClick={()=>{setShown(rows.length);requestAnimationFrame(()=>document.getElementById('room-atlas-'+cluster.index)?.scrollIntoView({block:'start'}));}}>{cluster.name[0]}</button>)}</nav>}
   {room?model.clusters.map(cluster=>{const members=rows.slice(0,shown).filter(index=>model.stars[index].cluster===cluster.index);return members.length>0&&<section key={cluster.id} id={'room-atlas-'+cluster.index} className="v7-room-atlas-subject" aria-label={cluster.name}><h2 className="v7-headline">{cluster.name}</h2><ul>{members.map(i=>{const star=model.stars[i];return <li key={star.id} id={'v7-atlas-row-'+star.id}><button type="button" aria-current={i===selected?'true':undefined} onClick={()=>select(i)}><StarMark state={star.state} subjectClassName={subjectClass(cluster.subject)}/><span className="v7-atlas-row-text"><span className="v7-atlas-row-name"><FastTex source={star.name}/></span><small>{stateLabel[star.state]}{star.due?' · '+star.due+' due':''}</small></span><ChevronRight aria-hidden="true"/></button></li>;})}</ul></section>;}):<ul>{rows.slice(0,shown).map(i=>{const star=model.stars[i],cluster=model.clusters.find(c=>c.index===star.cluster);
    return <li key={star.id} id={'v7-atlas-row-'+star.id}><button type="button" aria-current={i===selected?'true':undefined} onClick={()=>select(i)}>
     <StarMark state={star.state} subjectClassName={subjectClass(cluster?.subject??'Other')}/>
     <span className="v7-atlas-row-text"><span className="v7-atlas-row-name"><FastTex source={star.name}/></span>
      <span className="v7-atlas-meta">{stateLabel[star.state]}{star.due?' · '+star.due+' due':''}{cluster?' · '+cluster.name:''}</span></span>
     <ChevronRight aria-hidden="true"/></button></li>;})}</ul>}
   {room&&rows.length===0&&<p role="status">No concepts in this subset.</p>}
   {rows.length>shown&&<Button onClick={()=>setShown(count=>count+PAGE)}>Show more concepts ({rows.length-shown} left)</Button>}
   <Button onClick={()=>setDialog('new')}>New concept</Button>
  </section>}
  {selected!==null&&<ConceptSheet key={model.stars[selected].id} model={model} index={selected} expanded={expanded} onExpand={setExpanded}
   onClose={()=>select(null)} onPick={index=>select(index,true)}
   onPin={()=>setDialog('pin')} onEdit={()=>setDialog('edit')} onPreview={()=>setDialog('preview')}/>}
  {dialog==='pin'&&selectedStar&&<ConceptPin key={selectedStar.id} id={selectedStar.id} name={selectedStar.name}
   x={selectedStar.pin?.[0]??null} y={selectedStar.pin?.[1]??null}
   onSave={async(id,x,y)=>{await getApi().pinConcept(id,x,y);await refetch();}} onClose={()=>setDialog(null)}/>}
  {(dialog==='edit'||dialog==='new')&&query.data&&<AtlasCommands key={dialog==='new'?'new':selectedStar?.id} graph={query.data}
   sourceId={dialog==='new'?null:selectedStar?.id??null} onClose={()=>setDialog(null)} onSaved={refetch}/>}
  {dialog==='preview'&&selectedStar&&query.data&&<AtlasImpactPreview key={selectedStar.id} graph={query.data} sourceId={selectedStar.id} onClose={()=>setDialog(null)}/>}
 </main>;
}
