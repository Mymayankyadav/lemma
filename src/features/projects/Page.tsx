import {SectionHeading} from '../../ui/SectionHeading';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Link,useSearchParams} from 'react-router';
import {ChevronDown,ChevronRight,MoreHorizontal,Plus,Search,Waypoints,X} from 'lucide-react';
import {useProjects,useUpdateProject} from '../../data/hooks';
import {getApi} from '../../data';
import {getMode} from '../../data/mode';
import {prefetchAtlasForPaths} from './atlasPrefetch';
import {MiniStageBar} from '../../ui/timeline/MiniStageBar';
import type {ProjectSummary,ProjectStatus} from '../../data/types';
import {Screen} from '../../ui/Screen';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {useToast} from '../../ui/Toast';
import {FastTex as Tex} from '../../ui/FastTex';
import {countPinnedProjects} from './pinnedCount';

type Filter='active'|'paused'|'done'|'archived';
const filters:Filter[]=['active','paused','done'];
// Global cap, not per-subject: 40 subjects × one row still needs windowing.
const INITIAL_PROJECT_ROWS=16;
const active=(status:ProjectStatus)=>status==='active'||status==='planning';
const matches=(project:ProjectSummary,filter:Filter)=>filter==='active'?active(project.status):project.status===filter;
const newest=(a:ProjectSummary,b:ProjectSummary)=>(Date.parse(b.lastActivityAt??'')||0)-(Date.parse(a.lastActivityAt??'')||0);

function MiniMetro({project}:{project:ProjectSummary}){
 return <div className="flex min-w-0 items-center gap-2">
  <MiniStageBar project={project}/>
  <span data-count-role="" className="flex shrink-0 flex-col items-end font-[var(--font-ui)] text-caption tabular-nums text-ink-2">
   <span>{project.done} of {project.total}</span>
   {project.scheduleHeadline&&<span data-schedule-chip="" className="whitespace-nowrap text-[12px]">{project.scheduleHeadline}</span>}
  </span>
 </div>;
}

