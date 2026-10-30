import {useEffect,useState,useRef} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router';
import {motion,useReducedMotion} from 'motion/react';
import {ArrowLeft,BookOpen,ChevronDown,ChevronRight,Check,Clock3,FileText,Layers,MessageCircle,Pause,Play,Plus,RotateCcw,Waypoints} from 'lucide-react';
import {useAddSource,useCheckpoint,useProject,useSettings} from '../../data/hooks';
import type {CheckpointView,IngestProgress,ProjectDetail,SessionSummary,Source} from '../../data/types';
import {chatLink,planPrompt,resumePrompt,studyPrompt} from '../../lib/chat';
import {formatMinutes,relativeTime} from '../../lib/text';
import {Screen} from '../../ui/Screen';
import {Slab} from '../../ui/Slab';
import {Tile} from '../../ui/Tile';
import {IconButton} from '../../ui/IconButton';
import {Button} from '../../ui/Button';
import {Chip} from '../../ui/Chip';
import {Glyph} from '../../ui/Glyph';
import {StatusNode} from '../../ui/StatusNode';
import {Segmented} from '../../ui/Segmented';
import {SegmentBar} from '../../ui/SegmentBar';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {Rail} from '../../ui/Rail';
import {useToast} from '../../ui/Toast';
import {PageStackArt} from '../../ui/art/PageStackArt';

