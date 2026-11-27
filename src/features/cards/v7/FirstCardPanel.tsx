import {Picker} from '../../../ui/v7/components';
import {useStudyUi} from '../../../data/StudyUiRelease';
import {useEffect,useId,useRef,useState,useSyncExternalStore,type FormEvent,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getApi,getFirstCardDemoApi,LemmaError} from '../../../data';
import {useProjects} from '../../../data/hooks';
import {getDemoProfile,getMode} from '../../../data/mode';
import {authGeneration,authOwner,onAccountChange} from '../../../data/authBoundary';
import type {FirstStudyCardInput} from '../../../data/types';
import {Button} from '../../../ui/v7/components';
import {EmptyMoment} from '../../../ui/v7/EmptyMoment';

const demoPendingKey='lemma.first-use.first-card.pending.v1';
type Path=FirstStudyCardInput['path'];
type Pending=FirstStudyCardInput;
type PanelProps={fallback?:ReactNode;initial?:{front:string;back:string;slug?:string};onCancel?:()=>void;onSaved?:()=>void;stayOnSave?:boolean;reviewEmpty?:boolean};
type StoredDraft=Pending&{rejection?:string};
const saving=new Set<string>();

function readPending(pendingKey:string,ownerId:string|null):StoredDraft|null{
 try{
  const value=JSON.parse(sessionStorage.getItem(pendingKey)??'null') as StoredDraft|null;
  if(!value||typeof value.operationId!=='string'||typeof value.front!=='string'||typeof value.back!=='string')return null;
  if(ownerId&&value.expectedOwner!==ownerId)return null;
  if(value.rejection!==undefined&&typeof value.rejection!=='string')return null;
  if(value.path?.kind==='new'&&typeof value.path.title==='string'||
     value.path?.kind==='existing'&&typeof value.path.slug==='string')return value;
 }catch{/* A new write must still confirm durable draft storage below. */}
 return null;
}

