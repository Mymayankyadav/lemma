import {useEffect,useMemo,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router';
import {ChevronDown,ChevronRight,MoreHorizontal,Plus,Search,Waypoints,X} from 'lucide-react';
import {useProjects,useUpdateProject} from '../../data/hooks';
import type {ProjectSummary,ProjectStatus} from '../../data/types';
import {Screen} from '../../ui/Screen';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {useToast} from '../../ui/Toast';

type Filter='active'|'paused'|'done'|'archived';
const filters:Filter[]=['active','paused','done'];
const active=(status:ProjectStatus)=>status==='active'||status==='planning';
const matches=(project:ProjectSummary,filter:Filter)=>filter==='active'?active(project.status):project.status===filter;
const newest=(a:ProjectSummary,b:ProjectSummary)=>(Date.parse(b.lastActivityAt??'')||0)-(Date.parse(a.lastActivityAt??'')||0);
const pct=(project:ProjectSummary)=>project.total?Math.round(100*project.done/project.total):0;

function MiniMetro({project}:{project:ProjectSummary}){
 const percent=pct(project);
 return <div className="flex min-w-0 items-center gap-2">
  <div role="img" aria-label={percent+' percent complete'} className="relative h-6 min-w-12 flex-1" data-mini-metro>
   <span className="absolute inset-x-0 top-[11px] h-[2px] bg-[var(--line)]"/>
   <span className="absolute left-0 top-[11px] h-[2px] bg-[var(--accent)]" style={{width:percent+'%'}}/>
   {[0,1,2,3,4].map(n=><span key={n} aria-hidden="true" className="absolute top-[8px] h-2 w-[2px] bg-[var(--ink-3)]" style={{left:n*25+'%'}}/>)}
  </div>
  <span className="shrink-0 font-[var(--font-num)] text-caption tabular-nums text-ink-2">{percent}%</span>
 </div>;
}

function ProjectRow({project}:{project:ProjectSummary}){
 const update=useUpdateProject(),notify=useToast(),[menu,setMenu]=useState(false);
 const hold=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clear=()=>{if(hold.current!==null){clearTimeout(hold.current);hold.current=null}};
 const actions:{label:string;patch:{pinned?:boolean;status?:ProjectStatus}}[]=[
  {label:project.pinned?'Unpin':'Pin',patch:{pinned:!project.pinned}},
  {label:'Set active',patch:{status:'active'}},
  {label:'Pause',patch:{status:'paused'}},
  {label:'Finish',patch:{status:'done'}},
  {label:'Archive',patch:{status:'archived'}},
 ];
 async function act(label:string,patch:{pinned?:boolean;status?:ProjectStatus}){
  setMenu(false);
  try{await update.mutateAsync({id:project.id,patch});notify(label+' saved',{tone:'success'})}
  catch(error){notify(error instanceof Error?error.message:'Unable to update project',{tone:'danger'})}
 }
 useEffect(()=>()=>clear(),[]);
 return <article className="rounded-slab border border-edge bg-[var(--card)] p-3" data-project-row={project.slug}
  onContextMenu={event=>{event.preventDefault();setMenu(true)}}
  onPointerDown={event=>{if(event.pointerType!=='mouse'){clear();hold.current=setTimeout(()=>setMenu(true),550)}}}
  onPointerUp={clear} onPointerCancel={clear} onPointerLeave={clear}>
  <div className="flex items-start gap-2">
   <Link to={'/p/'+project.slug} className="min-w-0 flex-1 rounded-ctl focus-visible:outline-2 focus-visible:outline-amber">
    <div className="flex items-center gap-2">
     <span aria-hidden="true" className="text-title-s text-amber">{project.subject?.glyph??'∫'}</span>
     <span className="min-w-0 flex-1 break-words text-body-l font-semibold">{project.title}</span>
     {project.pinned&&<span className="shrink-0 text-caption text-amber">Pinned</span>}
     <ChevronRight size={17} className="shrink-0 text-ink-3" aria-hidden="true"/>
    </div>
    <div className="mt-1 text-caption text-ink-2">{project.current?'Now '+project.current.code+' '+project.current.title:project.total?'Plan complete':'Your tutor fills in the plan'}</div>
   </Link>
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

function ProjectGroup({name,glyph,items,collapsed,onToggle}:{name:string;glyph:string;items:ProjectSummary[];collapsed:boolean;onToggle:()=>void}){
 return <section aria-label={name+' projects'} className="space-y-2">
  <button type="button" aria-expanded={!collapsed} onClick={onToggle}
   className="flex min-h-11 w-full items-center gap-2 border-b border-edge text-left">
   <span aria-hidden="true" className="text-title-s text-amber">{glyph}</span>
   <h2 className="min-w-0 flex-1 break-words font-[var(--font-display)] text-title-s">{name}</h2>
   <span className="text-caption text-ink-2">{items.length} {items.length===1?'project':'projects'}</span>
   <ChevronDown size={17} className={'text-ink-3 transition-transform '+(collapsed?'-rotate-90':'')}/>
  </button>
  {!collapsed&&<div className="space-y-2">{items.map(project=><ProjectRow key={project.id} project={project}/>)}</div>}
 </section>;
}

export default function Page(){
 const projects=useProjects(),notify=useToast(),[params,setParams]=useSearchParams();
 const [search,setSearch]=useState(''),[collapsed,setCollapsed]=useState<string[]>([]);
 const filter=(['active','paused','done','archived'].includes(params.get('status')??'')?params.get('status'):'active') as Filter;
 useEffect(()=>{
  if(projects.error)notify("Couldn't load your paths.",{tone:'danger',action:{label:'Try again',onClick:()=>{void projects.refetch()}}});
 },[projects.error,projects.refetch,notify]);
 const all=useMemo(()=>(projects.data??[]).filter(project=>!project.system),[projects.data]);
 const visible=useMemo(()=>all.filter(project=>matches(project,filter)&&
  (!search.trim()||[project.title,project.subject?.name??'Unassigned'].some(value=>value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))).sort(newest),[all,filter,search]);
 const pinned=visible.filter(project=>project.pinned).slice(0,4);
 const pinnedIds=new Set(pinned.map(project=>project.id));
 const groups=useMemo(()=>{
  const map=new Map<string,{name:string;glyph:string;items:ProjectSummary[]}>();
  for(const project of visible){
   if(pinnedIds.has(project.id))continue;
   const key=project.subject?.id??'unassigned';
   const group=map.get(key)??{name:project.subject?.name??'Unassigned',glyph:project.subject?.glyph??'∫',items:[]};
   group.items.push(project);map.set(key,group);
  }
  return [...map.entries()].map(([id,group])=>({id,...group}));
 },[visible,pinnedIds]);
 const toggle=(id:string)=>setCollapsed(items=>items.includes(id)?items.filter(item=>item!==id):[...items,id]);
 const choose=(next:Filter)=>{const p=new URLSearchParams(params);if(next==='active')p.delete('status');else p.set('status',next);setParams(p)};
 return <Screen tabBar className="gap-4">
  <header className="flex min-h-11 items-center justify-between gap-3">
   <h1 className="font-[var(--font-display)] text-title-s font-semibold">Paths</h1>
   <nav aria-label="Path actions" className="flex gap-2">
    <Link to="/atlas" aria-label="Open Atlas" className="flex min-h-11 min-w-11 items-center justify-center rounded-ctl border border-edge bg-fill-1 text-ink-2"><Waypoints size={19}/></Link>
    <Link to="/projects/new" aria-label="New project" className="flex min-h-11 items-center gap-2 rounded-ctl border border-amber bg-amber-tint px-3 text-label text-amber"><Plus size={16}/>New</Link>
   </nav>
  </header>
  <label className="flex min-h-11 items-center gap-2 rounded-ctl border border-edge bg-[var(--card)] px-3">
   <Search size={17} aria-hidden="true" className="text-ink-3"/>
   <span className="sr-only">Search paths</span>
   <input type="search" aria-label="Search paths" placeholder="Find a project or subject" value={search} onChange={event=>setSearch(event.target.value)}
    className="min-w-0 flex-1 bg-transparent py-3 text-body text-ink outline-none"/>
   {search&&<button type="button" aria-label="Clear search" onClick={()=>setSearch('')} className="flex size-11 items-center justify-center"><X size={17}/></button>}
  </label>
  <div role="group" aria-label="Project status" className="grid grid-cols-3 gap-2">
   {filters.map(value=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>choose(value)}
    className={'min-h-11 rounded-ctl border px-2 text-label capitalize '+(filter===value?'border-amber bg-amber-tint text-amber':'border-edge bg-[var(--card)] text-ink-2')}>{value}</button>)}
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
    {pinned.length>0&&<ProjectGroup name="Pinned" glyph="★" items={pinned} collapsed={collapsed.includes('pinned')} onToggle={()=>toggle('pinned')}/>}
    {groups.map(group=><ProjectGroup key={group.id} name={group.name} glyph={group.glyph} items={group.items}
     collapsed={collapsed.includes(group.id)} onToggle={()=>toggle(group.id)}/>)}
   </div>}
  <button type="button" onClick={()=>choose('archived')} aria-pressed={filter==='archived'}
   className="flex min-h-11 w-full items-center justify-between border-t border-edge text-left text-label text-ink-2">
   Archived projects <ChevronRight size={17}/>
  </button>
  {filter==='archived'&&<p className="text-caption text-ink-3">Archived projects are preserved for undo. Your library may hide them until restored.</p>}
 </Screen>;
}
