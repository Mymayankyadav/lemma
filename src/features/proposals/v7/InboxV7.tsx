import {Illustration} from '../../../ui/v7/Illustration';
import {LottieMoment} from '../../../ui/v7/LottieMoment';
import {useCallback,useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Link,useSearchParams} from 'react-router';
import {Check,LayoutList,Layers,Link as LinkIcon,Unlink,Minus,MoveRight,Pencil,Plus,X} from 'lucide-react';
import {useProject,useProjects,useProposals,useSettings} from '../../../data/hooks';
import type {Proposal,ProjectSummary} from '../../../data/types';
import {DetailHeader} from '../../../app/v7/V7Shell';
import {Button,Checkbox,IconButton,Segmented,Sheet,Skeleton} from '../../../ui/v7/components';
import {Tag} from '../../../ui/v7/KitPrimitives';
import {Emblem} from '../../../ui/v7/Emblem';
import {subjectClass} from '../../../ui/v7/Subject';
import {MathText} from '../../../ui/MathText';
import {haptic} from '../../../ui/v7/haptics';
import {noteKindText} from '../../../lib/labels';
import {kitSubject} from '../../atlas/v7/model';
import {CardEditorSheet} from '../../cards/v7/CardEditorSheet';
import {proposalCitations} from '../v6/Evidence';
import {firstProposalFrontLine} from '../frontPreview';
import {planReviewNodes} from '../../plan-proposal/nodes';
import {changeRows,groupBySession,isCardProposal,isPlanProposal,mergeOrder,miniWindow,sameSession,skipFirst,swipeIntent,swipeStyle,type ChangeIcon,type Decision} from './inboxModel';
import {useInboxDecisions} from './useInboxDecisions';
import {useMinWidth} from '../../../app/v7/useMinWidth';
import '../../project/v7/learning.css';
import './inbox.css';

const changeIcon:Record<ChangeIcon,typeof Plus>={add:Plus,link:LinkIcon,unlink:Unlink,edit:Pencil,remove:Minus,move:MoveRight};
const isCloze=(p:Proposal)=>(p.card?.type??p.cardEdit?.type)==='cloze';
const faces=(p:Proposal)=>p.kind==='card_edit'&&p.cardEdit?{front:p.cardEdit.front??p.cardEdit.current.front,back:p.cardEdit.back??p.cardEdit.current.back,kind:'Edit to N'+p.cardEdit.note_no}
 :{front:p.card?.front??'',back:p.card?.back??'',kind:noteKindText(p.card?.kind??'other')};

/** The top card: the review-card design with its subject and session, the type as an eyebrow, front, hairline, back, and
 *  "Why this card?". Swipe right approves, left rejects, up skips; below the threshold it springs back. */