export default function FirstCardPanel(props:PanelProps){
 const studyRepair=useStudyUi();
 const epoch=useSyncExternalStore(onAccountChange,authGeneration,authGeneration);
 const fixture=getMode()==='demo'&&getDemoProfile()==='first-use';
 const ownerId=fixture?null:authOwner();
 if(!fixture&&(!studyRepair||getMode()!=='live'||!ownerId))return props.fallback??null;
 return <CardPanel key={fixture?'fixture':epoch} {...props} epoch={epoch} ownerId={ownerId}/>;
}
function CardPanel({fallback=null,initial,onCancel,onSaved,stayOnSave,reviewEmpty=false,ownerId,epoch}:PanelProps&{ownerId:string|null;epoch:number}){
 const navigate=useNavigate(),queryClient=useQueryClient(),heading=useId();
 const api=ownerId?getApi():getFirstCardDemoApi(),projects=useProjects();
 const pendingKey=ownerId?'lemma.study.first-card.v1.'+ownerId:demoPendingKey;
 const library=useQuery({queryKey:['first-use','first-card-library',ownerId],
  queryFn:()=>{if(!api)throw new Error('First card unavailable');return api.searchCardsPage({query:'',offset:0});},enabled:!!api});
 const [pending,setPending]=useState(()=>readPending(pendingKey,ownerId)),[open,setOpen]=useState(!!initial);
 const [front,setFront]=useState(initial?.front??''),[back,setBack]=useState(initial?.back??''),[title,setTitle]=useState('');
 const [chosenPath,setChosenPath]=useState<string|null>(initial?.slug??null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const trigger=useRef<HTMLButtonElement>(null),first=useRef<HTMLTextAreaElement>(null),live=useRef(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{if(open&&!pending)first.current?.focus();},[open,pending]);
 const paths=(projects.data??[]).filter(path=>!path.system&&path.status!=='archived');
 const available=chosenPath===null?paths[0]:paths.find(row=>row.id===chosenPath||row.slug===chosenPath);
 const slug=available?.slug??'';
 const path:Path=available?{kind:'existing',slug,...(ownerId?{id:available.id}:{})}:{kind:'new',title:title.trim()};
 const active=()=>live.current&&(!ownerId||ownerId===authOwner()&&epoch===authGeneration());
 const empty=library.isSuccess&&!library.isFetching&&library.data.rows.length===0&&library.data.nextOffset===null;

 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(saving.has(pendingKey)||!api?.createFirstCard||!active())return;
  setError('');
  let draft=readPending(pendingKey,ownerId)??pending;
  if(draft?.rejection)return;
  if(!draft&&(!empty||!projects.isSuccess))return;
  if(!draft){
   if(!front.trim()||!back.trim()||path.kind==='new'&&!path.title)return;
   try{
    draft={operationId:crypto.randomUUID(),...(ownerId?{expectedOwner:ownerId}:{}),path,front:front.trim(),back:back.trim()};
    // Fail closed before dispatch if the retry key cannot survive a reload.
    sessionStorage.setItem(pendingKey,JSON.stringify(draft));
   }catch{setError('This tab cannot keep a recoverable draft. No card was saved.');return;}
  }
  saving.add(pendingKey);setBusy(true);setPending(draft);
  try{
   const request=draft;
   const receipt=await api.createFirstCard(request).catch((failure:unknown)=>{
    if(failure instanceof LemmaError&&failure.code==='conflict'){
     const rejected={...request,rejection:failure.message};
     // Keep the entered values across reload without dispatching this rejected intent again.
     try{sessionStorage.setItem(pendingKey,JSON.stringify(rejected));}catch{/* Values remain available in this view. */}
     if(active())setPending(rejected);
     void queryClient.invalidateQueries({queryKey:['first-use','first-card-library']});
     return null;
    }
    // Known validation failures have not written anything; keep the text editable.
    if(active()&&failure instanceof LemmaError&&(failure.code==='invalid'||failure.code==='not_found')){
     sessionStorage.removeItem(pendingKey);setPending(null);setOpen(true);
     setChosenPath(request.path.kind==='existing'?request.path.slug:'');
     if(request.path.kind==='new')setTitle(request.path.title);
     setFront(request.front);setBack(request.back);
    }
    throw failure;
   });
   if(!receipt||!active())return;
   const detail=await api.getCard(receipt.noteNo);
   if(detail.note.noteNo!==receipt.noteNo||detail.note.noteId!==receipt.noteId||
      detail.note.projectSlug!==receipt.projectSlug||detail.note.front!==draft.front||detail.note.back!==draft.back||
      !detail.cards.some(card=>card.cardId===receipt.cardId))
    throw new Error('The saved card could not be verified');
   if(!active())return;
   const keys=new Set(['first-use','card','cards','v7-cards','decks','home','projects','project','subjects','path-review-forecast']);
   void queryClient.invalidateQueries({predicate:query=>keys.has(String(query.queryKey[0]))});
   // If the learner navigated away mid-save, leave the recoverable receipt keyed to the draft.
   if(active()){
    onSaved?.();
    if(!stayOnSave)navigate('/cards/'+receipt.noteNo);
    sessionStorage.removeItem(pendingKey);
    setPending(null);setOpen(false);
   }
  }catch(failure){
   if(active())setError(failure instanceof LemmaError&&(failure.code==='invalid'||failure.code==='not_found')
     ?failure.message:'The save could not be confirmed. Retry to recover the same card without duplicating it.');
  }finally{
   saving.delete(pendingKey);
   if(active())setBusy(false);
  }
 }
 function close(){
  setOpen(false);setError('');onCancel?.();
  requestAnimationFrame(()=>trigger.current?.focus());
 }

 if(pending?.rejection)return <section className="v7-cards-empty" aria-labelledby={heading}>
  <h2 id={heading} className="v7-headline">First card draft</h2>
  <p role="alert">{pending.rejection}. You can copy your entries before dismissing this draft.</p>
  <label className="v7-field-group">Path<input readOnly className="v7-field" value={pending.path.kind==='new'?pending.path.title:pending.path.slug}/></label>
  <div className="v7-field-group">
   <label htmlFor={heading+'-front'}>Front</label>
   <textarea id={heading+'-front'} readOnly className="v7-field" value={pending.front}/>
  </div>
  <div className="v7-field-group">
   <label htmlFor={heading+'-back'}>Back</label>
   <textarea id={heading+'-back'} readOnly className="v7-field" value={pending.back}/>
  </div>
  <Button onClick={()=>{
   try{sessionStorage.removeItem(pendingKey);}catch{setError('The draft could not be dismissed.');return;}
   setPending(null);close();
  }}>Dismiss draft</Button>
  {error&&<p role="alert">{error}</p>}
 </section>;
 if(!api||!pending&&!open&&(!empty||!projects.isSuccess))return fallback;
 const callToAction=paths.length?'Create your first card':'Create a path and card';
 if(reviewEmpty&&!open&&!pending)return <section aria-label="First card">
  <EmptyMoment art="review" title="No cards yet" action={{label:callToAction,onClick:()=>setOpen(true)}}/>
 </section>;
 return <section className="v7-cards-empty" aria-labelledby={heading}>
  <h2 id={heading} className="v7-headline">First card</h2>
  {!open&&!pending?<button ref={trigger} type="button" className="v7-button v7-primary" onClick={()=>setOpen(true)}><span>{callToAction}</span></button>
  :<form onSubmit={save} className="v7-form-stack v7-first-card-form">
   {pending?<p role="status">Your draft is saved in this tab. Retry to open the exact saved card.</p>:<>
    {paths.length>0&&<Picker label="Path" value={available?.title??paths.find(row=>row.slug===slug)?.title??'Create a new path'}
      options={[...paths.map(row=>row.title),'Create a new path']} onChange={title=>{
       const row=paths.find(path=>path.title===title);setChosenPath((ownerId?row?.id:row?.slug)??'');
      }}/>}
    {!slug&&<label className="v7-field-group">Path name<input className="v7-field" value={title}
     required minLength={2} maxLength={80} onChange={event=>setTitle(event.target.value)}/></label>}
    <div className="v7-field-group">
     <label htmlFor={heading+'-front'}>Front</label>
     <textarea id={heading+'-front'} ref={first} className="v7-field" value={front}
      required maxLength={1500} onChange={event=>setFront(event.target.value)}/>
    </div>
    <div className="v7-field-group">
     <label htmlFor={heading+'-back'}>Back</label>
     <textarea id={heading+'-back'} className="v7-field" value={back}
      required maxLength={3000} onChange={event=>setBack(event.target.value)}/>
    </div>
   </>}
   {error&&<p role="alert">{error}</p>}
   <div className="v7-cards-choices">
    <Button type="submit" variant="primary" loading={busy}
     disabled={busy||(!pending&&(!empty||!front.trim()||!back.trim()||path.kind==='new'&&!path.title))}>
     {pending?'Retry saving card':'Save card'}
    </Button>
    {!pending&&<Button variant="ghost" onClick={close}>Cancel</Button>}
   </div>
  </form>}
 </section>;
}
