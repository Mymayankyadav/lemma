import {useEffect,useId,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getFirstCardDemoApi,LemmaError} from '../../../data';
import {useProjects} from '../../../data/hooks';
import {getDemoProfile,getMode} from '../../../data/mode';
import {Button} from '../../../ui/v7/components';

const pendingKey='lemma.first-use.first-card.pending.v1';
type Path={kind:'new';title:string}|{kind:'existing';slug:string};
type Pending={operationId:string;path:Path;front:string;back:string};
let saving=false;

function readPending():Pending|null{
 try{
  const value=JSON.parse(sessionStorage.getItem(pendingKey)??'null') as Pending|null;
  if(!value||typeof value.operationId!=='string'||typeof value.front!=='string'||typeof value.back!=='string')return null;
  if(value.path?.kind==='new'&&typeof value.path.title==='string'||
     value.path?.kind==='existing'&&typeof value.path.slug==='string')return value;
 }catch{/* A new write must still confirm durable draft storage below. */}
 return null;
}

/** Only the isolated first-use demo can render this shared Cards/Review form. */
export default function FirstCardPanel({fallback=null}:{fallback?:ReactNode}){
 if(getMode()!=='demo'||getDemoProfile()!=='first-use')return fallback;
 return <DemoFirstCardPanel fallback={fallback}/>;
}

function DemoFirstCardPanel({fallback}:{fallback:ReactNode}){
 const navigate=useNavigate(),queryClient=useQueryClient(),heading=useId();
 const api=getFirstCardDemoApi(),projects=useProjects();
 const library=useQuery({queryKey:['first-use','first-card-library'],
  queryFn:()=>{if(!api)throw new Error('First-use fixture unavailable');return api.searchCardsPage({query:'',offset:0});},
  enabled:!!api});
 const [pending,setPending]=useState(readPending),[open,setOpen]=useState(false);
 const [front,setFront]=useState(''),[back,setBack]=useState(''),[title,setTitle]=useState('');
 const [chosenPath,setChosenPath]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const trigger=useRef<HTMLButtonElement>(null),first=useRef<HTMLTextAreaElement>(null),live=useRef(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{if(open&&!pending)first.current?.focus();},[open,pending]);
 const paths=(projects.data??[]).filter(path=>!path.system&&path.status!=='archived');
 const slug=chosenPath??paths[0]?.slug??'';
 const path:Path=slug?{kind:'existing',slug}:{kind:'new',title:title.trim()};
 const empty=library.isSuccess&&!library.isFetching&&library.data.rows.length===0&&library.data.nextOffset===null;

 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(saving||!api)return;
  setError('');
  let draft=readPending()??pending;
  if(!draft&&(!empty||!projects.isSuccess))return;
  if(!draft){
   if(!front.trim()||!back.trim()||path.kind==='new'&&!path.title)return;
   try{
    draft={operationId:crypto.randomUUID(),path,front:front.trim(),back:back.trim()};
    // Fail closed before dispatch if the retry key cannot survive a reload.
    sessionStorage.setItem(pendingKey,JSON.stringify(draft));
   }catch{setError('This tab cannot keep a recoverable draft. No card was saved.');return;}
  }
  saving=true;setBusy(true);setPending(draft);
  try{
   const request=draft;
   const receipt=await api.createFirstCard(request).catch((failure:unknown)=>{
    // Known validation failures have not written anything; keep the text editable.
    if(live.current&&failure instanceof LemmaError&&(failure.code==='invalid'||failure.code==='not_found')){
     sessionStorage.removeItem(pendingKey);setPending(null);setOpen(true);
     setChosenPath(request.path.kind==='existing'?request.path.slug:'');
     if(request.path.kind==='new')setTitle(request.path.title);
     setFront(request.front);setBack(request.back);
    }
    throw failure;
   });
   const detail=await api.getCard(receipt.noteNo);
   if(detail.note.noteNo!==receipt.noteNo||detail.note.noteId!==receipt.noteId||
      detail.note.projectSlug!==receipt.projectSlug||detail.note.front!==draft.front||detail.note.back!==draft.back||
      !detail.cards.some(card=>card.cardId===receipt.cardId))
    throw new Error('The saved card could not be verified');
   const keys=new Set(['first-use','card','cards','v7-cards','decks','home','projects','project','subjects','path-review-forecast']);
   void queryClient.invalidateQueries({predicate:query=>keys.has(String(query.queryKey[0]))});
   // If the learner navigated away mid-save, leave the recoverable receipt keyed to the draft.
   if(live.current){
    navigate('/cards/'+receipt.noteNo);
    sessionStorage.removeItem(pendingKey);
    setPending(null);setOpen(false);
   }
  }catch(failure){
   if(live.current)setError(failure instanceof LemmaError&&(failure.code==='invalid'||failure.code==='not_found')
     ?failure.message:'The save could not be confirmed. Retry to recover the same card without duplicating it.');
  }finally{
   saving=false;
   if(live.current)setBusy(false);
  }
 }
 function close(){
  setOpen(false);setError('');
  requestAnimationFrame(()=>trigger.current?.focus());
 }

 if(!api||!pending&&!open&&(!empty||!projects.isSuccess))return fallback;
 const callToAction=paths.length?'Create your first card':'Create a path and card';
 return <section className="v7-cards-empty" aria-labelledby={heading}>
  <h2 id={heading} className="v7-headline">First card</h2>
  {!open&&!pending?<button ref={trigger} type="button" className="v7-button v7-primary" onClick={()=>setOpen(true)}><span>{callToAction}</span></button>
  :<form onSubmit={save} className="v7-form-stack">
   {pending?<p role="status">Your draft is saved in this tab. Retry to open the exact saved card.</p>:<>
    {paths.length>0&&<label className="v7-field-group">Path
     <select className="v7-field" value={slug} onChange={event=>setChosenPath(event.target.value)}>
      {paths.map(row=><option key={row.slug} value={row.slug}>{row.title}</option>)}
      <option value="">Create a new path</option>
     </select></label>}
    {!slug&&<label className="v7-field-group">Path name<input className="v7-field" value={title}
     required minLength={2} maxLength={80} onChange={event=>setTitle(event.target.value)}/></label>}
    <label className="v7-field-group">Front<textarea ref={first} className="v7-field" value={front}
     required maxLength={1500} onChange={event=>setFront(event.target.value)}/></label>
    <label className="v7-field-group">Back<textarea className="v7-field" value={back}
     required maxLength={3000} onChange={event=>setBack(event.target.value)}/></label>
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