function ProjectRow({project,showSubject=false,pinnedCount}:{project:ProjectSummary;showSubject?:boolean;pinnedCount:number}){
 const update=useUpdateProject(),notify=useToast(),[menu,setMenu]=useState(false);
 const hold=useRef<ReturnType<typeof setTimeout>|null>(null);
 const longPressed=useRef(false);
 const clear=()=>{if(hold.current!==null){clearTimeout(hold.current);hold.current=null}};
 const actions:{label:string;patch:{pinned?:boolean;status?:ProjectStatus}}[]=project.status==='archived'
  ?[{label:'Restore as active',patch:{status:'active'}}]
  :[
   {label:project.pinned?'Unpin':'Pin',patch:{pinned:!project.pinned}},
   {label:'Set active',patch:{status:'active'}},
   {label:'Pause',patch:{status:'paused'}},
   {label:'Finish',patch:{status:'done'}},
   {label:'Archive',patch:{status:'archived'}},
  ];
 async function act(label:string,patch:{pinned?:boolean;status?:ProjectStatus}){
  setMenu(false);
  if(patch.pinned&&pinnedCount>=4){
   notify('At most four projects can be pinned. Unpin one first.',{tone:'danger'});return;
  }
  try{await update.mutateAsync({id:project.id,patch});notify(label+' saved',{tone:'success'})}
  catch(error){notify(error instanceof Error?error.message:'Unable to update project',{tone:'danger'})}
 }
 useEffect(()=>()=>clear(),[]);
 return <article className="px-3 py-3 hover:bg-[var(--paper-2)]" data-project-row={project.slug}
  onContextMenu={event=>{event.preventDefault();setMenu(true)}}
  onPointerDown={event=>{longPressed.current=false;if(event.pointerType!=='mouse'){clear();hold.current=setTimeout(()=>{longPressed.current=true;setMenu(true)},550)}}}
  onClickCapture={event=>{if(longPressed.current){event.preventDefault();event.stopPropagation();longPressed.current=false}}}
  onPointerUp={clear} onPointerCancel={clear} onPointerLeave={clear}>
  <div className="flex items-start gap-2">
   {project.status==='archived'?
    <button type="button" onClick={()=>setMenu(true)} aria-label={'Restore options for '+project.title}
     className="min-w-0 flex-1 rounded-ctl text-left focus-visible:outline-2 focus-visible:outline-amber">
     <span className="flex items-center gap-2">
      <span aria-hidden="true" className="text-title-s text-ink-2">{project.subject?.glyph??'∫'}</span>
      <span className="min-w-0 flex-1 break-words text-body-l font-semibold"><Tex source={project.title}/></span>
      <span className="text-caption text-ink-2">Archived · restore</span>
     </span>
    </button>:
    <Link to={'/p/'+project.slug} className="min-w-0 flex-1 rounded-ctl focus-visible:outline-2 focus-visible:outline-amber">
     <div className="flex items-center gap-2">
      <span aria-hidden="true" className="text-title-s text-ink-2">{project.subject?.glyph??'∫'}</span>
      <span className="min-w-0 flex-1 break-words text-body-l font-semibold"><Tex source={project.title}/></span>
      {project.pinned&&<span className="shrink-0 text-caption text-ink-2">Pinned</span>}
     </div>
     <div className="mt-1 text-caption text-ink-2 [&_.katex]:text-[16px]">{showSubject&&<span className="mr-2"><Tex source={project.subject?.name??"Unassigned"}/> ·</span>}{project.current?<>Now {project.current.code} <Tex source={project.current.title}/></>:project.total?'Plan complete':'Your tutor fills in the plan'}</div>
    </Link>}
   <button type="button" aria-label={'Actions for '+project.title} aria-expanded={menu} aria-haspopup="menu"
    onClick={()=>setMenu(value=>!value)} className="flex size-11 shrink-0 items-center justify-center rounded-ctl border border-edge text-ink-2">
    <MoreHorizontal size={19}/>
   </button>
  </div>
  <MiniMetro project={project}/>
  {menu&&<div role="menu" aria-label={'Manage '+project.title} className="mt-2 grid grid-cols-2 gap-2 border-t border-edge pt-2">
   {actions.filter(a=>!(a.label==='Pin'&&project.pinned)).map(action=><button type="button" role="menuitem" key={action.label}
    disabled={update.isPending||((action.patch.status===project.status))}
    onClick={()=>void act(action.label,action.patch)}
    className="min-h-11 rounded-ctl border border-edge bg-[var(--card-2)] px-2 text-left text-label disabled:opacity-40">{action.label}</button>)}
   <button type="button" role="menuitem" onClick={()=>setMenu(false)}
    className="min-h-11 rounded-ctl border border-edge px-2 text-left text-label">Close</button>
  </div>}
 </article>;
}

function ProjectGroup({name,glyph,items,total,collapsed,onToggle,pinnedCount}:{name:string;glyph:string;items:ProjectSummary[];total:number;collapsed:boolean;onToggle:()=>void;pinnedCount:number}){
 return <section aria-label={name+' projects'} data-group-size={total} className="overflow-hidden rounded-slab border border-edge bg-[var(--paper)]">
  {total>1&&<button type="button" aria-expanded={!collapsed} onClick={onToggle}
   className="flex min-h-11 w-full items-center gap-2 border-b border-edge text-left">
   <span aria-hidden="true" className="text-title-s text-ink-2">{glyph}</span>
   <SectionHeading className="min-w-0 flex-1 break-words"><Tex source={name}/></SectionHeading>
   <span className="text-caption text-ink-2">{total} {total===1?'project':'projects'}</span>
   <ChevronDown size={17} className={'text-ink-3 transition-transform '+(collapsed?'-rotate-90':'')}/>
  </button>}
  {(total===1||!collapsed)&&<div className="divide-y divide-[var(--hair)]">{items.map(project=><ProjectRow key={project.id} project={project} showSubject={total===1} pinnedCount={pinnedCount}/>)}</div>}
 </section>;
}