function TopCard({proposal,project,onDecide,onSkip,haptics}:{proposal:Proposal;project:ProjectSummary|undefined;onDecide:(action:Decision)=>void;onSkip:()=>void;haptics:boolean}){
 const [drag,setDrag]=useState({dx:0,dy:0}),start=useRef<{x:number;y:number;t:number}|null>(null),ref=useRef<HTMLElement>(null),dragged=useRef(false);
 const face=faces(proposal),subject=kitSubject(project?.subject.name??''),citations=proposalCitations(proposal);
 const width=ref.current?.offsetWidth??340,style=swipeStyle(drag.dx,width);
 const down=(event:ReactPointerEvent<HTMLElement>)=>{if((event.target as HTMLElement).closest('button,a'))return;dragged.current=false;start.current={x:event.clientX,y:event.clientY,t:performance.now()};event.currentTarget.setPointerCapture(event.pointerId);};
 const move=(event:ReactPointerEvent<HTMLElement>)=>{const origin=start.current;if(origin)setDrag({dx:event.clientX-origin.x,dy:Math.min(0,event.clientY-origin.y)});};
 const up=(event:ReactPointerEvent<HTMLElement>)=>{
  const origin=start.current;start.current=null;if(!origin)return;
  const dx=event.clientX-origin.x,dy=event.clientY-origin.y,ms=Math.max(1,performance.now()-origin.t);
  // A drag that began on "Why this card?" must not also toggle it.
  dragged.current=Math.hypot(dx,dy)>8;
  const intent=swipeIntent(dx,dy,width,dx/ms,dy/ms);
  setDrag({dx:0,dy:0});
  if(intent==='skip'){haptic('snap',haptics);onSkip();}
  else if(intent)onDecide(intent);
 };
 return <article ref={ref} className={'v7-inbox-card '+subjectClass(subject)} aria-label={'Proposed card · '+face.kind+' · '+(project?.title??proposal.projectSlug)} data-proposal={proposal.id} data-word={style.word??undefined}
  style={{transform:drag.dx||drag.dy?`translate(${drag.dx}px,${drag.dy}px) rotate(${style.rotate}deg)`:undefined,['--inbox-wash' as string]:String(style.wash)}}
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{start.current=null;setDrag({dx:0,dy:0});}}
  onClickCapture={event=>{if(dragged.current){event.preventDefault();event.stopPropagation();dragged.current=false;}}}>
  {style.word&&<span className="v7-inbox-wash" data-word={style.word} aria-hidden="true"><span className="v7-inbox-stamp">{style.word==='Approve'?<Check/>:<X/>}{style.word}</span></span>}
  <div className="v7-inbox-card-head"><Tag subject={subject}/><span className="v7-meta">{project?.title??proposal.projectSlug}{proposal.sessionNumber!==null?' · Session '+proposal.sessionNumber:''}</span></div>
  <p className="v7-eyebrow">{face.kind}</p>
  <div className="v7-inbox-front"><MathText source={face.front} cloze={isCloze(proposal)?{ord:1,revealed:true}:undefined}/></div>
  <hr/>
  <div className="v7-inbox-back"><MathText source={face.back}/></div>
  {(proposal.reason||citations.length>0)&&<details className="v7-inbox-why"><summary>Why this card?</summary>
   {proposal.reason&&<p>{proposal.reason}</p>}
   {citations.length>0&&<p className="v7-meta">{citations.map(item=>item.source+(item.pages?' · p. '+item.pages:'')).join('; ')}</p>}
  </details>}
 </article>;
}

function MiniMap({proposal}:{proposal:Proposal}){
 const project=useProject(proposal.projectSlug);
 const nodes=useMemo(()=>planReviewNodes(proposal.plan,proposal.planChange,project.data?.checkpoints??[]),[proposal,project.data]);
 const changed=useMemo(()=>new Set(nodes.filter(node=>node.change).map(node=>node.code)),[nodes]);
 const shown=miniWindow(nodes,changed);
 if(!shown.length)return null;
 return <ol className="v7-inbox-mini" aria-label="Where the change sits">{shown.map(node=><li key={node.code} data-change={node.change??undefined}>
  <span className="v7-inbox-mini-node" aria-hidden="true"/><span>{node.title}</span>{node.change&&<small>{node.change==='added'?'Added':'Changed'}</small>}
 </li>)}</ol>;
}
function PlanCard({proposal,project,onDecide}:{proposal:Proposal;project:ProjectSummary|undefined;onDecide:(action:Decision)=>void}){
 const subject=kitSubject(project?.subject.name??''),detail=useProject(proposal.projectSlug);
 const titles=new Map((detail.data?.checkpoints??[]).map(cp=>[cp.code,cp.title]));
 const rows=proposal.planChange?changeRows(proposal.planChange.ops,code=>titles.get(code)??code):[];
 const count=proposal.plan?.checkpoints.length??0;
 return <li className={'v7-inbox-plan '+subjectClass(subject)}>
  <div className="v7-inbox-plan-head">
   <span className="v7-inbox-plan-cover" aria-hidden="true"><Emblem subject={subject} seed={project?.id??proposal.projectSlug} size={56} animate={false}/></span>
   <span><strong>{project?.title??proposal.projectSlug}</strong><small>{(proposal.kind==='plan'?'New plan':'Plan change')+(proposal.sessionNumber!==null?' · from Session '+proposal.sessionNumber:'')}</small></span>
  </div>
  <h3 className="v7-eyebrow">What changes</h3>
  {rows.length?<ul className="v7-inbox-changes">{rows.map((row,index)=>{const Icon=changeIcon[row.icon];return <li key={index}><Icon aria-hidden="true"/><span>{row.text}</span></li>;})}</ul>
   :<p className="v7-meta">{count?count+' checkpoints in a new plan':'No checkpoint changes'}</p>}
  <MiniMap proposal={proposal}/>
  {proposal.reason&&<><h3 className="v7-eyebrow">Why</h3><p className="v7-inbox-reason">{proposal.reason}</p></>}
  <div className="v7-inbox-plan-actions">
   <Button onClick={()=>onDecide('reject')}>Reject</Button>
   <Button variant="primary" onClick={()=>onDecide('approve')}>Approve</Button>
   <Link className="v7-button v7-ghost" to={'/proposals/'+encodeURIComponent(proposal.id)}><span>Compare whole plan</span></Link>
  </div>
 </li>;
}

