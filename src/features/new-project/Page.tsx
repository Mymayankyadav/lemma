import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {AlertTriangle,Check,Copy,FileText,Plus,Trash2} from 'lucide-react';
import {planPrompt} from '../../lib/chat';
import {bytes,useNewPath} from './useNewPath';
import {Screen} from '../../ui/Screen';
import {Sheet} from '../../ui/Sheet';
import {Button} from '../../ui/Button';
import {Rail} from '../../ui/Rail';
import {useToast} from '../../ui/Toast';
import {isFlagOn} from '../../flags';
import {v7Screen} from '../../app/v7Kit';

// The KaTeX preview is only needed after the owner types maths. Do not
// evaluate its renderer on an empty cold New project form.
const MathPreview=lazy(()=>import('../../ui/MathPreview').then(module=>({default:module.MathPreview})));
const ProjectsPage=lazy(()=>import('../projects/Page'));
// v7: the Paths hub opens its own New path sheet over the list (PLAN §6.8).
const PathsV7=lazy(()=>import('../projects/v7/PathsV7'));

function BackdropFallback(){
 return <Screen tabBar className="gap-4"><header className="flex min-h-11 items-center">
  <h1 className="font-[var(--font-display)] text-title-s font-semibold">Paths</h1>
 </header></Screen>;
}

