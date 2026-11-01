import {Tex} from '../../ui/Tex';
import {useQuery} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router';
import {motion,useReducedMotion} from 'motion/react';
import {ArrowLeft,BookOpen,ChevronRight,Check,Layers,MessageCircle,Pause,Play,Waypoints} from 'lucide-react';
import {usePlanRevisions,useProject,useProjects,useSettings} from '../../data/hooks';
import {getApi} from '../../data';
import {afterProjectPaint} from './afterPaint';
import type {CheckpointView,ProjectDetail,SessionSummary} from '../../data/types';
import {chatLink,planPrompt,resumePrompt,studyPrompt} from '../../lib/chat';
import {formatMinutes,relativeTime} from '../../lib/text';
import {Screen} from '../../ui/Screen';
import {Slab} from '../../ui/Slab';
import {Tile} from '../../ui/Tile';
import {IconButton} from '../../ui/IconButton';
import {Button} from '../../ui/Button';
import {Chip} from '../../ui/Chip';
import {Segmented} from '../../ui/Segmented';
import {SegmentBar} from '../../ui/SegmentBar';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {useToast} from '../../ui/Toast';
import {GoalOverview,Stages} from './PathsView';
import {SourcesPanel} from './SourcesPanel';
import {Sheet} from '../../ui/Sheet';