type Tab='path'|'sessions'|'sources';
function copyAndChat(prompt:string,client:'claude'|'chatgpt',notify:ReturnType<typeof useToast>){
 void navigator.clipboard?.writeText(prompt).then(()=>notify('Tutor prompt copied',{tone:'success'}))
  .catch(()=>notify('Chat opened; copy was unavailable'));
 window.open(chatLink(client,prompt),'_blank','noopener,noreferrer');
}
function NowCheckpoint({slug,project,cp}:{slug:string;project:ProjectDetail;cp:CheckpointView}){
 const checkpoint=useCheckpoint(slug,cp.code),settings=useSettings(),notify=useToast();
 const client=settings.data?.preferredChat??'claude';
 const step=(checkpoint.data?.steps??[])[Math.max(0,cp.currentStep-1)]??'Continue working on this checkpoint';
 const url='/p/'+slug+'/cp/'+cp.code;
 return <Slab as="article" lamp aria-label={'Current checkpoint '+cp.code} className="border border-amber-line-2 p-4">
  <div className="flex items-center justify-between gap-3">
   <div className="flex min-w-0 flex-col gap-1">
    <span className="text-label font-semibold text-amber">{cp.code} · IN PROGRESS</span>
    <h3 className="truncate text-title-s font-semibold">{cp.title}</h3>
   </div>
   <Link to={url} aria-label={'Details for '+cp.code} className="flex size-11 items-center justify-center rounded-ctl text-ink-2"><ChevronRight size={20}/></Link>
  </div>
  {checkpoint.data?.objective&&<p className="mt-3 font-math text-answer italic leading-relaxed text-ink-soft">{checkpoint.data.objective}</p>}
  <div className="mt-4 flex items-center justify-between text-label text-ink-2">
   <span>Step {cp.stepsTotal?Math.min(cp.currentStep,cp.stepsTotal):0} of {cp.stepsTotal}</span>
   <span className="max-w-[70%] truncate">{step}</span>
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
function PathTimeline({slug,detail}:{slug:string;detail:ProjectDetail}){
 const [expanded,setExpanded]=useState(false),settings=useSettings(),notify=useToast();
 const checkpoints=detail.checkpoints,view=expanded?checkpoints:checkpoints.slice(0,8);
 if(!checkpoints.length)return <EmptyState art="compass" title="A plan is waiting to be written"
  body="Ask your tutor to break your goal into checkpoints."
  action={{label:'Copy plan prompt',onClick:()=>{void navigator.clipboard.writeText(planPrompt(detail.project.title));
   notify('Plan prompt copied',{tone:'success'})}}}/>;
 return <ol className="flex flex-col">
  {view.map((cp,index)=>{
   const isCurrent=cp.ui==='now',isProposed=cp.ui==='proposed',isDone=cp.ui==='done'||cp.ui==='revisit';
   const next=view[index+1],connector=next
    ?isDone&&(next.ui==='done'||next.ui==='revisit')?'bg-amber/60':isCurrent||isDone?'bg-linear-to-b from-amber/60 to-edge-3':'border-l border-dashed border-edge-3'
    :'';
   return <li key={cp.id} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
    <div className="relative flex flex-col items-center">
     <div className="z-10 flex size-9 items-center justify-center"><StatusNode status={cp.ui}/></div>
     {next&&<div aria-hidden="true" className={'min-h-7 w-px flex-1 '+connector}/>}
    </div>
    <div className={'min-w-0 '+(isCurrent?'pb-5':'pb-5')}>
     {isCurrent?<NowCheckpoint slug={slug} cp={cp} project={detail}/>:isProposed?
      <Link to="/proposals?tab=plan" className="flex min-h-12 flex-col justify-center gap-1 rounded-ctl px-1 text-ink-soft">
       <span className="flex items-center gap-2 text-body-l"><span className="min-w-0 flex-1 truncate">{cp.title}</span><Chip tone="amber">Proposed</Chip></span>
       <span className="text-label text-ink-3">Tap to approve</span>
      </Link>:
      <Link to={'/p/'+slug+'/cp/'+cp.code} className="flex min-h-12 flex-col justify-center gap-1 rounded-ctl px-1">
       <span className="flex items-center gap-3">
        <span className={'min-w-0 flex-1 truncate text-headline '+(cp.ui==='locked'?'text-ink-3':'text-ink-soft')}>{cp.title}</span>
        <span className="text-label text-ink-3">{cp.code}</span>
       </span>
       {cp.ui==='revisit'&&<span className="flex items-center gap-1 text-label text-amber"><RotateCcw size={13} aria-hidden="true"/>Re-check due</span>}
       {cp.ui==='next'&&<span className="text-label text-ink-3">Next checkpoint</span>}
      </Link>}
    </div>
   </li>;
  })}
  {!expanded&&checkpoints.length>8&&<li>
   <button type="button" onClick={()=>setExpanded(true)} className="ml-11 flex min-h-11 items-center gap-2 text-label text-amber">
    {checkpoints.length-8} more <ChevronDown size={16}/>
   </button>
  </li>}
 </ol>;
}
function Sessions({slug,sessions}:{slug:string;sessions:SessionSummary[]}){
 if(!sessions.length)return <EmptyState art="inbox" title="No sessions yet" body="Resume a checkpoint in your tutor to start an evidence trail."/>;
 return <div className="flex flex-col gap-2">{sessions.map(s=>{
  const good=s.goalMet==='yes',partial=s.goalMet==='partial';
  return <Link to={'/s/'+slug+'/'+s.number} key={s.id} className="flex min-h-[70px] items-center gap-3 rounded-slab bg-raised px-4">
   <span className={'flex size-9 shrink-0 items-center justify-center rounded-s '+(good?'bg-success-tint text-easy':partial?'bg-amber-tint text-amber':'bg-fill-2 text-ink-3')}>
    {good?<Check size={18} aria-hidden="true"/>:partial?<Pause size={16} aria-hidden="true"/>:<MessageCircle size={17} aria-hidden="true"/>}
   </span>
   <span className="min-w-0 flex-1">
    <strong className="block truncate text-body-l font-semibold">{s.goal}</strong>
    <span className="mt-1 block text-label text-ink-3">{'S'+s.number+' · '+relativeTime(s.startedAt)+' · '+s.client}</span>
   </span>
   <span className="text-label tabular-nums text-ink-2">{s.minutes===null?s.display:formatMinutes(s.minutes)}</span>
   <ChevronRight size={16} className="text-ink-3"/>
  </Link>;
 })}</div>;
}
function SourceList({projectId,sources}:{projectId:string;sources:Source[]}){
 const add=useAddSource(),notify=useToast(),picker=useRef<HTMLInputElement>(null),
  [progress,setProgress]=useState<IngestProgress|null>(null),[pending,setPending]=useState(false),[name,setName]=useState('');
 async function upload(file:File|undefined){
  if(!file)return;
  if(!/\.pdf$/i.test(file.name)||file.size>50*1024*1024||file.size===0){
   notify('Choose a nonempty PDF under 50 MB',{tone:'danger'});return;
  }
  setPending(true);setName(file.name);
  try{
   await add.mutateAsync({projectId,file,onProgress:setProgress});
   notify('PDF added',{tone:'success'});setName('');setProgress(null);
  }catch(error){notify(error instanceof Error?error.message:'PDF upload failed',{tone:'danger'})}
  finally{setPending(false);if(picker.current)picker.current.value=''}
 }
 return <section aria-label="Sources" className="flex flex-col gap-3">
  {sources.map(source=><Tile key={source.id} className="flex items-center gap-3 p-3">
   <span className="flex h-[58px] w-[46px] shrink-0 items-center justify-center rounded-s bg-amber-tint text-caption font-semibold text-amber">PDF</span>
   <span className="min-w-0 flex-1"><strong className="block truncate text-body-l">{source.title}</strong>
    <span className="mt-1 block text-label text-ink-3">{source.pageCount??'—'} pages · {source.status}</span>
   </span>
   {source.status==='ready'?<Check size={18} className="text-easy"/>:<FileText size={18} className="text-ink-3"/>}
  </Tile>)}
  <input ref={picker} type="file" hidden accept=".pdf,application/pdf"
   onChange={e=>{void upload(e.target.files?.[0])}}/>
  <button type="button" disabled={pending} onClick={()=>picker.current?.click()}
   className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-slab border border-dashed border-edge-3 bg-fill-1 text-body text-ink-2">
   <Plus size={22} className="text-amber"/>{pending?'Uploading '+name:'Add a PDF'}
   {progress&&<span className="text-label text-ink-3">{progress.message+' '+progress.page+'/'+progress.pageCount}</span>}
  </button>
  {progress&&<Rail value={progress.pageCount?progress.page/progress.pageCount:0} label="PDF upload progress" sheen/>}
 </section>;
}
export default function Page(){
 const {slug:rawSlug}=useParams(),slug=rawSlug??'';
 const [params,setParams]=useSearchParams(),query=useProject(slug),navigate=useNavigate(),notify=useToast(),reduce=!!useReducedMotion();
 const tab=params.get('tab')==='sessions'?'sessions':params.get('tab')==='sources'?'sources':'path';
 useEffect(()=>{
  if(query.error)notify("Couldn't load this project",{tone:'danger',action:{label:'Try again',onClick:()=>{void query.refetch()}}});
 },[query.error,query.refetch,notify]);
 if(query.isPending)return <Screen title="Project" back="/projects"><Skeleton h={65}/><Skeleton h={55}/><Skeleton h={270}/></Screen>;
 if(query.error||!query.data)return <Screen title="Project" back="/projects"><EmptyState art="plug" title="Project unavailable"
  body="Check your connection or try again." action={{label:'Try again',onClick:()=>{void query.refetch()}}}/></Screen>;
 const data=query.data,project=data.project;
 const now=data.checkpoints.find(cp=>cp.ui==='now');
 const currentPosition=now?data.checkpoints.indexOf(now)+1:undefined;
 function setTab(value:string){const next=new URLSearchParams(params);if(value==='path')next.delete('tab');else next.set('tab',value);setParams(next)}
 return <Screen className="gap-6" >
  <header className="flex items-center gap-3">
   <IconButton icon={ArrowLeft} label="Back to projects" onClick={()=>navigate('/projects')}/>
   <div className="min-w-0 flex-1">
    <h1 aria-label="Project" className="truncate text-num-l font-semibold tracking-tight">{project.title}</h1>
    <p className="mt-1 flex items-center gap-1.5 truncate text-label text-ink-3">
     <BookOpen size={14} aria-hidden="true"/>{data.sources[0]?.title??data.subject.name}</p>
   </div>
   <IconButton icon={Waypoints} label="View in Atlas" to="/atlas"/>
  </header>
  <section aria-label="Checkpoint progress">
   <p className="mb-3 flex items-baseline gap-1.5 tabular-nums">
    <strong className="text-num-xl leading-none">{data.done}</strong>
    <span className="text-headline text-ink-3">/ {data.total}</span>
    <span className="ml-auto text-label text-ink-3">checkpoints</span>
   </p>
   <SegmentBar total={data.total} done={data.done} current={currentPosition}/>
  </section>
  <Segmented value={tab} onChange={setTab} tone="raised" options={[
   {value:'path',label:'Path'},{value:'sessions',label:'Sessions',count:data.sessions.length},
   {value:'sources',label:'Sources',count:data.sources.length}
  ]}/>
  <motion.div key={tab} initial={reduce?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reduce?0.15:0.4}}>
   {tab==='path'?<PathTimeline slug={slug} detail={data}/>:tab==='sessions'?
    <Sessions slug={slug} sessions={data.sessions}/>:<SourceList sources={data.sources} projectId={project.id}/>}
  </motion.div>
 </Screen>;
}
