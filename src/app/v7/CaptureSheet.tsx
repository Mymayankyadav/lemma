import {FirstUseHint} from '../../ui/v7/FirstUseHint';
import FirstCardPanel from '../../features/cards/v7/FirstCardPanel';
import {CardEditorSheet} from '../../features/cards/v7/CardEditorSheet';
import type {EditorValue} from '../../features/cards/Editor';
import {createContext,useContext,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {Clock3,MessageSquareText,Mic,X} from 'lucide-react';
import {MEANING_ICON} from '../../ui/v7/meanings';
import {getApi} from '../../data';
import {useQueryClient} from '@tanstack/react-query';
import {useCalendarIdentity,useCalendarRangeCache} from '../../data/study/calendarRange';
import {useHome,useSettings} from '../../data/hooks';
import {getStudyApi} from '../../data/study';
import {getTaskApi} from '../../data/tasks';
import {getThoughtApi} from '../../data/parked-thoughts';
import {calendarBlockDraft,type CalendarBlockDraft} from '../../features/calendar/block-sheet/blockDraft';
import {localClockInstant} from '../../features/time-log/local-time';
import {useStudyUi} from '../../data/StudyUiRelease';
import TaskSheetV7 from '../../features/tasks/v7/TaskSheetV7';
import {taskInput,type CapturedTaskDraft} from '../../features/tasks/taskDraft';
import {Button,Segmented} from '../../ui/v7/components';
import {useToast} from '../../ui/Toast';
import {useActiveFocus} from './focus';
import {addLabel,captureKinds,captureTaskDraft,defaultStart,kindLabel,parseCapture,type CaptureKind} from './captureModel';
import {takeCaptureText} from '../../platform/share';
import {useNativeVoice} from '../../platform/voice';
import {OverlayFrame} from './LazyOverlay';
import type {SheetProps} from '../../ui/v7/Sheet';
import {surfaceBetaEnabled} from '../surfaceBeta';
import {motionReduced} from '../../ui/v7/effects';
import {durations,easings} from '../../ui/v7/motion';
import {openCalendarAfterSheet} from './calendarHandoff';
import BlockSheet from '../../features/calendar/block-sheet/BlockSheet';
import {getDemoProfile,getMode} from '../../data/mode';
import {dayKey} from '../../features/calendar/model';
import {authOwner} from '../../data/authBoundary';

type Details={type:'task';draft:CapturedTaskDraft}|{type:'block';draft:CalendarBlockDraft}|{type:'card'|'first-card'|'thought'};

const CaptureStep=createContext<{onBack:()=>void;dirty:boolean}|null>(null);

function CaptureDetailFrame({title,children,eyebrow,footer,dirty}:SheetProps){
 const step=useContext(CaptureStep);
 return <OverlayFrame title={title} eyebrow={eyebrow} footer={footer} onBack={step?.onBack} dirty={step?.dirty||dirty}>
  <div className="v7-capture-step">{children}</div>
 </OverlayFrame>;
}

const icons={task:MEANING_ICON.task,block:Clock3,card:MEANING_ICON.card,thought:MessageSquareText} as const;
/** Resolve civil time, not elapsed minutes since midnight: DST days can have 23 or 25 hours. */
export function instantAt(date:string,time:string,zone:string):string{
 const instant=localClockInstant(date,time,zone);
 if(!instant)throw new Error('Choose a valid local date and time.');
 return instant;
}
/** PLAN §6.1 F: one field, four types chosen from the text, removable tokens, a footer that names the result. */
export default function CaptureSheet({onClose,initialKind=null,picker=false}:{onClose:()=>void;initialKind?:CaptureKind|null;picker?:boolean}){
 const calendar=useCalendarRangeCache(useCalendarIdentity()),cache=useQueryClient();
 const refreshBlocks=()=>{void calendar.refresh();void cache.invalidateQueries({queryKey:['home','today-day']});};
 const home=useHome(),settings=useSettings(),{entry}=useActiveFocus(),navigate=useNavigate(),notify=useToast();
 const zone=settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC';
 const [text,setText]=useState(()=>takeCaptureText()??''),voice=useNativeVoice(),[chosen,setChosen]=useState<CaptureKind|null>(initialKind),[ignored,setIgnored]=useState<ReadonlySet<string>>(new Set());
 const chooseType=picker&&!text&&!chosen;
 const repair=useStudyUi();
 const firstCardEnabled=getMode()==='demo'?getDemoProfile()==='first-use':repair&&!!authOwner();
 const [beta]=useState(surfaceBetaEnabled);
 const [details,setDetails]=useState<Details|null>(null);
 const [thought,setThought]=useState('');
 const [blockKind,setBlockKind]=useState<'study'|'busy'>('study');
 const field=useRef<HTMLTextAreaElement>(null),panel=useRef<HTMLDivElement>(null);
 const caret=useRef<[number,number,'forward'|'backward'|'none']|null>(null);
 const outgoing=useRef<{height:number;copy:HTMLElement;easing:string;layoutMs:number;fadeMs:number}|null>(null);
 const heightMotion=useRef<Animation|null>(null),observedHeight=useRef(0);
 useLayoutEffect(()=>{
  const node=panel.current;
  if(!beta||!node||typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(([entry])=>{observedHeight.current=entry.borderBoxSize?.[0]?.blockSize??entry.contentRect.height;});
  observer.observe(node);return ()=>observer.disconnect();
 },[beta]);
 function showDetails(next:Details|null){
  const node=panel.current,content=node?.firstElementChild;
  if(beta&&node&&content instanceof HTMLElement&&!motionReduced()&&typeof node.animate==='function'){
   const copy=content.cloneNode(true) as HTMLElement;
   copy.inert=true;copy.setAttribute('aria-hidden','true');copy.classList.add('v7-capture-step-exit');
   copy.querySelectorAll('[id], [name], [autofocus]').forEach(element=>{
    element.removeAttribute('id');element.removeAttribute('name');element.removeAttribute('autofocus');
   });
   outgoing.current={height:observedHeight.current||node.offsetHeight,copy,easing:'cubic-bezier('+easings.standard.join(',')+')',
    layoutMs:durations.layout*1000,fadeMs:durations.instant*1000};
  }
  if(beta&&node)node.dataset.stepTransition='';
  setDetails(next);
 }
 useLayoutEffect(()=>{
  const node=panel.current;
  if(!node)return;
  const previous=outgoing.current;
  outgoing.current=null;
  heightMotion.current?.cancel();
  if(details){
   const target=node.querySelector<HTMLElement>('input:not([type=hidden]),textarea');
   if(target&&!target.closest('dialog:not([open])')&&document.activeElement!==target)target.focus({preventScroll:true});
  }else if(field.current){
   if(!field.current.closest('dialog:not([open])')&&document.activeElement!==field.current)field.current.focus({preventScroll:true});
   if(caret.current)field.current.setSelectionRange(...caret.current);
  }
  if(!previous)return;
  const {height:oldHeight,easing,layoutMs,fadeMs}=previous;
  const morph=(height:number)=>{
   if(Math.abs(oldHeight-height)>1&&!motionReduced())
    heightMotion.current=node.animate([{height:oldHeight+'px'},{height:height+'px'}],{duration:layoutMs,easing});
  };
  // The browser supplies the incoming size after its normal layout, before paint.
  // Measuring immediately after replacing the form would synchronously lay out the whole dialog again.
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(([entry])=>{
   observer?.disconnect();morph(entry.borderBoxSize?.[0]?.blockSize??entry.contentRect.height);
  });
  if(observer)observer.observe(node);else morph(node.offsetHeight);
  node.append(previous.copy);
  const fade=previous.copy.animate([{opacity:1},{opacity:0}],{duration:fadeMs,easing});
  const remove=()=>previous.copy.remove();
  void fade.finished.then(remove,remove);
  return ()=>{observer?.disconnect();fade.cancel();remove();heightMotion.current?.cancel();};
 },[details]);
 const saving=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const paths=useMemo(()=>(home.data?.projects??[]).filter(project=>!project.system&&project.status!=='archived').map(project=>({id:project.id,slug:project.slug,title:project.title})),[home.data]);
 const parse=useMemo(()=>parseCapture(text,{now:new Date(),zone,paths,session:!!entry},ignored,chosen),[text,zone,paths,entry,ignored,chosen]);
 const kind=parse.kind,project=home.data?.projects.find(item=>item.id===parse.path?.id);
 const tokens=repair&&kind==='block'&&blockKind==='busy'?parse.tokens.filter(token=>token.type!=='path'):parse.tokens;
 const start=defaultStart(parse.date,parse.time,{now:new Date(),zone});
 const title=kind==='card'?parse.front:parse.title;
 const taskDraft=()=>captureTaskDraft(parse,start.date,zone,project?.subject.id??null);
 // Every block needs a zoned start, even without explicit tokens. Task expansion
 // also binds a wall-clock zone because the owner may add a due time in the full form.
 const hasOwnerZone=!!settings.data?.timeZone;
 const waitingToSave=!hasOwnerZone&&(kind==='block'||(kind==='task'&&!!(parse.date||parse.time)));
 const waitingToExpand=!hasOwnerZone&&(kind==='task'||kind==='block');
 const reason=waitingToSave?'Your time zone must load before saving a scheduled item.':!text.trim()?'Type something to add.':kind==='card'&&(!parse.front||!parse.back)?'Write the card as front :: back.':kind!=='block'&&!title?'Add a title.':'';
 function reset(){setText('');setChosen(initialKind);setBlockKind('study');setIgnored(new Set());setError('');}
 function close(){reset();onClose();}
 function back(){showDetails(null);setThought('');setError('');}
 function rememberCaret(){
  if(field.current)caret.current=[field.current.selectionStart,field.current.selectionEnd,field.current.selectionDirection??'none'];
 }
 async function emptyLibrary(){
  const page=await getApi().searchCardsPage({query:'',offset:0});
  return page.rows.length===0&&page.nextOffset===null;
 }
 async function fullCard(value:EditorValue){
  if(saving.current)return;
  saving.current=true;setBusy(true);setError('');
  try{
   const api=getApi(),made=await api.createNote(value);
   notify('Card added',{tone:'success',action:{label:'Undo',onClick:()=>{void api.setNoteStatus(made.noteNo,'deleted');}}});
   close();
  }catch(failure){setError(failure instanceof Error?failure.message:'Could not save the card.');}
  finally{saving.current=false;setBusy(false);}
 }
 async function save(){
  if(saving.current||reason)return;saving.current=true;setBusy(true);setError('');
  try{
   if(kind==='task'){
    const draft=taskDraft(),api=getTaskApi(),made=await api.createTask(taskInput(draft.values,draft.zone));
    notify('Task added',{tone:'success',undoConflictKey:'task:'+made.record.id,action:{label:'Undo',onClick:()=>
     api.deleteTask(made.record.id,made.record.version).catch(()=>notify('Could not undo the task. Reopen it to check its current version.',{tone:'danger'}))}});
   }else if(kind==='block'){
    const api=getStudyApi(),minutes=parse.minutes??30,startsAt=instantAt(start.date,start.time,zone);
    const type=repair?blockKind:'study';
    const made=await api.createCalendarBlock({kind:type,title:parse.title||(type==='busy'?'Busy':project?project.title+' study':'Study block'),startsAt,endsAt:new Date(Date.parse(startsAt)+minutes*60_000).toISOString(),
     timeZone:zone,projectId:type==='study'?project?.id??null:null,subjectId:type==='study'?project?.subject.id??null:null});
    refreshBlocks();
    notify('Block added for '+start.time,{tone:'success',action:{label:'Undo',onClick:()=>{
     void api.deleteCalendarBlock(made.record.id,made.record.version).then(refreshBlocks)
      .catch(()=>notify('Could not undo the time block.',{tone:'danger'}));
    }}});
   }else if(kind==='card'){
    if(firstCardEnabled&&await emptyLibrary()){rememberCaret();showDetails({type:'first-card'});return;}
    const target=project??home.data?.projects.find(item=>!item.system);
    if(!target)throw Error('Add a path before adding cards.');
    const api=getApi(),made=await api.createNote({projectSlug:target.slug,front:parse.front,back:parse.back,type:'basic',kind:'other'});
    notify('Card added to '+target.title,{tone:'success',action:{label:'Undo',onClick:()=>{void api.setNoteStatus(made.noteNo,'deleted');}}});
   }else{
    await parkThought(parse.title||text.trim());
   }
   close();
  }catch(reasonError){setError(reasonError instanceof Error?reasonError.message:'That did not work. Try again.');}
  finally{saving.current=false;setBusy(false);}
 }
 async function parkThought(value:string){
  const api=getThoughtApi(),made=await api.createThought({studyEntryId:entry?.id??null,text:value});
  notify('Thought parked',{tone:'success',action:{label:'Undo',onClick:()=>{void api.deleteThought(made.record.id,made.record.version);}}});
 }
 async function saveThought(){
  if(saving.current||!thought.trim())return;
  saving.current=true;setBusy(true);setError('');
  try{await parkThought(thought.trim());close();}
  catch(problem){setError(problem instanceof Error?problem.message:'Could not park the thought.');}
  finally{saving.current=false;setBusy(false);}
 }
 function more(){
  if(saving.current||waitingToExpand)return;
  rememberCaret();setError('');
  if(kind==='card'&&firstCardEnabled){
   saving.current=true;setBusy(true);
   void emptyLibrary().then(empty=>showDetails({type:empty?'first-card':'card'}))
    .catch(failure=>setError(failure instanceof Error?failure.message:'Could not load the card library.'))
    .finally(()=>{saving.current=false;setBusy(false);});
   return;
  }
  if(kind==='task'){showDetails({type:'task',draft:taskDraft()});return;}
  if(kind==='card'){showDetails({type:'card'});return;}
  if(kind==='thought'){setThought(parse.title||text.trim());showDetails({type:'thought'});return;}
  try{
   const draft=calendarBlockDraft({title:parse.title,kind:repair?blockKind:'study',startsAt:instantAt(start.date,start.time,zone),
    minutes:parse.minutes??30,zone,projectId:project?.id??null,subjectId:project?.subject.id??null,taskId:null});
   showDetails({type:'block',draft});
  }catch(problem){setError(problem instanceof Error?problem.message:'Check the date and time.');}
 }
 function placeInCalendar(draft:CalendarBlockDraft){
  const date=dayKey(new Date(draft.startsAt),draft.zone);
  openCalendarAfterSheet(close,()=>{void navigate('/calendar?view=day&date='+date+'&new=block',{state:{calendarBlockDraft:draft}});});
 }
 const cardDraft={front:parse.front,back:parse.back,projectSlug:project?.slug??paths[0]?.slug??''};
 const dirty=!!text.trim()||!!thought.trim();
 const fullCardForm=<CardEditorSheet open onClose={back} frame={CaptureDetailFrame} draft={cardDraft}
  busy={busy} submitError={error} onSubmit={value=>{void fullCard(value);}}/>;
 return <div ref={panel} className="v7-capture-flow">{details?<CaptureStep.Provider value={{onBack:back,dirty}}>
  {details.type==='task'?<TaskSheetV7 initialDraft={details.draft} frame={CaptureDetailFrame} onDismiss={back} onSaved={close}/>:
   details.type==='block'?<BlockSheet v7 block={null} draft={details.draft} date={start.date} zone={zone} frame={CaptureDetailFrame}
    onClose={close} onRefresh={refreshBlocks} onPlaceInCalendar={placeInCalendar}/>:
   details.type==='first-card'&&firstCardEnabled?<CaptureDetailFrame open onClose={close} title="Capture card"><FirstCardPanel initial={{front:cardDraft.front,back:cardDraft.back,slug:cardDraft.projectSlug||undefined}}
    onCancel={back} onSaved={close} stayOnSave/></CaptureDetailFrame>:
   (details.type==='card'||details.type==='first-card')?fullCardForm:
   <CaptureDetailFrame open onClose={close} title="Park a thought" footer={<Button variant="primary" loading={busy} disabled={!thought.trim()} onClick={()=>{void saveThought();}}>Park thought</Button>}>
    <label className="v7-field-group">Thought<textarea className="v7-field" rows={3} maxLength={500} value={thought} onChange={event=>setThought(event.target.value)}/></label>
    {error&&<p role="alert" className="v7-alert">{error}</p>}
   </CaptureDetailFrame>}
 </CaptureStep.Provider>:<OverlayFrame title="Capture" dirty={dirty}
  footer={<><Button variant="ghost" className="v7-action-tertiary" onClick={more} disabled={busy||waitingToExpand} title={waitingToExpand?'Waiting for your time zone':undefined}>Add details</Button>
   {reason&&text.trim()&&<p id="v7-capture-reason" className="v7-disabled-reason v7-footer-reason">{reason}</p>}
   <Button variant="primary" disabled={!!reason||busy} aria-describedby={reason&&text.trim()?'v7-capture-reason':undefined} onClick={()=>{void save();}}>{addLabel[kind]}</Button></>}>
  <div className="v7-capture-step" data-direction="back">
  {chooseType&&<div className="v7-capture-types" role="group" aria-label="Choose a type">{captureKinds.map(item=>{const Icon=icons[item];
   return <button key={item} type="button" aria-pressed={chosen===item} onClick={()=>setChosen(item)}><Icon aria-hidden="true"/>{kindLabel[item]}</button>;})}</div>}
  <textarea ref={field} data-v7-autofocus="true" className="v7-capture-field" rows={3} maxLength={500} aria-label="What do you want to add?" placeholder="What do you want to add?"
   value={text} onSelect={rememberCaret} onChange={event=>{setText(event.target.value);}}
   onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void save();}}}/>
  {voice.available&&<Button small variant="ghost" onClick={()=>{void voice.listen().then(spoken=>{if(spoken)setText(previous=>(previous.trim()?previous.trim()+' ':'')+spoken);}).catch(()=>setError('Voice input is not available right now.'));}}><Mic aria-hidden="true"/>Speak</Button>}
  <FirstUseHint name="capture">{!text&&<p className="v7-capture-hint">Try “Rudin ch 4 tomorrow 4pm 90m”</p>}</FirstUseHint>
  <p className="v7-sr-only" aria-live="polite">Adds {kind==='block'?'a time block':'a '+kind}</p>
  {tokens.length>0&&<ul className="v7-capture-tokens" aria-label="Recognised">{tokens.map(token=><li key={token.id}>
   <button type="button" aria-label={'Remove '+token.label} onClick={()=>setIgnored(new Set([...ignored,token.id]))}><span>{token.label}</span><X aria-hidden="true"/></button></li>)}</ul>}
  {!chooseType&&<div className="v7-capture-kinds" data-selected-kind={kind}><Segmented label="Type" options={captureKinds.map(item=>kindLabel[item])} value={kindLabel[kind]}
   onChange={label=>{const next=captureKinds.find(item=>kindLabel[item]===label);if(next)setChosen(next);}}/></div>}
  {repair&&kind==='block'&&<div className="v7-form-stack">
   <Segmented label="Block kind" options={['Study','Busy']} value={blockKind==='study'?'Study':'Busy'} onChange={value=>setBlockKind(value==='Busy'?'busy':'study')}/>

  </div>}
  {!!error&&<p role="alert" className="v7-alert">{error}</p>}
  </div>
 </OverlayFrame>}</div>;
}
