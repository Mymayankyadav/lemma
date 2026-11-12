import {useMemo,useState} from 'react';
import {useNavigate} from 'react-router';
import {Clock3,Layers,CheckSquare,MessageSquareText,X} from 'lucide-react';
import {getApi} from '../../data';
import {useHome,useSettings} from '../../data/hooks';
import {getStudyApi} from '../../data/study';
import {getTaskApi} from '../../data/tasks';
import {getThoughtApi} from '../../data/parked-thoughts';
import {calendarRange} from '../../features/calendar/model';
import {Button,Segmented,Sheet} from '../../ui/v7/components';
import {useToast} from '../../ui/Toast';
import {useActiveFocus} from './focus';
import {addLabel,captureKinds,defaultStart,kindLabel,parseCapture,type CaptureKind} from './captureModel';

const icons={task:CheckSquare,block:Clock3,card:Layers,thought:MessageSquareText} as const;
/** Local date and time in a zone to an instant: midnight of that civil day plus the elapsed minutes. */
export function instantAt(date:string,time:string,zone:string):string{
 const [hour,minute]=time.split(':').map(Number);
 return new Date(Date.parse(calendarRange(date,zone).start)+(hour*60+minute)*60_000).toISOString();
}
/** PLAN §6.1 F: one field, four types chosen from the text, removable tokens, a footer that names the result. */
export default function CaptureSheet({open,onClose,initialKind=null,picker=false}:{open:boolean;onClose:()=>void;initialKind?:CaptureKind|null;picker?:boolean}){
 const home=useHome(),settings=useSettings(),{entry}=useActiveFocus(),navigate=useNavigate(),notify=useToast();
 const zone=settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC';
 const [text,setText]=useState(''),[chosen,setChosen]=useState<CaptureKind|null>(initialKind),[ignored,setIgnored]=useState<ReadonlySet<string>>(new Set());
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const paths=useMemo(()=>(home.data?.projects??[]).filter(project=>!project.system&&project.status!=='archived').map(project=>({id:project.id,slug:project.slug,title:project.title})),[home.data]);
 const parse=useMemo(()=>parseCapture(text,{now:new Date(),zone,paths,session:!!entry},ignored,chosen),[text,zone,paths,entry,ignored,chosen]);
 const kind=parse.kind,project=home.data?.projects.find(item=>item.id===parse.path?.id);
 const start=defaultStart(parse.date,parse.time,{now:new Date(),zone});
 const title=kind==='card'?parse.front:parse.title;
 const reason=!text.trim()?'Type something to add.':kind==='card'&&(!parse.front||!parse.back)?'Write the card as front :: back.':kind!=='block'&&!title?'Add a title.':'';
 function reset(){setText('');setChosen(initialKind);setIgnored(new Set());setError('');}
 function close(){reset();onClose();}
 async function save(){
  if(busy||reason)return;setBusy(true);setError('');
  try{
   if(kind==='task'){
    const api=getTaskApi(),made=await api.createTask({title:parse.title,projectId:project?.id??null,subjectId:project?.subject.id??null,
     estimateMinutes:parse.minutes,due:parse.date?{kind:'date',date:parse.date}:{kind:'none'}});
    notify('Task added',{tone:'success',action:{label:'Undo',onClick:()=>{void api.deleteTask(made.record.id,made.record.version);}}});
   }else if(kind==='block'){
    const api=getStudyApi(),minutes=parse.minutes??30,startsAt=instantAt(start.date,start.time,zone);
    const made=await api.createCalendarBlock({kind:'study',title:parse.title||(project?project.title+' study':'Study block'),startsAt,endsAt:new Date(Date.parse(startsAt)+minutes*60_000).toISOString(),
     timeZone:zone,projectId:project?.id??null,subjectId:project?.subject.id??null});
    notify('Block added for '+start.time,{tone:'success',action:{label:'Undo',onClick:()=>{void api.deleteCalendarBlock(made.record.id,made.record.version);}}});
   }else if(kind==='card'){
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
  finally{setBusy(false);}
 }
 function more(){
  const target=kind==='task'?'/tasks':kind==='block'?'/calendar?view=day&date='+start.date+'&new=block&start='+encodeURIComponent(instantAt(start.date,start.time,zone)):kind==='card'?'/cards':null;
  close();if(target)navigate(target);
 }
 return <Sheet open={open} onClose={close} title="Capture" eyebrow="Add something"
  footer={<><Button variant="ghost" className="v7-action-tertiary" onClick={more} disabled={kind==='thought'}>More options</Button>
   {reason&&<p id="v7-capture-reason" className="v7-disabled-reason v7-footer-reason">Unavailable · {reason}</p>}
   <Button variant="primary" disabled={!!reason||busy} aria-describedby={reason?'v7-capture-reason':undefined} onClick={()=>{void save();}}>{addLabel[kind]}</Button></>}>
  {picker&&!text&&<div className="v7-capture-types" role="group" aria-label="Choose a type">{captureKinds.map(item=>{const Icon=icons[item];
   return <button key={item} type="button" aria-pressed={chosen===item} onClick={()=>setChosen(item)}><Icon aria-hidden="true"/>{kindLabel[item]}</button>;})}</div>}
  <textarea data-v7-autofocus="true" className="v7-capture-field" rows={3} maxLength={500} aria-label="What do you want to add?" placeholder="What do you want to add?"
   value={text} onChange={event=>{setText(event.target.value);}}
   onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void save();}}}/>
  {!text&&<p className="v7-capture-hint">Try: Rudin ch 4 tomorrow 4pm 90m #real</p>}
  {parse.tokens.length>0&&<ul className="v7-capture-tokens" aria-label="Recognised">{parse.tokens.map(token=><li key={token.id}>
   <button type="button" aria-label={'Remove '+token.label} onClick={()=>setIgnored(new Set([...ignored,token.id]))}><span>{token.label}</span><X aria-hidden="true"/></button></li>)}</ul>}
  <div className="v7-capture-kinds"><Segmented label="Type" options={captureKinds.map(item=>kindLabel[item])} value={kindLabel[kind]}
   onChange={label=>{const next=captureKinds.find(item=>kindLabel[item]===label);if(next)setChosen(next);}}/></div>
  {!!error&&<p role="alert" className="v7-alert">{error}</p>}
 </Sheet>;
}
