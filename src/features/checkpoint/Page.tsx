import {Tex} from '../../ui/Tex';
import {useNavigate,useParams} from 'react-router';
import {BookOpen,Check,ChevronRight,Circle,Clock3,HelpCircle,Layers,MessageCircle,RotateCcw,Target} from 'lucide-react';
import {useCheckpoint,useInsightData,useProject,useSettings} from '../../data/hooks';
import type {CheckpointView} from '../../data/types';
import {chatLink,studyPrompt} from '../../lib/chat';
import {scheduleDetail} from '../../lib/schedule';
import {scheduleForVisibleProject} from '../project/scheduleCache';
import ProjectPage from '../project/Page';
import {Sheet} from '../../ui/Sheet';
import {SectionHeading} from '../../ui/SectionHeading';
import {Chip} from '../../ui/Chip';
import {Button} from '../../ui/Button';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {useToast} from '../../ui/Toast';

const statusTitles:Record<CheckpointView['ui'],string>={
 done:'Demonstrated',revisit:'Re-check due',now:'In progress',next:'Up next',locked:'Locked',proposed:'Proposed',
};
export default function Page(){
 const {slug:slugParam,code:codeParam}=useParams(),slug=slugParam??'',code=codeParam??'';
 const navigate=useNavigate(),query=useCheckpoint(slug,code),project=useProject(slug),settings=useSettings(),insight=useInsightData(30),notify=useToast();
 const close=()=>navigate('/p/'+slug);
 async function study(){
  const title=project.data?.project.title??slug,cp=query.data?.view;
  if(!cp)return;
  const prompt=studyPrompt(title,cp.code,cp.title),client=settings.data?.preferredChat??'claude';
  void navigator.clipboard?.writeText(prompt).then(()=>notify('Study prompt copied',{tone:'success'}))
   .catch(()=>notify('Chat opened; prompt copy failed',{tone:'danger'}));
  window.open(chatLink(client,prompt),'_blank','noopener,noreferrer');
 }
 const detail=query.data,view=detail?.view;
 const schedule=project.data?scheduleForVisibleProject(project.data,insight.data?.checkpointEvents).rows:[];
 const scheduled=schedule.find(row=>row.checkpoint.code===view?.code);
 const scheduleText=scheduled?scheduleDetail(scheduled):null;
 return <>
  {/* A checkpoint is a sheet over its actual project path, not a blank route. */}
  <div data-sheet-background aria-hidden="true" inert><ProjectPage/></div>
  <h1 className="sr-only">Checkpoint</h1>
  <Sheet open onClose={close} title={view?.title??'Checkpoint'}>
   {query.isPending?<div className="flex flex-col gap-3"><Skeleton h={35}/><Skeleton h={70}/><Skeleton h={150}/></div>:
    query.error||!detail||!view?<EmptyState art="plug" title="Checkpoint unavailable" body="Try again or return to the project."
     action={{label:'Try again',onClick:()=>{void query.refetch()}}}/>:
    <div className="flex flex-col gap-5">
     <div className="flex flex-wrap items-center gap-2">
      <Chip tone="amber">{view.code}</Chip>
      <Chip tone={view.ui==='done'?'success':view.ui==='revisit'?'amber':'quiet'}>{statusTitles[view.ui]}</Chip>
      {view.stage&&<Chip tone="quiet"><Tex source={view.stage}/></Chip>}
     </div>
     {scheduleText&&<p aria-label="Checkpoint schedule" className="rounded-ctl border border-edge bg-raised px-3 py-2 text-label text-ink-2">{scheduleText}</p>}
     <p className="font-math text-title-s italic leading-relaxed text-ink-soft"><Tex source={detail.objective}/></p>
     <section className="flex flex-col gap-2 rounded-ctl border border-edge bg-raised p-4">
      <SectionHeading as="h3" className="flex items-center gap-2 text-ink-2"><Target size={17} className="text-amber"/>Evidence required</SectionHeading>
      <p className="text-body leading-relaxed text-ink-soft"><Tex source={detail.criterion}/></p>
     </section>
     <section aria-label="Checkpoint steps">
      <SectionHeading as="h3" className="mb-3 text-ink-2">Steps</SectionHeading>
      <ol className="flex flex-col gap-3">
       {detail.steps.map((step,i)=>{
        const complete=i<view.currentStep,active=i===view.currentStep;
        return <li key={i} className="flex items-start gap-3">
         <span className={'flex size-7 shrink-0 items-center justify-center rounded-full '+(complete?'bg-amber text-amber-ink':active?'border border-amber bg-amber-tint text-amber':'border border-edge-3 text-ink-3')}>
          {complete?<Check size={16} aria-hidden="true"/>:active?<Circle size={10} fill="currentColor" aria-hidden="true"/>:i+1}
         </span>
         <span className={'min-w-0 flex-1 pt-1 text-body '+(complete?'text-ink-soft':active?'font-semibold text-ink':'text-ink-3')}><Tex source={step}/></span>
        </li>;
       })}
      </ol>
     </section>
     {(detail.pages||detail.sourceShort)&&<div className="flex flex-wrap gap-2">
      <Chip icon={BookOpen}>{detail.sourceShort??'Source'}{detail.pages?' · p. '+detail.pages:''}</Chip>
     </div>}
     {detail.prereqs.length>0&&<section aria-label="Prerequisites">
      <SectionHeading as="h3" className="mb-2 text-ink-2">Prerequisites</SectionHeading>
      <div className="flex flex-wrap gap-2">{detail.prereqs.map(p=><button key={p} type="button"
       onClick={()=>navigate('/p/'+slug+'/cp/'+p)} className="min-h-11 rounded-chip bg-fill-1 px-3 text-label text-amber">{p}</button>)}</div>
     </section>}
     {detail.concepts.length>0&&<section aria-label="Concepts">
      <SectionHeading as="h3" className="mb-2 text-ink-2">Concepts</SectionHeading>
      <div className="flex flex-wrap gap-2">{detail.concepts.map(concept=><button key={concept.slug} type="button"
       onClick={()=>navigate('/atlas?focus='+encodeURIComponent(concept.slug))}
       className="min-h-11 rounded-chip border border-edge-2 bg-fill-1 px-3 text-label text-ink-soft"><Tex source={concept.name}/></button>)}</div>
     </section>}
     {detail.recheckPrompt&&<div className="flex items-start gap-2 rounded-ctl bg-amber-tint px-4 py-3 text-label text-amber">
      <RotateCcw size={18} className="mt-0.5 shrink-0"/><span>{view.ui==='revisit'?'Re-check due':'Next re-check'}: <Tex source={detail.recheckPrompt}/></span>
     </div>}
     {detail.events.length>0&&<section aria-label="Recent evidence">
      <SectionHeading as="h3" className="mb-3 text-ink-2">Recent evidence</SectionHeading>
      <div className="flex flex-col gap-3">{detail.events.slice(0,8).map(event=><article key={event.id}
       className="rounded-ctl border border-edge bg-raised px-4 py-3">
       <div className="flex items-center gap-2 text-label text-ink-3">
        {event.kind==='hint'?<HelpCircle size={15}/>:<MessageCircle size={15}/>}
        <span className="flex-1 capitalize">{event.kind.replaceAll('_',' ')}</span>
        {event.hintLevel!==null&&<span>{'Hint '+event.hintLevel}</span>}
        <span>{new Date(event.createdAt).toLocaleDateString()}</span>
       </div>
       <p className="mt-2 line-clamp-3 text-label leading-relaxed text-ink-soft"><Tex source={event.body}/></p>
      </article>)}</div>
     </section>}
     {view.ui==='proposed'?
      <Button size="xl" onClick={()=>navigate('/proposals?tab=plan')} className="w-full">Review this proposal</Button>:
      <Button size="xl" onClick={()=>{void study()}} icon={MessageCircle} className="w-full">Study this</Button>}
     <div className="flex flex-wrap gap-2">
      <button type="button" onClick={()=>navigate('/review')} className="flex min-h-11 items-center gap-2 rounded-chip bg-fill-1 px-3 text-label text-ink-2">
       <Layers size={17} aria-hidden="true"/>{detail.cardsCount} cards <ChevronRight size={14}/>
      </button>
      {detail.sessions.length>0&&<button type="button" onClick={()=>navigate('/s/'+slug+'/'+detail.sessions[0].number)}
       className="flex min-h-11 items-center gap-2 rounded-chip bg-fill-1 px-3 text-label text-ink-2">
       <Clock3 size={16} aria-hidden="true"/>{detail.sessions.length} sessions <ChevronRight size={14}/>
      </button>}
     </div>
    </div>}
  </Sheet>
 </>;
}
