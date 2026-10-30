import {useEffect} from 'react';
import {Link,useSearchParams} from 'react-router';
import {ChevronRight,Plus,Waypoints} from 'lucide-react';
import {useProject,useProjects,useSettings} from '../../data/hooks';
import {planPrompt} from '../../lib/chat';
import {Screen} from '../../ui/Screen';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {useToast} from '../../ui/Toast';
import {ProjectChips,GoalOverview,Stages} from '../project/PathsView';

function SelectedPath({slug}:{slug:string}){
 const query=useProject(slug),settings=useSettings(),notify=useToast();
 useEffect(()=>{
  if(query.error)notify("Couldn't load this path.",{tone:'danger',action:{label:'Try again',onClick:()=>{void query.refetch()}}});
 },[query.error,query.refetch,notify]);
 if(query.isPending)return <div className="flex flex-col gap-3"><Skeleton h={44}/><Skeleton h={220}/><Skeleton h={90}/></div>;
 if(query.error||!query.data)return <EmptyState art="plug" title="Path unavailable"
  body="Your progress is safe. Try loading the path again."
  action={{label:'Try again',onClick:()=>{void query.refetch()}}}/>;
 const detail=query.data,now=detail.checkpoints.find(cp=>cp.ui==='now');
 const project=detail.project;
 async function copyPlan(){
  try{await navigator.clipboard.writeText(planPrompt(project.title));notify('Plan prompt copied',{tone:'success'})}
  catch{notify('Unable to copy plan prompt',{tone:'danger'})}
 }
 return <>
  <ProjectChips detail={detail} mode="tab"/>
  <GoalOverview detail={detail} variant={settings.data?.ui?.timeline==='metro'?'metro':'ascent'}/>
  {now&&<Link to={'/p/'+slug+'/cp/'+encodeURIComponent(now.code)}
   className="flex min-h-11 items-center gap-3 rounded-ctl border border-amber-line bg-amber-tint px-4 py-3 text-label text-ink">
   <span className="shrink-0 font-semibold text-amber">{now.code}</span>
   <span className="min-w-0 flex-1 break-words">{now.title}, step {now.currentStep||1}</span>
   <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-amber"/>
  </Link>}
  {detail.checkpoints.length?<Stages detail={detail}/>:<EmptyState art="compass" title="A plan is waiting to be written"
   body="Ask your tutor to turn your goal into stages and checkpoints."
   action={{label:'Copy plan prompt',onClick:()=>{void copyPlan()}}}/>}
  <nav aria-label="More project actions" className="flex flex-wrap gap-x-4 gap-y-2 text-label text-amber">
   <Link to={'/p/'+slug} className="flex min-h-11 items-center gap-1">Sessions and project details <ChevronRight size={15}/></Link>
   <Link to={'/p/'+slug+'?tab=sources'} className="flex min-h-11 items-center gap-1">Sources <ChevronRight size={15}/></Link>
  </nav>
 </>;
}

export default function Page(){
 const projects=useProjects(),[params]=useSearchParams(),notify=useToast();
 useEffect(()=>{
  if(projects.error)notify("Couldn't load your paths.",{tone:'danger',action:{label:'Try again',onClick:()=>{void projects.refetch()}}});
 },[projects.error,projects.refetch,notify]);
 const all=projects.data??[];
 const requested=params.get('project');
 const slug=(all.find(p=>p.slug===requested)??all.find(p=>p.status==='active')??all[0])?.slug;
 return <Screen tabBar className="gap-5">
  <header className="flex min-h-11 items-center justify-between gap-3">
   <h1 className="font-[var(--font-display)] text-title-s font-semibold">Paths</h1>
   <nav aria-label="Path actions" className="flex gap-2">
    <Link to="/atlas" aria-label="Open Atlas" className="flex min-h-11 min-w-11 items-center justify-center rounded-ctl border border-edge bg-fill-1 text-ink-2"><Waypoints size={19}/></Link>
    <Link to="/projects/new" aria-label="New project" className="flex min-h-11 items-center gap-2 rounded-ctl border border-amber bg-amber-tint px-3 text-label text-amber"><Plus size={16}/>New</Link>
   </nav>
  </header>
  {projects.isPending?<><Skeleton h={44}/><Skeleton h={250}/><Skeleton h={130}/></>:
   projects.error?<EmptyState art="plug" title="Paths unavailable" body="Try again when you're connected."
    action={{label:'Try again',onClick:()=>{void projects.refetch()}}}/>:
   !slug?<EmptyState art="compass" title="Every proof starts somewhere"
    body="Create a project, set a goal and let your tutor make a study plan."
    action={{label:'New project',to:'/projects/new'}}/>:
   <SelectedPath key={slug} slug={slug}/>}
 </Screen>;
}
