import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {BookOpen,Check,Copy,FileText,Plus,UploadCloud,AlertTriangle} from 'lucide-react';
import {useAddSource,useCreateProject,useCreateSubject,useStyles,useSubjects} from '../../data/hooks';
import type {Hue,IngestProgress,Project} from '../../data/types';
import {planPrompt} from '../../lib/chat';
import {isPdfFile} from '../../pdf/ingest';
import {slugify} from '../../lib/text';
import {Screen} from '../../ui/Screen';
import {Sheet} from '../../ui/Sheet';
import {Chip} from '../../ui/Chip';
import {Glyph} from '../../ui/Glyph';
import {Button} from '../../ui/Button';
import {Rail} from '../../ui/Rail';
import {Skeleton} from '../../ui/Skeleton';
import {useToast} from '../../ui/Toast';
import {PageStackArt} from '../../ui/art/PageStackArt';
import {EmptyState} from '../../ui/EmptyState';

const hues:Hue[]=['amber','violet','cyan','rose','lime','slate'];
const glyphs=['∫','λ','τ','∂','∑','π','∞','α','𝔸','φ','ℤ','⊕'];
const maxPdfBytes=50*1024*1024;

function SubjectCreator({onCreated}:{onCreated:(id:string)=>void}){
 const create=useCreateSubject(),notify=useToast();
 const [name,setName]=useState(''),[glyph,setGlyph]=useState('∫'),[hue,setHue]=useState<Hue>('amber');
 async function save(){
  const trimmed=name.trim();
  if(!trimmed)return;
  try{
   const result=await create.mutateAsync({name:trimmed,glyph,hue});
   onCreated(result.id);notify('Subject added',{tone:'success'});
  }catch(error){notify(error instanceof Error?error.message:'Could not add subject',{tone:'danger'})}
 }
 return <section aria-label="New subject" className="flex flex-col gap-3 rounded-slab border border-edge-2 bg-raised p-4">
  <label htmlFor="subject-name" className="text-[13px] text-ink-2">Subject name</label>
  <input id="subject-name" maxLength={55} value={name} onChange={e=>setName(e.target.value)} autoComplete="off"
   className="min-h-12 rounded-ctl border border-edge-2 bg-well p-3 text-[15px] text-ink" placeholder="e.g. Number Theory"/>
  <p className="text-[12px] text-ink-3">Choose a mathematical symbol</p>
  <div className="flex flex-wrap gap-2">{glyphs.map(g=><button type="button" key={g} onClick={()=>setGlyph(g)} aria-label={'Glyph '+g}
   aria-pressed={glyph===g} className={'flex size-10 items-center justify-center rounded-s font-math text-[23px] italic '+(glyph===g?'bg-amber-tint text-amber ring-1 ring-amber-line-2':'bg-fill-1 text-ink-2')}>{g}</button>)}</div>
  <p className="text-[12px] text-ink-3">Subject colour</p>
  <div className="flex gap-3">{hues.map(c=><button type="button" key={c} aria-label={'Colour '+c} aria-pressed={c===hue} onClick={()=>setHue(c)}
   className={'flex size-10 items-center justify-center rounded-chip '+(c===hue?'ring-2 ring-amber ring-offset-2 ring-offset-sheet':'')}>
   <span aria-hidden="true" className="size-6 rounded-full" style={{background:'var(--'+c+')'}}/></button>)}</div>
  <Button icon={Plus} size="m" disabled={!name.trim()||create.isPending} loading={create.isPending} onClick={()=>{void save()}}>Add subject</Button>
 </section>;
}

