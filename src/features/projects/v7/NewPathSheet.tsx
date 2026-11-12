import {useEffect,useRef} from 'react';
import {useNavigate} from 'react-router';
import {Check,FileText,Plus,Trash2} from 'lucide-react';
import {Button,Field,IconButton,Sheet} from '../../../ui/v7/components';
import {useToast} from '../../../ui/Toast';
import {bytes,useNewPath} from '../../new-project/useNewPath';
import {takeSharedSources} from '../../../platform/share';

const statusWord:Record<string,string>={queued:'Waiting',reading:'Reading',uploading:'Uploading',saving:'Saving',ready:'Added',failed:'Failed'};

/** PLAN §6.8 New path: a name, a dashed Sources drop zone, one note and a primary "Create path". The new path then opens
 *  with a "Tell your tutor" card (?new=1). */
export default function NewPathSheet({onClose}:{onClose:()=>void}){
 const navigate=useNavigate(),notify=useToast(),input=useRef<HTMLInputElement>(null);
 const {name,setName,items,error,saving,created,remaining,enqueue,remove,submit}=useNewPath();
 // N123: files shared to the Android app arrive here as sources; the first one's name suggests the path's name.
 useEffect(()=>{const shared=takeSharedSources();if(!shared.length)return;enqueue(shared);setName(previous=>previous||shared[0].name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').slice(0,100));
 },[]);
 async function create(){
  const result=await submit();
  if(result.kind==='created')navigate('/p/'+encodeURIComponent(result.project.slug)+'?new=1');
  else if(result.kind==='partial')notify('Path saved. Retry or remove the files that failed.',{tone:'danger'});
  else if(result.kind==='failed')notify('Could not save your path',{tone:'danger'});
 }
 const label=saving?'Saving path and sources':created&&remaining?'Retry remaining uploads':'Create path';
 return <Sheet open onClose={onClose} title="New path" footer={<>{!name.trim()&&!saving&&<p className="v7-disabled-reason v7-footer-reason" id="v7-new-path-reason">Name your path to create it</p>}<Button variant="primary" form="v7-new-path" type="submit" loading={saving} disabled={!name.trim()} aria-describedby={!name.trim()?'v7-new-path-reason':undefined}>{label}</Button></>}>
  <form id="v7-new-path" className="v7-newpath" onSubmit={event=>{event.preventDefault();void create();}}>
   <Field label="Name" placeholder="e.g. Abstract Algebra" required maxLength={100} autoFocus autoComplete="off"
    value={name} onChange={event=>setName(event.target.value)} disabled={saving||!!created}/>
   <section aria-label="Sources" className="v7-newpath" onDragOver={event=>event.preventDefault()}
    onDrop={event=>{event.preventDefault();if(!saving)enqueue(event.dataTransfer.files);}}>
    <input ref={input} hidden type="file" multiple accept=".pdf,application/pdf,.tex,.latex,.ltx,application/x-tex,text/x-tex,.md,.markdown,text/markdown"
     onChange={event=>{if(event.currentTarget.files)enqueue(event.currentTarget.files);event.currentTarget.value='';}}/>
    <button type="button" className="v7-newpath-drop" disabled={saving} onClick={()=>input.current?.click()}>
     <Plus aria-hidden="true"/><span>Add a PDF, .tex or .md · 50 MB each</span></button>
    {items.length>0&&<ul className="v7-newpath-files" aria-label="Sources to add">{items.map(item=><li key={item.id}>
     <FileText aria-hidden="true"/>
     <span><strong>{item.name}</strong><small>{bytes(item.size)} · {statusWord[item.status]}{item.progress?.pageCount?' · '+item.progress.page+' of '+item.progress.pageCount+' pages':''}</small>
      {item.error&&<small role="alert" className="v7-error">{item.error}</small>}</span>
     {item.status==='ready'?<Check aria-label="Added"/>:!saving&&<IconButton label={'Remove '+item.name} onClick={()=>remove(item.id)}><Trash2 aria-hidden="true"/></IconButton>}
    </li>)}</ul>}
   </section>
   {error&&<p role="alert" className="v7-error">{error}</p>}
   <p className="v7-newpath-note">Your tutor fills in the subject, goal and plan.</p>
  </form>
 </Sheet>;
}
