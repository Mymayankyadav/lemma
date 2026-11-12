import {useMemo,useState} from 'react';
import {useNavigate,useParams,Link} from 'react-router';
import {MoreHorizontal,Pause,Play,Trash2,BookOpen} from 'lucide-react';
import {useAddComment,useCard,useDismissComment,useProjects,useSetNoteStatus,useSettings,useUpdateNote} from '../../../data/hooks';
import {DetailHeader} from '../../../app/v7/V7Shell';
import {Button,IconButton,Sheet,Skeleton,StatTile} from '../../../ui/v7/components';
import {ActionSheet} from '../../../ui/v7/ActionSheet';
import {StatusBadge} from '../../../ui/v7/Status';
import {GradeBadge,gradeOf} from '../../../ui/v7/grades';
import {Tag} from '../../../ui/v7/KitPrimitives';
import {subjectClass} from '../../../ui/v7/Subject';
import {MathText} from '../../../ui/MathText';
import {formatInterval,formatShortDate,ownerZone} from '../../../lib/format';
import {clientName,noteKindText} from '../../../lib/labels';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import {CardEditorSheet} from '../../cards/v7/CardEditorSheet';
import type {EditorValue} from '../../cards/Editor';
import {RecallChart} from './RecallChart';
import {gradeKey,recallNow,recallSeries} from './recallModel';
import '../../project/v7/learning.css';
import '../../cards/v7/cards.css';

const confidenceWord={sure:'Sure',unsure:'Unsure',guess:'Guess'} as const;

/** PLAN §6.11 Card detail: the card as in a review, Memory (three stats over a real recall chart), History, notes for the tutor,
 *  and "Edit card" / "Pause" in a sticky bar. */
