import FirstCardPanel from '../../features/cards/v7/FirstCardPanel';
import {CardEditorSheet} from '../../features/cards/v7/CardEditorSheet';
import type {EditorValue} from '../../features/cards/Editor';
import {useMemo,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {Clock3,MessageSquareText,Mic,X} from 'lucide-react';
import {MEANING_ICON} from '../../ui/v7/meanings';
import {getApi} from '../../data';
import {useHome,useSettings} from '../../data/hooks';
import {getStudyApi} from '../../data/study';
import {getTaskApi} from '../../data/tasks';
import {getThoughtApi} from '../../data/parked-thoughts';
import {calendarBlockDraft} from '../../features/calendar/block-sheet/blockDraft';
import {localClockInstant} from '../../features/time-log/local-time';
import {useStudyUi} from '../../data/StudyUiRelease';
import TaskSheetV7 from '../../features/tasks/v7/TaskSheetV7';
import {taskInput,type CapturedTaskDraft} from '../../features/tasks/taskDraft';
import {Button,Segmented,Sheet} from '../../ui/v7/components';
import {useToast} from '../../ui/Toast';
import {useActiveFocus} from './focus';
import {addLabel,captureKinds,captureTaskDraft,defaultStart,kindLabel,parseCapture,type CaptureKind} from './captureModel';
import {takeCaptureText} from '../../platform/share';
import {useNativeVoice} from '../../platform/voice';

const icons={task:MEANING_ICON.task,block:Clock3,card:MEANING_ICON.card,thought:MessageSquareText} as const;
/** Resolve civil time, not elapsed minutes since midnight: DST days can have 23 or 25 hours. */
export function instantAt(date:string,time:string,zone:string):string{
 const instant=localClockInstant(date,time,zone);
 if(!instant)throw new Error('Choose a valid local date and time.');
 return instant;
}
/** PLAN §6.1 F: one field, four types chosen from the text, removable tokens, a footer that names the result. */
export default function CaptureSheet({open,onClose,initialKind=null,picker=false}:{open:boolean;onClose:()=>void;initialKind?:CaptureKind|null;picker?:boolean}){
 const home=useHome(),settings=useSettings(),{entry}=useActiveFocus(),navigate=useNavigate(),notify=useToast();
 const zone=settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC';
 const [text,setText]=useState(()=>takeCaptureText()??''),voice=useNativeVoice(),[chosen,setChosen]=useState<CaptureKind|null>(initialKind),[ignored,setIgnored]=useState<ReadonlySet<string>>(new Set());
 const repair=useStudyUi(),[expandedTask,setExpandedTask]=useState<CapturedTaskDraft|null>(null);
 const [cardForm,setCardForm]=useState<'first'|'full'|null>(null);
 const saving=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const paths=useMemo(()=>(home.data?.projects??[]).filter(project=>!project.system&&project.status!=='archived').map(project=>({id:project.id,slug:project.slug,title:project.title})),[home.data]);
 const parse=useMemo(()=>parseCapture(text,{now:new Date(),zone,paths,session:!!entry},ignored,chosen),[text,zone,paths,entry,ignored,chosen]);
 const kind=parse.kind,project=home.data?.projects.find(item=>item.id===parse.path?.id);
 const start=defaultStart(parse.date,parse.time,{now:new Date(),zone});
 const title=kind==='card'?parse.front:parse.title;
 const taskDraft=()=>captureTaskDraft(parse,start.date,zone,project?.subject.id??null);
 // Every block needs a zoned start, even without explicit tokens. Task expansion
 // also binds a wall-clock zone because the owner may add a due time in the full form.
 const hasOwnerZone=!!settings.data?.timeZone;
 const waitingToSave=!hasOwnerZone&&(kind==='block'||(kind==='task'&&!!(parse.date||parse.time)));
 const waitingToExpand=!hasOwnerZone&&(kind==='task'||kind==='block');
 const reason=waitingToSave?'Your time zone must load before saving a scheduled item.':!text.trim()?'Type something to add.':kind==='card'&&(!parse.front||!parse.back)?'Write the card as front :: back.':kind!=='block'&&!title?'Add a title.':'';
 function reset(){setText('');setChosen(initialKind);setIgnored(new Set());setError('');}
 function close(){setExpandedTask(null);setCardForm(null);reset();onClose();}
 async function emptyLibrary(){
  const page=await getApi().searchCardsPage({query:'',offset:0});
  return page.rows.length===0&&page.nextOffset===null;
 }
 async function fullCard(value:EditorValue){
  if(saving.current)return;
  saving.current=true;setBusy(true);setError('');
  try{
   const made=await getApi().createNote(value);
   close();navigate('/cards/'+made.noteNo);
  }catch(failure){setError(failure instanceof Error?failure.message:'Could not save the card.');}
  finally{saving.current=false;setBusy(false);}
 }
 async function save(){
  if(saving.current||reason)return;saving.current=true;setBusy(true);setError('');
  try{
   if(kind==='task'){
    const draft=taskDraft(),api=getTaskApi(),made=await api.createTask(taskInput(draft.values,draft.zone));
    notify('Task added',{tone:'success',action:{label:'Undo',onClick:()=>{void api.deleteTask(made.record.id,made.record.version).catch(()=>notify('Could not undo the task. Reopen it to check its current version.',{tone:'danger'}));}}});
   }else if(kind==='block'){
    const api=getStudyApi(),minutes=parse.minutes??30,startsAt=instantAt(start.date,start.time,zone);
    const made=await api.createCalendarBlock({kind:'study',title:parse.title||(project?project.title+' study':'Study block'),startsAt,endsAt:new Date(Date.parse(startsAt)+minutes*60_000).toISOString(),
     timeZone:zone,projectId:project?.id??null,subjectId:project?.subject.id??null});
    notify('Block added for '+start.time,{tone:'success',action:{label:'Undo',onClick:()=>{void api.deleteCalendarBlock(made.record.id,made.record.version);}}});
   }else if(kind==='card'){
    if(repair&&await emptyLibrary()){setCardForm('first');return;}
    const target=project??home.data?.projects.find(item=>!item.system);
    if(!target)throw Error('Add a path before adding cards.');
    const api=getApi(),made=await api.createNote({projectSlug:target.slug,front:parse.front,back:parse.back,type:'basic',kind:'other'});
    notify('Card added to '+target.title,{tone:'success',action:{label:'Undo',onClick:()=>{void api.setNoteStatus(made.noteNo,'deleted');}}});
   }else{
    const api=getThoughtApi(),made=await api.createThought({studyEntryId:entry?.id??null,text:parse.title||text.trim()});
    notify('Thought parked',{tone:'success',action:{label:'Undo',onClick:()=>{void api.deleteThought(made.record.id,made.record.version);}}});
   }
   close();
  }catch(reasonError){setError(reasonError instanceof Error?reasonError.message:'That did not work. Try again.');}
  finally{saving.current=false;setBusy(false);}
 }
 function more(){
  if(saving.current||waitingToExpand)return;
  if(repair&&kind==='card'){
   saving.current=true;setBusy(true);setError('');
   void emptyLibrary().then(empty=>setCardForm(empty?'first':'full'))
    .catch(failure=>setError(failure instanceof Error?failure.message:'Could not load the card library.'))
    .finally(()=>{saving.current=false;setBusy(false);});
   return;
  }
  if(kind==='task'){
   const draft=taskDraft();if(repair){setExpandedTask(draft);return;}close();navigate('/tasks?new=1',{state:{captureTaskDraft:draft}});return;
  }
  try{
   if(kind==='block'){
    const draft=calendarBlockDraft({title:parse.title,kind:'study',startsAt:instantAt(start.date,start.time,zone),
     minutes:parse.minutes??30,zone,projectId:project?.id??null,subjectId:project?.subject.id??null,taskId:null});
    close();navigate('/calendar?view=day&date='+start.date+'&new=block',{state:{calendarBlockDraft:draft}});return;
   }
   close();if(kind==='card')navigate('/cards');
  }catch(problem){setError(problem instanceof Error?problem.message:'Check the date and time.');}
 }
 const cardDraft={front:parse.front,back:parse.back,projectSlug:project?.slug??paths[0]?.slug??''};
 if(open&&expandedTask)return <TaskSheetV7 initialDraft={expandedTask} onDismiss={()=>setExpandedTask(null)} onSaved={close}/>;
 if(open&&cardForm==='first')return <Sheet open onClose={()=>setCardForm(null)} title="Capture card">
  <FirstCardPanel initial={{front:cardDraft.front,back:cardDraft.back,slug:cardDraft.projectSlug||undefined}}
   onCancel={()=>setCardForm(null)} onSaved={close}/>
 </Sheet>;
 if(open&&cardForm==='full')return <CardEditorSheet open onClose={()=>setCardForm(null)} draft={cardDraft}
  busy={busy} submitError={error} onSubmit={value=>{void fullCard(value);}}/>;
 return <Sheet open={open} onClose={close} title="Capture" eyebrow="Add something"
  footer={<><Button variant="ghost" className="v7-action-tertiary" onClick={more} disabled={kind==='thought'||busy||waitingToExpand} title={waitingToExpand?'Waiting for your time zone':undefined}>More options</Button>
   {reason&&<p id="v7-capture-reason" className="v7-disabled-reason v7-footer-reason">Unavailable · {reason}</p>}
   <Button variant="primary" disabled={!!reason||busy} aria-describedby={reason?'v7-capture-reason':undefined} onClick={()=>{void save();}}>{addLabel[kind]}</Button></>}>
  {picker&&!text&&<div className="v7-capture-types" role="group" aria-label="Choose a type">{captureKinds.map(item=>{const Icon=icons[item];
   return <button key={item} type="button" aria-pressed={chosen===item} onClick={()=>setChosen(item)}><Icon aria-hidden="true"/>{kindLabel[item]}</button>;})}</div>}
  <textarea data-v7-autofocus="true" className="v7-capture-field" rows={3} maxLength={500} aria-label="What do you want to add?" placeholder="What do you want to add?"
   value={text} onChange={event=>{setText(event.target.value);}}
   onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void save();}}}/>
  {voice.available&&<Button small variant="ghost" onClick={()=>{void voice.listen().then(spoken=>{if(spoken)setText(previous=>(previous.trim()?previous.trim()+' ':'')+spoken);}).catch(()=>setError('Voice input is not available right now.'));}}><Mic aria-hidden="true"/>Speak</Button>}
  {!text&&<p className="v7-capture-hint">Try: Rudin ch 4 tomorrow 4pm 90m #real</p>}
  {parse.tokens.length>0&&<ul className="v7-capture-tokens" aria-label="Recognised">{parse.tokens.map(token=><li key={token.id}>
   <button type="button" aria-label={'Remove '+token.label} onClick={()=>setIgnored(new Set([...ignored,token.id]))}><span>{token.label}</span><X aria-hidden="true"/></button></li>)}</ul>}
  <div className="v7-capture-kinds"><Segmented label="Type" options={captureKinds.map(item=>kindLabel[item])} value={kindLabel[kind]}
   onChange={label=>{const next=captureKinds.find(item=>kindLabel[item]===label);if(next)setChosen(next);}}/></div>
  {!!error&&<p role="alert" className="v7-alert">{error}</p>}
 </Sheet>;
}