export default function Page(){
 if(v7Screen()==='paths')return <Suspense fallback={<div role="status" aria-label="Paths loading" className="min-h-dvh"/>}><PathsV7/></Suspense>;
 return <LegacyNewPath/>;
}
function LegacyNewPath(){
 const navigate=useNavigate(),notify=useToast();
 const {name,setName,items,error,saving,created,remaining,enqueue,remove,submit:run}=useNewPath();
 const input=useRef<HTMLInputElement>(null);
 const [loadBackdrop,setLoadBackdrop]=useState(false);
 // The real Paths page is part of the existing sheet contract (and visible
 // behind it). Hydrate it only after the first modal paint, never in the
 // initial cold-route render; keep its rows and behavior intact thereafter.
 useEffect(()=>{
  // Give the actual modal two paints before hydrating the blurred library;
  // 400ms keeps heavy 60-project parsing out of the strict cold paint budget.
  const id=window.setTimeout(()=>setLoadBackdrop(true),400);
  return ()=>window.clearTimeout(id);
 },[]);
 const close=useCallback(()=>navigate('/projects'),[navigate]);
 async function submit(event:React.FormEvent){
  event.preventDefault();
  const result=await run();
  if(result.kind==='partial'){
   notify('Project saved. Retry or remove failed files to continue.',{tone:'danger'});
  }else if(result.kind==='created'){
   notify((isFlagOn('v6Shell')?'Path created. ':'Project created. ')+'Tell your tutor: '+planPrompt(result.project.title),{tone:'success'});
   navigate('/p/'+result.project.slug+'?tab=sources');
  }else if(result.kind==='failed'){
   notify(isFlagOn('v6Shell')?'Could not save your path':'Could not save your project',{tone:'danger'});
  }
 }
 return <>
  {/* Preserve the actual inert Paths background after the modal's first paint.
      A permanent placeholder breaks the existing sheet/layout contract. */}
  <div data-new-project-backdrop data-sheet-background aria-hidden="true" inert>
   {loadBackdrop?
    <Suspense fallback={<BackdropFallback/>}><ProjectsPage/></Suspense>:
    <BackdropFallback/>}
  </div>
  <h1 className="sr-only">{isFlagOn('v6Shell')?'New path':'New project'}</h1>
  <Sheet open route onClose={close} title={isFlagOn('v6Shell')?'New path':'New project'} footer={
    <Button form="lemma-create-path" size="xl" className="w-full" type="submit"
      variant={saving||!name.trim()?'ghost':'lit'} disabled={saving||!name.trim()} loading={saving}>
      {saving?'Saving path and sources':created&&remaining?'Retry remaining uploads':'Create path'}
    </Button>
   }>
   <form id="lemma-create-path" onSubmit={event=>{void submit(event)}} className="flex flex-col gap-5">
    <section className="flex flex-col gap-2">
     <label htmlFor="project-title" className="text-label font-medium text-ink-2">Name</label>
     <input id="project-title" required maxLength={100} autoFocus autoComplete="off"
      value={name} onChange={event=>setName(event.target.value)} disabled={saving||!!created}
      placeholder={isFlagOn('v6Shell')?'e.g. Real Analysis':'Real Analysis'} className="min-h-12 w-full rounded-ctl border border-edge-2 bg-well px-3 text-headline text-ink placeholder:text-ink-3"/>
     {(name.includes('$')||name.includes('\\(')||name.includes('\\['))&&
      <Suspense fallback={null}><MathPreview source={name}/></Suspense>}
     <p className="text-label text-ink-2">Your tutor fills in the subject, goal, teaching style and study plan.</p>
    </section>
    <section aria-label="Sources" className="flex flex-col gap-3"
     onDragOver={event=>event.preventDefault()}
     onDrop={event=>{event.preventDefault();if(!saving)enqueue(event.dataTransfer.files)}}>
     <div className="flex items-center justify-between gap-2">
      <h3 className={isFlagOn('v6Shell')?'text-label font-medium text-ink-2':'text-body font-semibold text-ink-2'}>Sources (optional)</h3>
      <span className="text-label text-ink-3">PDF, .tex, .md · 50 MB each</span>
     </div>
     <input ref={input} hidden type="file" multiple accept=".pdf,application/pdf,.tex,.latex,.ltx,application/x-tex,text/x-tex,.md,.markdown,text/markdown"
      onChange={event=>{if(event.currentTarget.files)enqueue(event.currentTarget.files);event.currentTarget.value=''}}/>
     <button type="button" disabled={saving} onClick={()=>input.current?.click()}
      className="flex min-h-24 items-center justify-center gap-2 rounded-slab border border-dashed border-edge-3 bg-fill-1 text-body text-ink-2">
      <Plus size={20} className="text-ink-2"/>Add PDFs, .tex or .md files
     </button>
     <ul aria-label="Upload queue" className="flex flex-col gap-2">
      {items.map(item=><li key={item.id} className="flex min-w-0 items-start gap-3 rounded-slab border border-edge bg-raised p-3">
       <FileText size={19} className="mt-1 shrink-0 text-ink-2" aria-hidden="true"/>
       <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold">{item.name}</p>
        <p className="text-label text-ink-3">{bytes(item.size)} · {item.status}{item.progress?.pageCount?' · '+item.progress.page+'/'+item.progress.pageCount+' pages':''}</p>
        {item.progress&&item.status!=='ready'&&<Rail className="mt-2" value={item.progress.pageCount?item.progress.page/item.progress.pageCount:0} label={'Progress for '+item.name}/>}
        {item.error&&<p role="alert" className="text-label text-again">{item.error}</p>}
       </div>
       {item.status==='ready'?<Check size={18} className="text-easy"/>:
        !saving&&<button type="button" aria-label={'Remove '+item.name} onClick={()=>remove(item.id)}
         className="flex size-11 shrink-0 items-center justify-center text-ink-3"><Trash2 size={17}/></button>}
      </li>)}
     </ul>
    </section>
    {error&&<p role="alert" className="flex gap-2 text-label text-again"><AlertTriangle size={16}/>{error}</p>}
    {!isFlagOn('v6Shell')&&<Button size="xl" className="w-full" type="submit"
     variant={saving||!name.trim()?'ghost':'lit'} disabled={saving||!name.trim()} loading={saving}>
     {saving?'Saving project and sources':created&&remaining?'Retry remaining uploads':'Create project'}
    </Button>}
    <button type="button" className="flex min-h-11 items-center justify-center gap-2 text-label text-ink-2 underline-offset-4 hover:underline focus-visible:underline"
     onClick={()=>{void navigator.clipboard.writeText(planPrompt(name.trim()||'your project')).then(()=>notify('Prompt copied',{tone:'success'})).catch(()=>notify('Copy unavailable',{tone:'danger'}))}}>
     <Copy size={15}/>Tell your tutor: {planPrompt(name.trim()||'your project')}
    </button>
   </form>
  </Sheet>
 </>;
}