export default function CardV7(){
 const {no='0'}=useParams(),number=Number(no),query=useCard(number),projects=useProjects(),settings=useSettings(),notify=useToast(),navigate=useNavigate();
 const update=useUpdateNote(),status=useSetNoteStatus(),add=useAddComment(),dismiss=useDismissComment();
 const [editing,setEditing]=useState(false),[more,setMore]=useState(false),[deleting,setDeleting]=useState(false),[message,setMessage]=useState('');
 const zone=ownerZone(settings.data),now=useMemo(()=>Date.now(),[]);
 const detail=query.data,note=detail?.note,card=detail?.cards[0]?.state;
 const series=useMemo(()=>detail?recallSeries(detail.history,settings.data,now):null,[detail,settings.data,now]);
 const project=projects.data?.find(row=>row.slug===note?.projectSlug),subject=kitSubject(project?.subject.name??'');
 if(query.isPending)return <main id="main-content" className="v7-page v7-learn" aria-label="Card"><DetailHeader title="Card" back="/cards"/><Skeleton/><Skeleton/></main>;
 if(query.isError||!note)return <main id="main-content" className="v7-page v7-learn" aria-label="Card"><DetailHeader title="Card" back="/cards"/>
  <div role="alert" className="v7-learn-empty"><p>This card could not be loaded.</p><Button onClick={()=>{void query.refetch();}}>Try again</Button></div></main>;
 const paused=note.status==='suspended';
 const recall=recallNow(card,settings.data,now),target=settings.data?.desiredRetention??.9;
 const intervals=new Map(series?.dots.map(dot=>[dot.at,dot.intervalDays])??[]);
 async function setNoteStatus(next:'active'|'suspended'|'deleted'){
  if(!note)return;
  try{
   await status.mutateAsync({noteNo:note.noteNo,status:next});
   setDeleting(false);
   notify(next==='deleted'?'Card deleted':next==='suspended'?'Card paused':'Card resumed',{tone:'success'});
   if(next==='deleted')navigate('/cards');
  }catch{notify('Could not update the card.',{tone:'danger'});}
 }
 async function save(value:EditorValue){
  if(!note)return;
  try{await update.mutateAsync({noteNo:note.noteNo,patch:{front:value.front,back:value.back,type:value.type,kind:value.kind,tags:value.tags}});setEditing(false);notify('Card updated',{tone:'success'});}
  catch{notify('Could not save the card.',{tone:'danger'});}
 }
 async function comment(){
  if(!note||!message.trim()||add.isPending)return;
  try{await add.mutateAsync({noteNo:note.noteNo,body:message.trim()});setMessage('');notify('Saved for your tutor',{tone:'success'});}
  catch{notify('Could not save your note.',{tone:'danger'});}
 }
 const comments=detail.comments.filter(item=>item.status!=='dismissed');
 return <main id="main-content" className={'v7-page v7-learn v7-card '+subjectClass(subject)} aria-label="Card">
  <DetailHeader title="Card" back="/cards" action={<IconButton label="More card actions" aria-haspopup="dialog" onClick={()=>setMore(true)}><MoreHorizontal aria-hidden="true"/></IconButton>}/>
  <h1 className="v7-sr-only">{'Card in '+(project?.title??'your library')}</h1>
  <article className="v7-card-face" aria-label="Card">
   <div className="v7-card-face-head"><Tag subject={subject}/>{paused&&<StatusBadge tone="warning">Paused</StatusBadge>}</div>
   <p className="v7-eyebrow">{noteKindText(note.kind)}</p>
   <div className="v7-card-face-front"><MathText source={note.front}/></div>
   <hr/>
   <div className="v7-card-face-back"><MathText source={note.back}/></div>
   <div className="v7-learn-chiprow">
    {project&&<Link className="v7-learn-chip v7-learn-link" to={'/p/'+encodeURIComponent(project.slug)+(note.checkpointCode?'/cp/'+encodeURIComponent(note.checkpointCode):'')}>{project.title}</Link>}
    {note.sourceShort&&<span className="v7-learn-chip"><BookOpen aria-hidden="true"/>{note.sourceShort}{note.pageLabel?' · p. '+note.pageLabel:''}</span>}
    {note.sessionNumber!==null&&<Link className="v7-learn-chip v7-learn-link" to={'/s/'+encodeURIComponent(note.projectSlug)+'/'+note.sessionNumber}>{'Session '+note.sessionNumber}</Link>}
    {note.origin!=='user'&&<span className="v7-learn-chip">{'From '+clientName(note.origin)}</span>}
   </div>
  </article>
  <section aria-label="Memory"><h2 className="v7-learn-h2">Memory</h2>
   <div className="v7-card-stats">
    <StatTile label="Next review" value={paused?'Paused':card?.lastReview?formatShortDate(card.due,{zone}):'New'}/>
    <StatTile label="Stability" value={card&&card.stability>0?formatInterval(card.stability):'—'}/>
    <StatTile label="Recall now" value={recall===null?'—':Math.round(recall*100)+'%'}/>
   </div>
   {series?<RecallChart series={series} target={target} zone={zone}/>:<p className="v7-learn-empty">No reviews yet. The recall chart starts after the first review.</p>}
  </section>
  <section aria-label="History"><h2 className="v7-learn-h2">History</h2>
   {detail.history.length?<ul className="v7-learn-list">{[...detail.history].sort((a,b)=>Date.parse(b.reviewedAt)-Date.parse(a.reviewedAt)).slice(0,20).map((row,index)=>{
    const interval=intervals.get(Date.parse(row.reviewedAt));
    return <li key={row.reviewedAt+index} className="v7-card-history" data-grade={gradeKey[row.rating]}>
     <span>{formatShortDate(row.reviewedAt,{zone})}</span><GradeBadge grade={gradeOf(row.rating)}/>
     <small>{[row.confidence?confidenceWord[row.confidence]:null,interval?'next in '+formatInterval(interval):null].filter(Boolean).join(' · ')}</small>
    </li>;})}</ul>:<p className="v7-learn-empty">Not reviewed yet.</p>}
  </section>
  <section aria-label="For your tutor"><h2 className="v7-learn-h2">For your tutor</h2>
   {comments.length>0&&<ul className="v7-learn-list">{comments.map(item=><li key={item.no} className="v7-learn-card">
    <MathText source={item.body}/>
    <div className="v7-learn-chips"><StatusBadge tone={item.status==='addressed'?'success':'info'}>{item.status==='addressed'?'Addressed':'Open'}</StatusBadge>
     <span className="v7-meta">{formatShortDate(item.createdAt,{zone})}</span>
     {item.status==='open'&&<Button small variant="ghost" onClick={()=>{void dismiss.mutateAsync(item.no).then(()=>notify('Note dismissed')).catch(()=>notify('Could not dismiss your note.',{tone:'danger'}));}}>Dismiss</Button>}</div>
   </li>)}</ul>}
   <label className="v7-field-group"><span>Note for your tutor</span><textarea className="v7-field" rows={2} value={message} onChange={event=>setMessage(event.target.value)} placeholder="What is unclear or wrong on this card?"/></label>
   <Button small loading={add.isPending} disabled={!message.trim()} onClick={()=>{void comment();}}>Save note</Button>
  </section>
  <div className="v7-learn-bar" role="group" aria-label="Card actions">
   <Button variant="primary" onClick={()=>setEditing(true)}>Edit card</Button>
   <Button loading={status.isPending} onClick={()=>{void setNoteStatus(paused?'active':'suspended');}}>{paused?'Resume':'Pause'}</Button>
  </div>
  <ActionSheet open={more} onClose={()=>setMore(false)} title="This card" label="Card actions" items={[
   {label:paused?'Resume card':'Pause card',hint:paused?'Bring it back into reviews':'Keep it out of reviews until you resume',icon:paused?<Play aria-hidden="true"/>:<Pause aria-hidden="true"/>,onClick:()=>{void setNoteStatus(paused?'active':'suspended');}},
   {label:'Delete card',hint:'Its review history is kept',destructive:true,icon:<Trash2 aria-hidden="true"/>,onClick:()=>setDeleting(true)},
  ]}/>
  <Sheet open={deleting} onClose={()=>setDeleting(false)} title="Delete this card?" footer={<><Button variant="ghost" onClick={()=>setDeleting(false)}>Keep card</Button><Button variant="primary" destructive loading={status.isPending} onClick={()=>{void setNoteStatus('deleted');}}>Delete card</Button></>}>
   <p>Its review history is kept, but it leaves your reviews and the library.</p>
  </Sheet>
  {editing&&<CardEditorSheet open onClose={()=>setEditing(false)} initial={note} busy={update.isPending} onSubmit={value=>{void save(value);}}/>}
 </main>;
}