function copyAndChat(prompt:string,client:'claude'|'chatgpt',notify:ReturnType<typeof useToast>){
 void navigator.clipboard?.writeText(prompt).then(()=>notify('Tutor prompt copied',{tone:'success'}))
  .catch(()=>notify('Chat opened; copy was unavailable'));
 window.open(chatLink(client,prompt),'_blank','noopener,noreferrer');
}
function NowCheckpoint({slug,project,cp}:{slug:string;project:ProjectDetail;cp:CheckpointView}){
 const [detailEnabled,setDetailEnabled]=useState(false);
 useEffect(()=>afterProjectPaint(()=>setDetailEnabled(true)),[]);
 const checkpoint=useQuery({queryKey:['checkpoint',slug,cp.code],
  queryFn:()=>getApi().getCheckpoint(slug,cp.code),enabled:detailEnabled});
 const settings=useSettings(),notify=useToast();
 const client=settings.data?.preferredChat??'claude';
 const step=(checkpoint.data?.steps??[])[Math.max(0,cp.currentStep-1)]??'Continue working on this checkpoint';
 const url='/p/'+slug+'/cp/'+cp.code;
 return <Slab as="article" lamp aria-label={'Current checkpoint '+cp.code} className="border border-amber-line-2 p-4">
  <div className="flex items-center justify-between gap-3">
   <div className="flex min-w-0 flex-col gap-1">
    <span className="text-label font-semibold text-amber">{cp.code} · IN PROGRESS</span>
    <h3 className="truncate text-title-s font-semibold"><Tex source={cp.title}/></h3>
   </div>
   <Link to={url} aria-label={'Details for '+cp.code} className="flex size-11 items-center justify-center rounded-ctl text-ink-2"><ChevronRight size={20}/></Link>
  </div>
  {checkpoint.data?.objective&&<p className="mt-3 font-math text-answer italic leading-relaxed text-ink-soft"><Tex source={checkpoint.data.objective}/></p>}
  <div className="mt-4 flex items-center justify-between text-label text-ink-2">
   <span>Step {cp.stepsTotal?Math.min(cp.currentStep,cp.stepsTotal):0} of {cp.stepsTotal}</span>
   <span className="max-w-[70%] truncate"><Tex source={step}/></span>
  </div>
  <div className="mt-2"><SegmentBar total={cp.stepsTotal} done={Math.max(0,cp.currentStep-1)} current={cp.currentStep} label={'Steps for '+cp.title}/></div>
  <div className="mt-4 flex flex-wrap gap-2">
   {checkpoint.data?.pages&&<Chip tone="quiet" icon={BookOpen}>{'p. '+checkpoint.data.pages}</Chip>}
   <Chip tone="quiet" icon={Layers} onClick={()=>window.location.assign('#/review')}>{cp.dueCards} cards due</Chip>
   {checkpoint.data?.sessions.length? <Chip tone="quiet" icon={MessageCircle} onClick={()=>window.location.assign('#/s/'+slug+'/'+checkpoint.data!.sessions[0].number)}>
    {checkpoint.data.sessions.length} sessions</Chip>:null}
  </div>
  <Button size="m" icon={Play} className="mt-5 w-full" onClick={()=>
   copyAndChat(studyPrompt(project.project.title,cp.code,cp.title),client,notify)}>Resume</Button>
 </Slab>;
}
function Sessions({slug,sessions}:{slug:string;sessions:SessionSummary[]}){
 const [page,setPage]=useState(0);
 if(!sessions.length)return <EmptyState art="inbox" title="No sessions yet" body="Resume a checkpoint in your tutor to start an evidence trail."/>;
 const sorted=[...sessions].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)||b.number-a.number);
 const offset=page*20;
 const rows=sorted.slice(offset,offset+20);
 const months=new Map<string,SessionSummary[]>();
 for(const session of rows){
  const key=new Date(session.startedAt).toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const bucket=months.get(key)??[];
  bucket.push(session);
  months.set(key,bucket);
 }
 return <section aria-label="Sessions" className="flex flex-col gap-4">
  <p className="text-label text-ink-3">Sessions {offset+1}–{offset+rows.length} of {sessions.length}</p>
  {[...months.entries()].map(([month,items])=><div key={month} className="flex flex-col gap-2">
   <h3 className="text-label font-semibold uppercase tracking-wider text-ink-2">{month}</h3>
   {items.map(s=>{
    const good=s.goalMet==='yes',partial=s.goalMet==='partial';
    return <Link to={'/s/'+slug+'/'+s.number} key={s.id} className="flex min-h-[70px] items-center gap-3 rounded-slab bg-raised px-4">
     <span className={'flex size-9 shrink-0 items-center justify-center rounded-s '+(good?'bg-success-tint text-easy':partial?'bg-amber-tint text-amber':'bg-fill-2 text-ink-3')}>
      {good?<Check size={18} aria-hidden="true"/>:partial?<Pause size={16} aria-hidden="true"/>:<MessageCircle size={17} aria-hidden="true"/>}
     </span>
     <span className="min-w-0 flex-1">
      <strong className="block truncate text-body-l font-semibold"><Tex source={s.goal}/></strong>
      <span className="mt-1 block text-label text-ink-3">{'S'+s.number+' · '+relativeTime(s.startedAt)+' · '+s.client}</span>
     </span>
     <span className="shrink-0 text-label tabular-nums text-ink-2">{s.minutes===null?s.display:formatMinutes(s.minutes)}</span>
     <ChevronRight size={16} className="shrink-0 text-ink-3"/>
    </Link>;
   })}
  </div>)}
  <div className="flex gap-3">
   {page>0&&<button type="button" className="min-h-11 flex-1 rounded-ctl border border-edge px-4 text-body font-semibold text-amber" onClick={()=>setPage(n=>n-1)}>Previous 20</button>}
   {offset+20<sorted.length&&<button type="button" className="min-h-11 flex-1 rounded-ctl border border-edge px-4 text-body font-semibold text-amber" onClick={()=>setPage(n=>n+1)}>More sessions · {sorted.length-offset-20} remaining</button>}
  </div>
 </section>;
}
function PlanHistory({slug}:{slug:string}){
 const revisions=usePlanRevisions(slug);
 if(revisions.isPending)return <Skeleton h={80}/>;
 if(revisions.error)return <p className="text-label text-ink-3">Plan history is not available yet.</p>;
 if(!revisions.data?.length)return null;
 return <section aria-label="Plan history" className="mt-5 flex flex-col gap-2">
  <h3 className="text-title-s font-semibold">Plan history</h3>
  {revisions.data.map(revision=><Tile key={revision.revision} className="p-3">
   <p className="text-body font-semibold">Plan v{revision.revision}</p>
   <p className="text-label text-ink-3">{new Date(revision.approvedAt).toLocaleDateString()} · <Tex source={revision.summary}/></p>
  </Tile>)}
 </section>;
}
function ProjectSwitcher({open,onClose,current}:{open:boolean;onClose:()=>void;current:string}){
 const projects=useProjects(),navigate=useNavigate(),[search,setSearch]=useState('');
 const list=(projects.data??[]).filter(p=>!p.system&&p.status!=='archived')
  .filter(p=>!search.trim()||[p.title,p.subject?.name??'Unassigned'].some(v=>v.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
  .sort((a,b)=>(Date.parse(b.lastActivityAt??'')||0)-(Date.parse(a.lastActivityAt??'')||0))
  .slice(0,search.trim()?30:6);
 return <Sheet open={open} onClose={onClose} title="Switch project">
  <div className="space-y-3">
   <input aria-label="Find a project" type="search" value={search} onChange={event=>setSearch(event.target.value)}
    placeholder="Find a project" className="min-h-11 w-full rounded-ctl border border-edge bg-[var(--card)] px-3 text-body text-ink"/>
   {projects.isPending?<Skeleton h={120}/>:!list.length?<p className="py-6 text-center text-label text-ink-2">No projects match</p>:
    <div className="space-y-1">{list.map(p=><button type="button" key={p.id}
     aria-current={p.slug===current?'page':undefined}
     onClick={()=>{onClose();navigate('/p/'+p.slug)}}
     className="flex min-h-12 w-full items-center gap-3 rounded-ctl border border-edge px-3 text-left">
     <span className="text-amber" aria-hidden="true">{p.subject?.glyph??'∫'}</span>
     <span className="min-w-0 flex-1 break-words text-body"><Tex source={p.title}/></span>
     <span className="text-caption text-ink-3">{p.done}/{p.total}</span>
     <ChevronRight size={16} className="text-ink-3" aria-hidden="true"/>
    </button>)}</div>}
   <Link to="/projects" onClick={onClose} className="flex min-h-11 items-center justify-center rounded-ctl border border-edge text-label text-amber">All paths</Link>
  </div>
 </Sheet>;
}

export default function Page(){
 const {slug:rawSlug}=useParams(),slug=rawSlug??'';
 const [params,setParams]=useSearchParams(),query=useProject(slug),navigate=useNavigate(),notify=useToast(),reduce=!!useReducedMotion();
 const [switcherOpen,setSwitcherOpen]=useState(false);
 const tab=params.get('tab')==='sessions'?'sessions':params.get('tab')==='sources'?'sources':'path';
 useEffect(()=>{
  if(query.error)notify("Couldn't load this project",{tone:'danger',action:{label:'Try again',onClick:()=>{void query.refetch()}}});
 },[query.error,query.refetch,notify]);
 if(query.isPending)return <Screen title="Project" back="/projects"><Skeleton h={65}/><Skeleton h={55}/><Skeleton h={270}/></Screen>;
 if(query.error||!query.data)return <Screen title="Project" back="/projects"><EmptyState art="plug" title="Project unavailable"
  body="Check your connection or try again." action={{label:'Try again',onClick:()=>{void query.refetch()}}}/></Screen>;
 const data=query.data,project=data.project;
 const now=data.checkpoints.find(cp=>cp.ui==='now');
 function setTab(value:string){const next=new URLSearchParams(params);if(value==='path')next.delete('tab');else next.set('tab',value);setParams(next)}
 return <Screen className="gap-6" >
  <header className="flex items-center gap-3">
   <IconButton icon={ArrowLeft} label="Back to projects" onClick={()=>navigate('/projects')}/>
   <div className="min-w-0 flex-1">
    <h1 aria-label="Project" className="font-[var(--font-display)] text-title-s font-semibold tracking-tight"><button type="button" aria-label={"Switch project from "+project.title} aria-haspopup="dialog" aria-expanded={switcherOpen} onClick={()=>setSwitcherOpen(true)} className="flex min-h-11 max-w-full items-center gap-2 text-left"><span className="min-w-0 break-words"><Tex source={project.title}/></span><ChevronRight size={17} className="shrink-0 text-amber" aria-hidden="true"/></button></h1>
    <p className="mt-1 flex items-center gap-1.5 truncate text-label text-ink-3">
     <BookOpen size={14} aria-hidden="true"/><Tex source={data.sources[0]?.title??data.subject.name}/></p>
   </div>
   <IconButton icon={Waypoints} label="View in Atlas" to="/atlas"/>
  </header>
  {switcherOpen&&<ProjectSwitcher open onClose={()=>setSwitcherOpen(false)} current={slug}/>}
  <GoalOverview detail={data} variant="metro"/>
  <Segmented value={tab} onChange={setTab} tone="raised" options={[
   {value:'path',label:'Path'},{value:'sessions',label:'Sessions',count:data.sessions.length},
   {value:'sources',label:'Sources',count:data.sources.length}
  ]}/>
  <motion.div key={tab} initial={reduce?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reduce?0.15:0.4}}>
   {tab==='path'?
    <div className="flex min-w-0 flex-col gap-4">
     {now&&<NowCheckpoint key={slug+'/'+now.code} slug={slug} cp={now} project={data}/>}
     {data.checkpoints.length?<Stages detail={data}/>:<EmptyState art="compass" title="A plan is waiting to be written"
      body="Ask your tutor to break your goal into checkpoints."
      action={{label:'Copy plan prompt',onClick:()=>{void navigator.clipboard.writeText(planPrompt(project.title));
       notify('Plan prompt copied',{tone:'success'})}}}/>}
    </div>:tab==='sessions'?
    <Sessions slug={slug} sessions={data.sessions}/>:<><SourcesPanel sources={data.sources} projectId={project.id}/><PlanHistory slug={slug}/></>}
  </motion.div>
 </Screen>;
}
