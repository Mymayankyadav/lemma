import {Link,useNavigate} from 'react-router';
import {useEffect} from 'react';
import {ArrowRight,BookOpen,ChevronRight,Layers,MessageCircle,Plus,Waypoints} from 'lucide-react';
import {useAtlas,useProject,useProjects} from '../../data/hooks';
import type {ProjectSummary} from '../../data/types';
import {planPrompt} from '../../lib/chat';
import {useToast} from '../../ui/Toast';
import {Screen} from '../../ui/Screen';
import {Slab} from '../../ui/Slab';
import {Tile} from '../../ui/Tile';
import {Glyph} from '../../ui/Glyph';
import {ProgressRing} from '../../ui/ProgressRing';
import {Rail} from '../../ui/Rail';
import {Orb} from '../../ui/Orb';
import {Chip} from '../../ui/Chip';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';

function Featured({project}:{project:ProjectSummary}){
 const detail=useProject(project.slug);
 return <Slab lamp as="article" className="p-[22px]">
  <span aria-hidden="true" className="pointer-events-none absolute -right-7 -top-14 select-none font-math text-[250px] italic leading-none text-amber opacity-[0.07]">{project.subject.glyph}</span>
  <div className="relative z-10 flex items-center justify-between gap-3">
   <div className="flex min-w-0 flex-col gap-1">
    <Glyph subject={project.subject.glyph} hue={project.subject.hue} size={40}/>
    <Link to={'/p/'+project.slug} className="mt-3 truncate text-[23px] font-semibold tracking-tight">{project.title}</Link>
    <p className="line-clamp-2 font-math text-[16px] italic leading-snug text-ink-2">{detail.data?.project.goal??'Make steady progress on your learning goal.'}</p>
   </div>
   <ProgressRing value={project.total?project.done/project.total:0} label="Checkpoints complete"/>
  </div>
  <div className="relative mt-6 flex flex-wrap gap-4 text-[12px] text-ink-3">
   <span className="flex items-center gap-1.5"><BookOpen size={15} aria-hidden="true"/>{project.sourcesCount} {project.sourcesCount===1?'book':'books'}</span>
   <span className="flex items-center gap-1.5"><Layers size={15} aria-hidden="true"/>{project.cardsCount} cards</span>
   <span className="flex items-center gap-1.5"><MessageCircle size={15} aria-hidden="true"/>{project.sessionsCount} sessions</span>
  </div>
  <Link to={'/p/'+project.slug} className="relative mt-4 flex min-h-12 items-center gap-2 border-t border-edge pt-3 text-[14px] text-ink-soft">
   <span aria-hidden="true" className="size-2 rounded-full bg-amber shadow-[0_0_9px_var(--amber)]"/>
   <span className="min-w-0 flex-1 truncate">{project.current?
     project.current.title+', step '+project.current.step:'See your study path'}</span>
   <ChevronRight size={17} aria-hidden="true" className="text-ink-3"/>
  </Link>
 </Slab>;
}
function ProjectTile({project}:{project:ProjectSummary}){
 return <Link to={'/p/'+project.slug} className="block focus-visible:outline-2 focus-visible:outline-amber">
  <Tile className="relative overflow-hidden px-5 py-4">
   <span aria-hidden="true" className="pointer-events-none absolute -right-4 -top-6 select-none font-math text-[150px] italic leading-none text-ink opacity-[0.035]">{project.subject.glyph}</span>
   <div className="relative flex items-center justify-between gap-3">
    <h3 className="truncate text-[18px] font-semibold">{project.title}</h3>
    <span className="text-[14px] tabular-nums text-ink-2">{project.done}/{project.total}</span>
   </div>
   <Rail label={project.title+' completion'} value={project.total?project.done/project.total:0} className="my-3"/>
   <p className="relative truncate text-[13px] text-ink-3">{
    project.current?'Next: '+project.current.title:'No active checkpoint'}</p>
  </Tile>
 </Link>;
}
function PlanningTile({project}:{project:ProjectSummary}){
 const notify=useToast();
 const prompt=planPrompt(project.title);
 async function copy(){
  try{await navigator.clipboard.writeText(prompt);notify('Prompt copied',{tone:'success'})}
  catch{notify('Unable to copy prompt',{tone:'danger'})}
 }
 return <Tile className="p-5">
  <Link to={'/p/'+project.slug} className="flex items-center gap-2 text-[17px] font-semibold">
   <Glyph subject={project.subject.glyph} size={32} hue={project.subject.hue}/>
   <span className="min-w-0 flex-1 truncate">{project.title}</span><ChevronRight size={18} className="text-ink-3"/>
  </Link>
  <div className="mt-4 flex flex-wrap items-center gap-2">
   <Chip tone="amber">Needs a plan</Chip>
   <Chip tone="quiet" onClick={()=>{void copy()}}>Copy “{prompt}”</Chip>
  </div>
 </Tile>;
}
function AtlasShortcut(){
 const atlas=useAtlas();
 const ideas=atlas.data?.concepts.length??0,revisit=atlas.data?.concepts.filter(c=>c.status==='revisit').length??0;
 return <Link to="/atlas" className="block">
  <Tile className="relative flex h-[96px] items-center justify-between gap-4 overflow-hidden bg-obsidian-deep px-5">
   <div className="relative z-10 flex items-center gap-3">
    <span className="flex size-11 items-center justify-center rounded-s bg-amber-tint text-amber"><Waypoints size={24} aria-hidden="true"/></span>
    <div><strong className="text-[18px]">Atlas</strong>
     <p className="text-[12px] text-ink-3">{ideas} ideas{revisit>0?', '+revisit+' to revisit':''}</p></div>
   </div>
   <ChevronRight className="relative z-10 text-ink-3" size={18}/>
   <div aria-hidden="true" className="pointer-events-none absolute right-16 top-3 size-24 rounded-full opacity-30" style={{background:'radial-gradient(circle,var(--amber-tint-2),transparent 70%)'}}/>
  </Tile>
 </Link>;
}
export default function Page(){
 const projects=useProjects(),navigate=useNavigate(),notify=useToast();
 useEffect(()=>{
  if(projects.error)notify("Couldn't load your projects.",{tone:'danger',action:{label:'Try again',onClick:()=>{void projects.refetch()}}});
 },[projects.error,projects.refetch,notify]);
 if(projects.isPending)return <Screen title="Projects" tabBar actions={<Orb icon={Plus} size={64} label="New project" onClick={()=>navigate('/projects/new')}/>}>
  <Skeleton h={250} radius={28}/><Skeleton h={116}/><Skeleton h={116}/></Screen>;
 if(projects.error)return <Screen title="Projects" tabBar><EmptyState art="plug" title="Projects unavailable" body="Try again when you're connected."
  action={{label:'Try again',onClick:()=>{void projects.refetch()}}}/></Screen>;
 const all=projects.data??[],active=all.filter(p=>p.status==='active');
 const featured=active[0],remaining=active.slice(1),planning=all.filter(p=>p.status==='planning'),
  paused=all.filter(p=>p.status==='paused'),done=all.filter(p=>p.status==='done');
 return <Screen title="Projects" tabBar actions={<Orb icon={Plus} size={64} label="New project" onClick={()=>navigate('/projects/new')}/>}>
  {all.length===0?<EmptyState art="compass" title="Every proof starts somewhere"
   body="Create a project, set a goal and let your tutor make a study plan."
   action={{label:'New project',to:'/projects/new'}}/>:
   <>
    {featured&&<Featured project={featured}/>}
    {remaining.map(p=><ProjectTile key={p.id} project={p}/>)}
    {planning.map(p=><PlanningTile key={p.id} project={p}/>)}
    {paused.length>0&&<details className="rounded-slab border border-edge p-4">
     <summary className="cursor-pointer text-[14px] text-ink-2">Paused · {paused.length}</summary>
     <div className="mt-3 flex flex-col gap-3">{paused.map(p=><ProjectTile key={p.id} project={p}/>)}</div>
    </details>}
    {done.length>0&&<details className="rounded-slab border border-edge p-4">
     <summary className="cursor-pointer text-[14px] text-ink-2">Done · {done.length}</summary>
     <div className="mt-3 flex flex-col gap-3">{done.map(p=><ProjectTile key={p.id} project={p}/>)}</div>
    </details>}
    <AtlasShortcut/>
   </>}
 </Screen>;
}