/** PLAN §6.10 Inbox: a triage stack for cards (swipe, buttons or keys), a list view for batches, and plan cards. */
export default function InboxV7(){
 const query=useProposals(),projects=useProjects(),settings=useSettings();
 const [params,setParams]=useSearchParams(),tab=params.get('tab')==='plan'?'plan':'cards',list=params.get('view')==='list';
 const [order,setOrder]=useState<string[]>([]),[editing,setEditing]=useState<Proposal|null>(null),[batch,setBatch]=useState<Proposal[]|null>(null);
 const [selected,setSelected]=useState<ReadonlySet<string>>(()=>new Set());
 const haptics=(settings.data as {haptics?:boolean}|undefined)?.haptics!==false;
 const onUndo=useCallback((ids:string[])=>setOrder(previous=>[...ids,...previous.filter(id=>!ids.includes(id))]),[]);
 const onSettled=useCallback(()=>{void query.refetch();},[query]);
 const {held,decide}=useInboxDecisions({onUndo,onSettled});
 const desk=useMinWidth(1100);
 const bySlug=useMemo(()=>new Map((projects.data??[]).map(row=>[row.slug,row])),[projects.data]);
 const all=useMemo(()=>(query.data??[]).filter(p=>!held.has(p.id)),[query.data,held]);
 const cards=useMemo(()=>all.filter(isCardProposal),[all]),plans=useMemo(()=>all.filter(isPlanProposal),[all]);
 useEffect(()=>{setOrder(previous=>mergeOrder(previous,cards.map(p=>p.id)));},[cards]);
 const queue=useMemo(()=>{const byId=new Map(cards.map(p=>[p.id,p]));return mergeOrder(order,cards.map(p=>p.id)).map(id=>byId.get(id)!).filter(Boolean);},[order,cards]);
 const top=queue[0],peers=sameSession(top,queue);
 const act=useCallback((action:Decision,items?:Proposal[])=>{
  const targets=items??(top?[top]:[]);
  if(!targets.length)return;
  haptic('decision',haptics);decide(targets,action);
 },[top,decide,haptics]);
 const skip=useCallback(()=>setOrder(previous=>skipFirst(mergeOrder(previous,cards.map(p=>p.id)))),[cards]);
 useEffect(()=>{
  if(tab!=='cards'||list||editing||batch)return;
  const keys=(event:KeyboardEvent)=>{
   if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,[contenteditable],dialog'))return;
   if(event.ctrlKey||event.metaKey||event.altKey||!top)return;
   const key=event.key.toLowerCase();
   if(key==='a'||event.key==='ArrowRight'){event.preventDefault();act('approve');}
   else if(key==='r'||event.key==='ArrowLeft'){event.preventDefault();act('reject');}
   else if(key==='e'){event.preventDefault();setEditing(top);}
   else if(event.key==='ArrowUp'){event.preventDefault();skip();}
  };
  window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys);
 },[tab,list,editing,batch,top,act,skip]);
 function setTab(value:string){const next=new URLSearchParams(params);if(value.startsWith('Plans'))next.set('tab','plan');else next.delete('tab');setParams(next);}
 function toggleList(){const next=new URLSearchParams(params);if(list)next.delete('view');else next.set('view','list');setParams(next);setSelected(new Set());}
 const titleOf=(slug:string)=>bySlug.get(slug)?.title??slug;
 const tabs=['Cards '+cards.length,'Plans '+plans.length];
 return <main id="main-content" className="v7-page v7-inbox" aria-label="Inbox">
  <DetailHeader title="Inbox" back="/" action={tab==='cards'?<IconButton label={list?'Show the stack':'Show as a list'} aria-pressed={list} onClick={toggleList}>{list?<Layers aria-hidden="true"/>:<LayoutList aria-hidden="true"/>}</IconButton>:undefined}/>
  <h1 className="v7-sr-only">Inbox</h1>
  <Segmented label="Proposal types" tabs panelId="v7-inbox-panel" options={tabs} value={tab==='plan'?tabs[1]:tabs[0]} onChange={setTab}/>
  <section id="v7-inbox-panel" role="tabpanel" aria-label={tab==='plan'?'Plans':'Cards'} className="v7-inbox-panel">
   {query.isPending&&<Skeleton/>}
   {query.isError&&<div role="alert" className="v7-inbox-empty"><p>Could not load proposals.</p><Button onClick={()=>{void query.refetch();}}>Try again</Button></div>}
   {query.isSuccess&&tab==='cards'&&!list&&(top?<div className={desk?'v7-inbox-desk':'v7-inbox-panel'}>
    {desk&&<ol className="v7-inbox-queue" aria-label="Queue">{queue.map(p=><li key={p.id}><button type="button" aria-current={p.id===top.id?'true':undefined}
     onClick={()=>setOrder(previous=>[p.id,...mergeOrder(previous,cards.map(item=>item.id)).filter(id=>id!==p.id)])}>
     <span><MathText source={firstProposalFrontLine(faces(p).front)} cloze={isCloze(p)?{ord:1,revealed:true}:undefined}/></span><small>{titleOf(p.projectSlug)+(p.sessionNumber!==null?' · Session '+p.sessionNumber:'')}</small></button></li>)}</ol>}
    <div className="v7-inbox-panel">
    <div className="v7-inbox-stack" data-count={Math.min(3,queue.length)}>
     {queue.slice(1,3).reverse().map((p,index,rest)=><div key={p.id} className="v7-inbox-peek" data-depth={rest.length-index} aria-hidden="true"/>)}
     <TopCard key={top.id} proposal={top} project={bySlug.get(top.projectSlug)} onDecide={action=>act(action)} onSkip={skip} haptics={haptics}/>
    </div>
    <p className="v7-inbox-position" aria-live="polite">1 of {queue.length}</p>
    <div className="v7-inbox-decide" role="group" aria-label="Decide on this card">
     <span><button type="button" className="v7-inbox-round" data-kind="reject" aria-label="Reject" onClick={()=>act('reject')}><X aria-hidden="true"/></button><small aria-hidden="true">Reject</small></span>
     <span><button type="button" className="v7-inbox-round" data-kind="edit" aria-label="Edit" onClick={()=>setEditing(top)}><Pencil aria-hidden="true"/></button><small aria-hidden="true">Edit</small></span>
     <span><button type="button" className="v7-inbox-round" data-kind="approve" aria-label="Approve" onClick={()=>act('approve')}><Check aria-hidden="true"/></button><small aria-hidden="true">Approve</small></span>
    </div>
    {peers.length>1&&<Button variant="ghost" className="v7-inbox-all" onClick={()=>setBatch(peers)}>{'Approve all '+peers.length+' from Session '+top.sessionNumber}</Button>}
    <p className="v7-sr-only">Keys: A or Right approves, R or Left rejects, E edits, Up skips to the end.</p>
   </div></div>:<div className="v7-inbox-empty v7-inbox-zero"><LottieMoment name="inbox" animation="inbox-zero" className="v7-inbox-zero-art"/><h2>Inbox zero</h2><p>Your tutor's next proposals will appear here.</p></div>)}
   {query.isSuccess&&tab==='cards'&&list&&(queue.length?<>
    {groupBySession(queue,titleOf).map(group=><section key={group.key} className="v7-inbox-group" aria-label={group.label}>
     <h2 className="v7-eyebrow">{group.label} · {group.items.length}</h2>
     <ul>{group.items.map(p=><li key={p.id}>
      <Checkbox label={<MathText source={firstProposalFrontLine(faces(p).front)} cloze={isCloze(p)?{ord:1,revealed:true}:undefined}/>} checked={selected.has(p.id)} onChange={checked=>setSelected(previous=>{const next=new Set(previous);if(checked)next.add(p.id);else next.delete(p.id);return next;})}/>
     </li>)}</ul>
    </section>)}
    <div className="v7-learn-bar v7-inbox-batch" role="group" aria-label="Batch decision">
     <Button disabled={!selected.size} onClick={()=>{act('reject',queue.filter(p=>selected.has(p.id)));setSelected(new Set());}}>{'Reject '+selected.size}</Button>
     <Button variant="primary" disabled={!selected.size} onClick={()=>{act('approve',queue.filter(p=>selected.has(p.id)));setSelected(new Set());}}>{'Approve '+selected.size}</Button>
    </div>
   </>:<div className="v7-inbox-empty v7-inbox-zero"><LottieMoment name="inbox" animation="inbox-zero" className="v7-inbox-zero-art"/><h2>Inbox zero</h2><p>Your tutor's next proposals will appear here.</p></div>)}
   {query.isSuccess&&tab==='plan'&&(plans.length?<ul className="v7-inbox-plans">{plans.map(p=><PlanCard key={p.id} proposal={p} project={bySlug.get(p.projectSlug)} onDecide={action=>act(action,[p])}/>)}</ul>
    :<div className="v7-inbox-empty v7-inbox-zero"><Illustration name="inbox" className="v7-inbox-zero-art"/><h2>No plan changes</h2><p>When your tutor proposes a plan or a change, it appears here.</p></div>)}
  </section>
  <Sheet open={!!batch} onClose={()=>setBatch(null)} title={'Approve '+(batch?.length??0)+' cards?'}
   footer={<><Button variant="ghost" onClick={()=>setBatch(null)}>Cancel</Button><Button variant="primary" onClick={()=>{if(batch)act('approve',batch);setBatch(null);}}>{'Approve '+(batch?.length??0)}</Button></>}>
   <ul className="v7-inbox-batchlist">{batch?.map(p=><li key={p.id}><MathText source={firstProposalFrontLine(faces(p).front)} cloze={isCloze(p)?{ord:1,revealed:true}:undefined}/></li>)}</ul>
   <p className="v7-meta">You can undo for 6 seconds after approving.</p>
  </Sheet>
  {editing&&editing.card&&<CardEditorSheet open onClose={()=>setEditing(null)} busy={false} submitLabel="Save and approve" lockPath
   initial={{noteId:'',noteNo:0,front:editing.card.front,back:editing.card.back,type:editing.card.type,kind:editing.card.kind,tags:editing.card.tags??[],status:'active',origin:editing.origin,
    projectSlug:editing.projectSlug,checkpointCode:editing.card.checkpoint??null,sessionNumber:editing.sessionNumber,sourceShort:editing.card.source??null,pageLabel:editing.card.page??null}}
   onSubmit={value=>{const target=editing;setEditing(null);haptic('decision',haptics);decide([target],'approve',{front:value.front,back:value.back});}}/>}
  {editing&&!editing.card&&editing.cardEdit&&<CardEditorSheet open onClose={()=>setEditing(null)} busy={false} submitLabel="Save and approve" lockPath
   initial={{noteId:'',noteNo:editing.cardEdit.note_no,front:faces(editing).front,back:faces(editing).back,type:editing.cardEdit.type??'basic',kind:'other',tags:[],status:'active',origin:editing.origin,
    projectSlug:editing.projectSlug,checkpointCode:null,sessionNumber:editing.sessionNumber,sourceShort:null,pageLabel:null}}
   onSubmit={value=>{const target=editing;setEditing(null);haptic('decision',haptics);decide([target],'approve',{front:value.front,back:value.back});}}/>}
 </main>;
}