export default function Page(){
 const queryClient=useQueryClient();
 // Cards is the common next stop from Paths. Warm its small route chunk
 // asynchronously during the unthrottled Paths visit, without evaluating
 // Cards in the cold Today/Atlas entry bundle or issuing a Cards data query.
 useEffect(()=>{void import('../cards/Page').catch(()=>{})},[]);
 const warmAtlas=useCallback(()=>{
  if(getMode()!=='demo')return;
  void import('../atlas/Page');
  void prefetchAtlasForPaths(queryClient,getMode(),()=>getApi().getAtlas());
 },[queryClient]);
 const projects=useProjects(),notify=useToast(),[params,setParams]=useSearchParams();
 const [search,setSearch]=useState(''),[collapsed,setCollapsed]=useState<string[]>([]),[page,setPage]=useState(0);
 const filter=(['active','paused','done','archived'].includes(params.get('status')??'')?params.get('status'):'active') as Filter;
 useEffect(()=>{
  if(projects.error)notify("Couldn't load your paths.",{tone:'danger',action:{label:'Try again',onClick:()=>{void projects.refetch()}}});
 },[projects.error,projects.refetch,notify]);
 const all=useMemo(()=>(projects.data??[]).filter(project=>!project.system),[projects.data]);
 const pinnedCount=useMemo(()=>countPinnedProjects(all),[all]);
 const visible=useMemo(()=>all.filter(project=>matches(project,filter)&&
  (!search.trim()||[project.title,project.subject?.name??'Unassigned',...(project.sourceTitles??[])].some(value=>value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))).sort(newest),[all,filter,search]);
 const pinned=useMemo(()=>visible.filter(project=>project.pinned).slice(0,4),[visible]);
 const pinnedIds=useMemo(()=>new Set(pinned.map(project=>project.id)),[pinned]);
 const allGroups=useMemo(()=>{
  const map=new Map<string,{name:string;glyph:string;position:number;items:ProjectSummary[]}>();
  for(const project of visible){
   if(pinnedIds.has(project.id))continue;
   const key=project.subject?.id??'unassigned';
   const group=map.get(key)??{name:project.subject?.name??'Unassigned',glyph:project.subject?.glyph??'∫',position:project.subject?.position??Number.MAX_SAFE_INTEGER,items:[]};
   group.items.push(project);map.set(key,group);
  }
  return [...map.entries()].map(([id,group])=>({id,...group})).sort((a,b)=>a.position-b.position||a.name.localeCompare(b.name));
 },[visible,pinnedIds]);
 // Page the entire subject-grouped list, not each group independently.
 // Even after repeated Next clicks only 16 rows (including pinned) are mounted.
 const pageSize=Math.max(1,INITIAL_PROJECT_ROWS-pinned.length);
 const totalUnpinned=visible.length-pinned.length;
 useEffect(()=>setPage(index=>Math.min(index,Math.max(0,Math.ceil(totalUnpinned/pageSize)-1))),[totalUnpinned,pageSize]);
 const groups=useMemo(()=>{
  let skip=page*pageSize,remaining=pageSize;
  return allGroups.flatMap(group=>{
   if(!remaining)return [];
   if(skip>=group.items.length){skip-=group.items.length;return []}
   const items=group.items.slice(skip,skip+remaining);
   skip=0;remaining-=items.length;
   return items.length?[{...group,items,total:group.items.length}]:[];
  });
 },[allGroups,page,pageSize]);
 // Consecutive one-project subjects are rows in ONE paper list, not
 // individual bordered cards. Multi-project subjects keep their own foldable
 // group header and paper container.
 const renderGroups=[...(pinned.length?[{id:'pinned',name:'Pinned',glyph:'★',items:pinned,total:pinned.length}]:[]),...groups];
 type PathGroup=(typeof renderGroups)[number];
 const runs:Array<{kind:'single';groups:PathGroup[]}|{kind:'multi';group:PathGroup}>=[];
 for(const group of renderGroups){
  if(group.total===1){
   const last=runs[runs.length-1];
   if(last?.kind==='single')last.groups.push(group);
   else runs.push({kind:'single',groups:[group]});
  }else runs.push({kind:'multi',group});
 }
 const pageEnd=Math.min(totalUnpinned,(page+1)*pageSize);
 const toggle=(id:string)=>setCollapsed(items=>items.includes(id)?items.filter(item=>item!==id):[...items,id]);
 const choose=(next:Filter)=>{setPage(0);const p=new URLSearchParams(params);if(next==='active')p.delete('status');else p.set('status',next);setParams(p)};
 return <Screen tabBar className="gap-4">
  <header className="flex min-h-11 items-center justify-between gap-3">
   <h1 className="font-[var(--font-display)] text-title-s font-semibold">Paths</h1>
   <nav aria-label="Path actions" className="flex gap-2">
    <Link to="/atlas" aria-label="Open Atlas" onPointerEnter={warmAtlas} onPointerDown={warmAtlas} onFocus={warmAtlas} className="flex min-h-11 min-w-11 items-center justify-center rounded-ctl border border-edge bg-fill-1 text-ink-2"><Waypoints size={19}/></Link>
    <Link to="/projects/new" aria-label="New project" className="flex min-h-11 items-center gap-2 rounded-ctl border border-amber bg-amber-tint px-3 text-label text-amber"><Plus size={16}/>New</Link>
   </nav>
  </header>
  <label className="flex min-h-11 items-center gap-2 rounded-ctl border border-edge bg-[var(--card)] px-3">
   <Search size={17} aria-hidden="true" className="text-ink-3"/>
   <span className="sr-only">Search paths</span>
   <input type="search" aria-label="Search paths" placeholder="Find a project or subject" value={search} onChange={event=>{setSearch(event.target.value);setPage(0)}}
    className="min-w-0 flex-1 bg-transparent py-3 text-body text-ink outline-none"/>
   {search&&<button type="button" aria-label="Clear search" onClick={()=>{setSearch('');setPage(0)}} className="flex size-11 items-center justify-center"><X size={17}/></button>}
  </label>
  <div role="group" aria-label="Project status" data-status-segments=""
   className="flex w-full min-w-0 items-stretch rounded-full border border-edge bg-[var(--paper-2)] p-1">
   {filters.map(value=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>choose(value)}
    className={'min-h-11 min-w-0 flex-1 rounded-full px-2 text-label capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)] '+(filter===value?'bg-[var(--paper)] font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.15)]':'text-ink-2 hover:text-ink')}>{value}</button>)}
  </div>
  {projects.isPending?<><Skeleton h={80}/><Skeleton h={140}/><Skeleton h={140}/></>:
   projects.error?<EmptyState art="plug" title="Paths unavailable" body="Try again when you're connected."
    action={{label:'Try again',onClick:()=>{void projects.refetch()}}}/>:
   !all.length?<EmptyState art="compass" title="Every proof starts somewhere"
    body="Start one with + and let your tutor make a study plan."
    action={{label:'New project',to:'/projects/new'}}/>:
   !visible.length?<div className="space-y-3 py-8 text-center"><p className="text-body text-ink-2">{search?'No projects match':'No projects in this status'}</p>
    {search&&<button type="button" className="min-h-11 rounded-ctl border border-edge px-4 text-label" onClick={()=>setSearch('')}>Clear</button>}</div>:
   <div className="space-y-5">
    {runs.map((run,i)=>run.kind==='single'
     ? <section key={'single-'+i} aria-label="Single-project paths" data-singleton-list=""
        className="divide-y divide-[var(--hair)] overflow-hidden rounded-slab border border-edge bg-[var(--paper)]">
        {run.groups.map(group=><section key={group.id} aria-label={group.name+' projects'} data-group-size={1}>
         {group.items.map(project=><ProjectRow key={project.id} project={project} showSubject pinnedCount={pinnedCount}/>)}
        </section>)}
       </section>
     : <ProjectGroup key={run.group.id} name={run.group.name} glyph={run.group.glyph}
       items={run.group.items} total={run.group.total} collapsed={collapsed.includes(run.group.id)}
       onToggle={()=>toggle(run.group.id)} pinnedCount={pinnedCount}/>)}
    {totalUnpinned>pageSize&&<nav aria-label="Project pages" className="flex flex-wrap items-center justify-between gap-2">
     {page>0&&<button type="button" onClick={()=>setPage(index=>Math.max(0,index-1))}
      className="min-h-11 rounded-ctl border border-edge bg-fill-1 px-4 text-label text-amber">
      Show previous projects
     </button>}
     <span className="text-caption text-ink-2">Page {page+1} of {Math.ceil(totalUnpinned/pageSize)}</span>
     {pageEnd<totalUnpinned&&<button type="button" onClick={()=>setPage(index=>index+1)}
      className="min-h-11 rounded-ctl border border-edge bg-fill-1 px-4 text-label text-amber">
      Show next {Math.min(pageSize,totalUnpinned-pageEnd)} projects
     </button>}
    </nav>}
   </div>}
  <button type="button" onClick={()=>choose(filter==='archived'?'active':'archived')} aria-pressed={filter==='archived'}
   className="flex min-h-11 w-full items-center justify-between border-t border-edge text-left text-label text-ink-2">
   {filter==='archived'?'Back to active projects':'Archived projects'} <ChevronRight size={17}/>
  </button>
  {filter==='archived'&&<p className="text-caption text-ink-3">Archived projects are preserved for undo. Your library may hide them until restored.</p>}
 </Screen>;
}
