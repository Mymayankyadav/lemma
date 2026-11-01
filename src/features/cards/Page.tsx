import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router';
import {useInfiniteQuery} from '@tanstack/react-query';
import {Plus,Search} from 'lucide-react';
import {getApi} from '../../data';
import {useCreateNote,useProjects} from '../../data/hooks';
import type {SchedulingState} from '../../data/types';
import {Button} from '../../ui/Button';
import {Chip} from '../../ui/Chip';
import {IconButton} from '../../ui/IconButton';
import {Screen} from '../../ui/Screen';
import {Sheet} from '../../ui/Sheet';
import {Skeleton} from '../../ui/Skeleton';
import {useToast} from '../../ui/Toast';
import {Tex} from '../../ui/Tex';
import {hasMathPreview} from '../../lib/plain-math';
import {canRenderPlainCardFront} from './plainCardFront';
import type {EditorValue} from './Editor';
import {ProjectFilterTitle,projectFilterOptionLabel} from './ProjectFilterTitle';

const Editor=lazy(()=>import('./Editor').then(module=>({default:module.Editor})));
const ROW_HEIGHT=92,OVERSCAN=6;
function relative(due:string|null){
 if(!due)return 'New';
 const days=Math.ceil((Date.parse(due)-Date.now())/86400000);
 return days<=0?'Due':days===1?'in 1d':'in '+days+'d';
}
export default function Page(){
 const [search,setSearch]=useState(''),[query,setQuery]=useState('');
 const [project,setProject]=useState(''),[checkpoint,setCheckpoint]=useState('');
 const [state,setState]=useState(''),[noteStatus,setNoteStatus]=useState('');
 const [onlyComments,setOnlyComments]=useState(false),[creating,setCreating]=useState(false);
 const [scrollTop,setScrollTop]=useState(0),[viewportHeight,setViewportHeight]=useState(500);
 const scroller=useRef<HTMLDivElement>(null);
 const filterScroller=useRef<HTMLDivElement>(null);
 const [filterFade,setFilterFade]=useState({left:false,right:false});
 const updateFilterFade=useCallback(()=>{
  const element=filterScroller.current;if(!element)return;
  const left=element.scrollLeft>1;
  const right=element.scrollLeft+element.clientWidth<element.scrollWidth-1;
  setFilterFade(previous=>previous.left===left&&previous.right===right?previous:{left,right});
 },[]);
 const projects=useProjects(),create=useCreateNote(),notify=useToast(),navigate=useNavigate();
 const closeCreating=useCallback(()=>setCreating(false),[]);
 // S/X contains 60 project filters. Cards query, viewport and scroll state
 // update independently; keep the chip and native-option subtrees stable so
 // they do not rerun 60 rich-title/plainMath conversions on each page paint.
 // At S/X sizes the Project select below preserves every choice without
 // mounting 15–60 rich mathematical chip labels on the cold Cards route.
 // Keep quick chips for small libraries; change form rather than shrink marks.
 const showProjectChips=(projects.data?.length??0)<=8;
 const projectChips=useMemo(()=>showProjectChips?projects.data?.map(p=><span key={p.id} data-project-slug={p.slug} className="inline-flex shrink-0">
  <Chip className="shrink-0 whitespace-nowrap" selected={project===p.slug} onClick={()=>{setProject(p.slug);setCheckpoint('')}}>
   <span aria-hidden="true">{p.subject.glyph}</span><ProjectFilterTitle title={p.title}/>
  </Chip>
 </span>):null,[projects.data,project,showProjectChips]);
 const projectOptions=useMemo(()=>projects.data?.map(p=><option key={p.id} value={p.slug}>{projectFilterOptionLabel(p.title)}</option>),[projects.data]);

 useEffect(()=>{
  const element=filterScroller.current;if(!element)return;
  updateFilterFade();
  if(typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(updateFilterFade);
  observer.observe(element);
  return ()=>observer.disconnect();
 },[projects.data,updateFilterFade]);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(search),250);return ()=>clearTimeout(timer)},[search]);
 const cards=useInfiniteQuery({
  queryKey:['cards-page-infinite',query,project,checkpoint,state,noteStatus,onlyComments],
  initialPageParam:0,
  queryFn:({pageParam})=>getApi().searchCardsPage({
   query,projectSlug:project||undefined,checkpointCode:checkpoint.trim()||undefined,
   state:state===''?undefined:Number(state) as SchedulingState,
   noteStatus:noteStatus===''?undefined:noteStatus as 'active'|'suspended'|'deleted',
   hasOpenComments:onlyComments||undefined,offset:pageParam,
  }),
  getNextPageParam:last=>last.nextOffset??undefined,
  staleTime:30_000,
 });
 const rows=useMemo(()=>cards.data?.pages.flatMap(p=>p.rows)??[],[cards.data]);
 useEffect(()=>{if(scroller.current){scroller.current.scrollTop=0;setScrollTop(0)}},[query,project,checkpoint,state,noteStatus,onlyComments]);
 useEffect(()=>{
  const element=scroller.current;if(!element)return;
  const measure=()=>setViewportHeight(element.clientHeight);
  measure();
  const observer=new ResizeObserver(measure);
  observer.observe(element);
  return ()=>observer.disconnect();
 },[cards.isPending]);
 const first=Math.max(0,Math.floor(scrollTop/ROW_HEIGHT)-OVERSCAN);
 const last=Math.min(rows.length,Math.ceil((scrollTop+viewportHeight)/ROW_HEIGHT)+OVERSCAN);
 const visible=rows.slice(first,last);
 const save=async(v:EditorValue)=>{
  try{
   const result=await create.mutateAsync({front:v.front,back:v.back,type:v.type,kind:v.kind,
    projectSlug:v.projectSlug,checkpointCode:v.checkpointCode});
   setCreating(false);notify('Card created');navigate('/cards/'+result.noteNo);
  }catch{notify("Couldn't create the card.",{tone:'danger'})}
 };
 const loading=cards.isPending;
 // Only fade an edge when there are chips outside the visible scroll window.
 const filterMask=filterFade.left&&filterFade.right
  ?'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)'
  :filterFade.left
   ?'linear-gradient(to right, transparent, black 16px, black 100%)'
   :filterFade.right
    ?'linear-gradient(to right, black 0%, black calc(100% - 16px), transparent)'
    :undefined;
 return <Screen title="Cards" back="/" actions={<IconButton icon={Plus} label="New card" tone="amber" onClick={()=>setCreating(true)}/>}>
  <label className="flex min-h-[var(--row)] min-w-0 items-center gap-3 rounded-ctl border border-edge bg-well px-4 text-ink-3">
   <Search size={19}/><span className="sr-only">Search cards</span>
   <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search cards" className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"/>
  </label>
  <div ref={filterScroller} role="group" aria-label="Card filters" data-filter-fade-left={String(filterFade.left)} data-filter-fade-right={String(filterFade.right)} onScroll={updateFilterFade} style={{maskImage:filterMask}} className="flex w-full min-w-0 flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-1">
   <Chip className="shrink-0 whitespace-nowrap" selected={!project&&!onlyComments&&noteStatus!== 'suspended'} onClick={()=>{setProject('');setCheckpoint('');setNoteStatus('');setOnlyComments(false);setState('')}}>All</Chip>
   {projectChips}
   {!showProjectChips&&<span className="self-center shrink-0 text-[12px] text-ink-3">Choose from {projects.data?.length??0} projects below</span>}
   <Chip className="shrink-0 whitespace-nowrap" selected={onlyComments} onClick={()=>setOnlyComments(v=>!v)}>Has notes</Chip>
   <Chip className="shrink-0 whitespace-nowrap" selected={noteStatus==='suspended'} onClick={()=>setNoteStatus(v=>v==='suspended'?'':'suspended')}>Paused</Chip>
  </div>
  <div className="flex min-w-0 flex-wrap gap-2" aria-label="Advanced card filters">
   <label className="min-w-0 flex-1 text-label text-ink-2">Project
    <select aria-label="Filter project" value={project} onChange={e=>{setProject(e.target.value);setCheckpoint('')}}
     className="mt-1 min-h-11 w-full min-w-0 rounded-ctl border border-edge bg-well px-2 text-body text-ink">
     <option value="">All projects</option>{projectOptions}
    </select>
   </label>
   <label className="min-w-0 flex-1 text-label text-ink-2">Checkpoint
    <input aria-label="Filter checkpoint" value={checkpoint} onChange={e=>setCheckpoint(e.target.value)}
     className="mt-1 min-h-11 w-full min-w-0 rounded-ctl border border-edge bg-well px-2 text-body text-ink" placeholder="All"/>
   </label>
  </div>
  <div className="flex w-full min-w-0 flex-wrap gap-2" role="group" aria-label="Scheduling filters">
   <label className="min-w-[105px] flex-1 text-label text-ink-2">Scheduling
    <select value={state} onChange={e=>setState(e.target.value)} aria-label="Filter scheduling state"
     className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well px-2 text-body text-ink">
     <option value="">All states</option><option value="0">New</option><option value="1">Learning</option>
     <option value="2">Review</option><option value="3">Relearning</option>
    </select>
   </label>
   <label className="min-w-[105px] flex-1 text-label text-ink-2">Status
    <select value={noteStatus} onChange={e=>setNoteStatus(e.target.value)} aria-label="Filter note status"
     className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well px-2 text-body text-ink">
     <option value="">All statuses</option><option value="active">Active</option><option value="suspended">Paused</option>
    </select>
   </label>
   <Chip selected={onlyComments} onClick={()=>setOnlyComments(v=>!v)} className="self-end whitespace-nowrap">
    Has notes
   </Chip>
  </div>
  <div className="flex items-center justify-between text-label text-ink-3">
   <span aria-live="polite">{rows.length.toLocaleString()} loaded{cards.hasNextPage?' · more available':''}</span>
   {(project||checkpoint||state||noteStatus||onlyComments||search)&&<button type="button" className="min-h-11 text-ink-2 underline-offset-2 hover:underline" onClick={()=>{
    setProject('');setCheckpoint('');setState('');setNoteStatus('');setOnlyComments(false);setSearch('');setQuery('');
   }}>Clear filters</button>}
  </div>
  {loading?<div className="flex flex-col gap-2">{[1,2,3,4].map(n=><Skeleton key={n} h={92}/>)}</div>:
   cards.isError?<Button variant="ghost" onClick={()=>void cards.refetch()}>Try again</Button>:
   rows.length?<div ref={scroller} data-card-virtual-list className="max-h-[min(60dvh,600px)] min-h-[160px] overflow-y-auto overscroll-contain rounded-ctl border-y border-edge"
     style={{height:'min(60dvh,600px)'}} onScroll={e=>{
      const el=e.currentTarget;setScrollTop(el.scrollTop);
      if(el.scrollHeight-el.scrollTop-el.clientHeight<320&&cards.hasNextPage&&!cards.isFetchingNextPage)void cards.fetchNextPage();
     }}>
     <div style={{height:first*ROW_HEIGHT}} aria-hidden="true"/>
     {visible.map(row=><Link key={row.noteNo} to={'/cards/'+row.noteNo} data-card-row
      className="flex min-w-0 items-center gap-3 overflow-hidden border-b border-edge px-2 py-2 focus-visible:outline-2 focus-visible:outline-amber"
      style={{height:ROW_HEIGHT}}>
      <span aria-hidden="true" data-card-subject-glyph className="w-6 shrink-0 text-center font-math text-card italic text-ink-2">{row.glyph}</span>
      <div className="min-w-0 flex-1">
       <div data-card-front="" data-card-front-preview=""
        className={'min-w-0 max-w-full font-math text-headline leading-snug text-ink '+(hasMathPreview(row.front)?'block overflow-x-auto whitespace-nowrap':'line-clamp-2 overflow-hidden')}
        style={hasMathPreview(row.front)?{maskImage:'linear-gradient(to right, black 0%, black calc(100% - 12px), transparent 100%)'}:undefined}>
        <span className={hasMathPreview(row.front)?'inline-block min-w-max pr-4':undefined}>{canRenderPlainCardFront(row.front)?row.front:<Tex source={row.front}/>}</span>
       </div>
       <span className="mt-1 flex flex-wrap items-center gap-2 text-label text-ink-3">
        <span className="inline-flex min-w-10 justify-center rounded-[3px] border border-edge px-1 py-0.5">{row.checkpointCode??'—'}</span>
        <span>{row.status==='suspended'?'Paused':relative(row.due)}</span>
        {row.openComments>0&&<span data-card-open-comments className="text-ink-2">{row.openComments} notes</span>}
       </span>
      </div>
     </Link>)}
     <div style={{height:(rows.length-last)*ROW_HEIGHT}} aria-hidden="true"/>
    </div>:
    <div className="py-12 text-center"><h2 className="text-card font-semibold">No cards match</h2>
     <Button variant="text" onClick={()=>{setSearch('');setProject('');setState('');setNoteStatus('');setCheckpoint('');setOnlyComments(false)}}>Clear filters</Button>
    </div>}
  {cards.hasNextPage&&<Button variant="ghost" disabled={cards.isFetchingNextPage} onClick={()=>void cards.fetchNextPage()}>
   {cards.isFetchingNextPage?'Loading 50 more…':'Load 50 more'}
  </Button>}
  <Sheet open={creating} onClose={closeCreating} title="New card">
   <Suspense fallback={<Skeleton h={180}/>}>{creating&&<Editor creating busy={create.isPending} onSubmit={v=>void save(v)}/>}</Suspense>
  </Sheet>
 </Screen>;
}