export default function Page(){
 const navigate=useNavigate(),subjects=useSubjects(),styles=useStyles(),createProject=useCreateProject(),
  addSource=useAddSource(),notify=useToast();
 const [name,setName]=useState(''),[goal,setGoal]=useState(''),[subjectId,setSubjectId]=useState(''),
  [style,setStyle]=useState('socratic'),[file,setFile]=useState<File|null>(null),[addingSubject,setAddingSubject]=useState(false),
  [progress,setProgress]=useState<IngestProgress|null>(null),[saving,setSaving]=useState(false),
  [created,setCreated]=useState<Project|null>(null),[fileError,setFileError]=useState<string|null>(null);
 const fileInput=useRef<HTMLInputElement>(null);
 // Keep Sheet's focus-management effect mounted while controlled inputs update.
 const closeNewProject=useCallback(()=>navigate('/projects'),[navigate]);
 useEffect(()=>{
  if(!subjectId&&subjects.data?.length)setSubjectId(subjects.data[0].id);
 },[subjects.data,subjectId]);
 useEffect(()=>{
  if(styles.data?.length && !styles.data.some(s=>s.key===style))setStyle(styles.data[0].key);
 },[styles.data,style]);
 function selectFile(f:File|undefined){
  // Never retain an older PDF after a replacement fails validation.
  setFile(null);setProgress(null);
  if(!f){setFileError(null);return}
  if(!isPdfFile(f)){
   setFileError('Choose a PDF document.');return
  }
  if(f.size>maxPdfBytes){setFileError('PDF must be 50 MB or smaller.');return}
  if(!f.size){setFileError('The selected PDF is empty.');return}
  setFileError(null);setFile(f);setProgress(null);
 }
 async function copyPlanPrompt(){
  try{await navigator.clipboard.writeText(planPrompt(name.trim()));notify('Prompt copied',{tone:'success'})}
  catch{notify('Copy is unavailable in this browser',{tone:'danger'})}
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();
  if(saving||!name.trim()||!goal.trim()||!subjectId||!style)return;
  setSaving(true);
  let project=created;
  try{
   if(!project){
    project=await createProject.mutateAsync({title:name.trim(),subjectId,goal:goal.trim(),style});
    setCreated(project);
   }
   if(file){
    setProgress({phase:'reading',page:0,pageCount:0,message:'Reading PDF'});
    await addSource.mutateAsync({projectId:project.id,file,onProgress:setProgress});
   }
   notify('Project created. Tell your tutor: '+planPrompt(project.title),{tone:'success',
    action:{label:'Copy',onClick:()=>{void navigator.clipboard.writeText(planPrompt(project!.title))}}});
   navigate('/p/'+project.slug);
  }catch(error){
   setFileError(error instanceof Error?error.message:'Could not create your project');
   notify(project?'Project saved, but source upload needs a retry.':'Project could not be created.',{tone:'danger'});
  }finally{setSaving(false)}
 }
 // A failed upload may retry its valid file; an invalid replacement must not submit.
 const canSubmit=Boolean(name.trim()&&goal.trim()&&subjectId&&style&&(!fileError||(created&&file)));
 const preparing=subjects.isPending||styles.isPending;
 const prompt=planPrompt(name.trim()||'your project');
 return <Screen title="New project" back="/projects">
  <div className="pointer-events-none opacity-25"><div className="h-40 rounded-hero bg-slab"/></div>
  <Sheet open onClose={closeNewProject} title="New project">
   {preparing?<div className="flex flex-col gap-4"><Skeleton h={50}/><Skeleton h={80}/><Skeleton h={60}/></div>:
    subjects.error||styles.error?<EmptyState art="plug" title="Setup couldn't load" body="Check your connection and try again."
     action={{label:'Retry',onClick:()=>{void subjects.refetch();void styles.refetch()}}}/>:
    <form onSubmit={e=>{void submit(e)}} className="flex flex-col gap-6">
     <section className="flex flex-col gap-2">
      <label htmlFor="project-title" className="text-[13px] font-medium text-ink-2">Name</label>
      <input id="project-title" required maxLength={100} autoFocus autoComplete="off"
       value={name} onChange={e=>setName(e.target.value)} disabled={saving||Boolean(created)}
       placeholder="Real Analysis" className="min-h-12 w-full rounded-ctl border border-edge-2 bg-well px-3 text-[16px] text-ink"/>
      <p className="text-[12px] text-ink-3">Path: {slugify(name||'project')}</p>
     </section>
     <section aria-label="Subject" className="flex flex-col gap-3">
      <h3 className="text-[14px] font-semibold text-ink-2">Subject</h3>
      <div role="radiogroup" aria-label="Subject" className="flex flex-wrap gap-2">
       {(subjects.data??[]).map(s=><button key={s.id} type="button" role="radio" aria-label={s.name} aria-checked={subjectId===s.id}
        disabled={saving||Boolean(created)} onClick={()=>setSubjectId(s.id)} className={'flex min-h-11 items-center gap-2 rounded-chip border px-3 text-[13px] '+
         (subjectId===s.id?'border-amber-line-2 bg-amber-tint-2 text-ink':'border-edge bg-fill-1 text-ink-2')}>
        <Glyph subject={s.glyph} hue={s.hue} size={32}/>{s.name}</button>)}
       <button type="button" className="flex min-h-11 items-center gap-2 rounded-chip border border-dashed border-edge-3 px-3 text-[13px] text-amber"
        aria-expanded={addingSubject} onClick={()=>setAddingSubject(v=>!v)} disabled={saving||Boolean(created)}><Plus size={18} aria-hidden="true"/>Add subject</button>
      </div>
      {addingSubject&&<SubjectCreator onCreated={id=>{setSubjectId(id);setAddingSubject(false)}}/>}
     </section>
     <section className="flex flex-col gap-2">
      <label htmlFor="project-goal" className="text-[14px] font-semibold text-ink-2">Goal</label>
      <textarea id="project-goal" rows={3} maxLength={2000} required
       placeholder="What should you be able to do? What do you know already?"
       disabled={saving||Boolean(created)} value={goal} onChange={e=>setGoal(e.target.value)}
       className="min-h-[98px] w-full rounded-ctl border border-edge-2 bg-well p-3 text-[15px] leading-relaxed text-ink"/>
     </section>
     <section aria-label="Source" className="flex flex-col gap-3">
      <h3 className="text-[14px] font-semibold text-ink-2">Source (optional)</h3>
      <input ref={fileInput} hidden type="file" accept=".pdf,application/pdf"
       onChange={e=>selectFile(e.currentTarget.files?.[0])}/>
      {!file?<button type="button" disabled={saving} onClick={()=>fileInput.current?.click()}
       className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-slab border border-dashed border-edge-3 bg-fill-1 text-[14px] text-ink-2">
       <FileText size={24} aria-hidden="true" className="text-amber"/>Add a PDF
       <span className="text-[12px] text-ink-3">Up to 50 MB</span>
      </button>:<div className="flex items-center gap-3 rounded-slab border border-edge bg-raised p-3">
       <PageStackArt size={65}/>
       <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{file.name}</p>
        <p className="mt-1 text-[12px] text-ink-3">{progress?.message??'Ready to import'}{progress?.pageCount?' · '+progress.page+'/'+progress.pageCount:''}</p>
        {progress&&<Rail value={progress.pageCount?progress.page/progress.pageCount:0} label="PDF processing progress" className="mt-2" sheen/>}
       </div>
       {!saving&&<button type="button" onClick={()=>{setFile(null);setProgress(null);setFileError(null)}} className="min-h-11 text-[12px] text-ink-3">Remove</button>}
      </div>}
      {fileError&&<p role="alert" className="flex items-center gap-2 text-[13px] text-again"><AlertTriangle size={15} aria-hidden="true"/>{fileError}</p>}
      {progress?.phase==='done'&&<p className="flex items-center gap-1.5 text-[13px] text-easy"><Check size={16}/>Contents found</p>}
      {progress?.phase==='failed'&&<p className="text-[13px] text-ink-3">Try the upload again or remove the PDF and continue.</p>}
     </section>
     <section aria-label="Teaching style" className="flex flex-col gap-3">
      <h3 className="text-[14px] font-semibold text-ink-2">Teaching style</h3>
      <div role="radiogroup" aria-label="Teaching style" className="flex gap-2 overflow-x-auto pb-1">
       {(styles.data??[]).map(s=><button key={s.key} role="radio" aria-checked={style===s.key}
        type="button" onClick={()=>setStyle(s.key)} disabled={saving||Boolean(created)}
        className={'min-h-11 shrink-0 rounded-chip border px-3 text-[13px] '+
         (style===s.key?'border-amber-line-2 bg-amber-tint-2 text-amber':'border-edge bg-fill-1 text-ink-2')}>
        {s.name}</button>)}
      </div>
      <p className="min-h-10 text-[12px] leading-relaxed text-ink-3">{styles.data?.find(s=>s.key===style)?.instructions}</p>
     </section>
     <Button size="xl" loading={saving} disabled={!canSubmit||saving} type="submit" icon={UploadCloud} className="w-full">
      {saving?progress?.message??'Creating project':created?'Retry PDF upload':'Create project'}
     </Button>
     <div className="flex flex-wrap items-center justify-center gap-2 text-[12px] text-ink-3">
      Then tell your tutor <Chip tone="quiet" icon={Copy} onClick={()=>{void copyPlanPrompt()}}>{prompt}</Chip>
     </div>
    </form>}
  </Sheet>
 </Screen>;
}
