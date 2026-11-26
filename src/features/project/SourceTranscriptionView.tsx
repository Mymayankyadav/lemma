import {useEffect,useState} from 'react';
import {Check,ChevronLeft,ChevronRight,Download,PenLine} from 'lucide-react';
import type {Source,SourceTranscriptionStat} from '../../data/types';
import {getApi} from '../../data';
import {useSourcePage,useSourcePdfUrl,useUpdateSourcePage} from '../../data/hooks';
import {MathText} from '../../ui/MathText';
import {MathPreview} from '../../ui/MathPreview';
import {useToast} from '../../ui/Toast';
import {Button} from '../../ui/v7/components';
import './sources-surfaces.css';
import {sourceMarkdown,sourceTex} from './transcriptionExport';

export function SourceTranscriptionView({source,stat,initiallyOpen=false,showCoverage=true,v7=false}:{
 source:Source;stat:SourceTranscriptionStat|undefined;initiallyOpen?:boolean;showCoverage?:boolean;v7?:boolean
}){
 const Control=v7?Button:'button';
 const [open,setOpen]=useState(initiallyOpen),[page,setPage]=useState(1);
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState('');
 const [exporting,setExporting]=useState(false);
 const notify=useToast(),edit=useUpdateSourcePage();
 const count=Math.max(1,source.pageCount??1);
 const current=useSourcePage(open?source.id:'',page);
 const pdf=useSourcePdfUrl(open?source.id:'');
 const transcribed=current.data?.transcribedBy;
 useEffect(()=>{setEditing(false);setDraft(current.data?.body??'')},[current.data?.body,page]);
 const go=(next:number)=>{setPage(Math.min(count,Math.max(1,next)));setEditing(false)};
 const save=async(patch:{body?:string;confidence?:'high'|'check'})=>{
  try{
   await edit.mutateAsync({sourceId:source.id,page,patch});
   setEditing(false);
   notify('Page saved · Undo available in History',{tone:'success'});
  }catch(error){
   notify(error instanceof Error?error.message:'Could not save this page',{tone:'danger'});
  }
 };
 const exportPages=async(format:'tex'|'md')=>{
  if(exporting)return;
  setExporting(true);
  try{
   const pages=await getApi().getTranscribedPagesForExport(source.id);
   if(!pages.length){notify('No transcribed pages to export',{tone:'danger'});return}
   const content=format==='tex'?sourceTex(source.title,pages):sourceMarkdown(source.title,pages);
   const filename=(source.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'transcription')+'.'+format;
   const blob=new Blob([content],{type:format==='tex'?'application/x-tex':'text/markdown'});
   const url=URL.createObjectURL(blob);
   try{
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
   }finally{URL.revokeObjectURL(url)}
  }catch(error){notify(error instanceof Error?error.message:'Could not export transcription',{tone:'danger'})}
  finally{setExporting(false)}
 };
 const tellTutor=async()=>{
  const instruction="Transcribe my scanned notes '"+source.title+"' pages 1–10 into Lemma";
  try{await navigator.clipboard.writeText(instruction);notify('Transcription prompt copied',{tone:'success'})}
  catch{notify('Clipboard unavailable. Select and copy the transcription prompt.',{tone:'danger'})}
 };
 const hasPages=(source.pageCount??0)>0;
 const label=stat?.transcribed??0;
 const origin=source.origin==='claude'?'Claude':source.origin==='chatgpt'?'ChatGPT':null;
 const showProgress=showCoverage&&(label>0||!source.hasText);
 const needsCheck=showCoverage?stat?.needsCheck??0:0;
 return <div className="flex flex-col gap-2 text-label" data-source-transcription="" data-source-surface={v7?'reader':undefined}>
  {(origin||showProgress||needsCheck>0)&&<div className="flex flex-wrap items-center gap-2 source-text-secondary">
   {origin&&<span data-source-origin className="source-text-secondary">Transcribed by {origin}</span>}
   {showProgress&&<span aria-label="Transcription progress">{label} of {source.pageCount??0} pages transcribed</span>}
   {needsCheck>0&&<span aria-label={needsCheck+' pages need checking'} className="inline-flex items-center gap-1">
    <span className="size-2 rounded-full source-check-dot" aria-hidden="true"/>{needsCheck} to check
   </span>}
  </div>}
  <div className="flex flex-wrap items-center gap-3">
   {hasPages&&<Control type="button" data-source-view-pages className="px-2 source-text-secondary" aria-expanded={open}
     onClick={()=>setOpen(v=>!v)}>{open?'Hide transcription':'View pages'}</Control>}
   {label>0&&<Control type="button" disabled={exporting} onClick={()=>void exportPages('md')}
     className="flex items-center gap-1 px-2 source-text-secondary"><Download size={15}/>Download as .md</Control>}
   {label>0&&<Control type="button" disabled={exporting} onClick={()=>void exportPages('tex')}
     className="flex items-center gap-1 px-2 source-text-secondary"><Download size={15}/>Download as .tex</Control>}
   {!source.hasText&&<Control type="button" onClick={()=>void tellTutor()}
     className="px-2 source-text-secondary">Tell your tutor</Control>}
  </div>
  {open&&<section role="region" aria-label={'Page transcription for '+source.title} className="flex min-w-0 flex-col gap-3 rounded-ctl border source-reader p-3">
   <div className="flex items-center justify-between gap-2">
    <Control type="button" aria-label="Previous PDF page" disabled={page<=1}
     onClick={()=>go(page-1)} className="flex size-11 items-center justify-center disabled:opacity-35"><ChevronLeft/></Control>
    <label className="flex items-center gap-2">Page
     <input type="number" aria-label="PDF page number" min={1} max={count} value={page}
      onChange={event=>{const n=Number(event.target.value);if(Number.isSafeInteger(n))go(n)}}
      className="h-11 w-16 rounded-ctl border source-control px-2 source-text-primary"/>
     <span>of {count}</span>
    </label>
    <Control type="button" aria-label="Next PDF page" disabled={page>=count}
     onClick={()=>go(page+1)} className="flex size-11 items-center justify-center disabled:opacity-35"><ChevronRight/></Control>
   </div>
   <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
    {pdf.data&&<div className="min-w-0">
     <p className="mb-2 font-semibold source-text-secondary">Original PDF</p>
     <iframe title={'Original PDF page '+page} src={pdf.data+'#page='+page} loading="lazy"
      className="h-72 w-full rounded-s border source-control"/>
    </div>}
    <div className="min-w-0">
     <p className="mb-2 flex flex-wrap items-center gap-2 font-semibold source-text-secondary">
      Transcription {current.data?.confidence==='check'&&
       <span className="inline-flex items-center gap-1 source-warning"><span className="size-2 rounded-full source-check-dot"/>Check</span>}
     </p>
     {current.isLoading?<p>Loading page…</p>:current.isError?<p role="alert">Could not load page. <Control type="button" className="px-2 source-text-secondary" onClick={()=>void current.refetch()}>Retry</Control></p>
      :!current.data?.body?<p className="source-text-secondary">This page has not been transcribed yet.</p>
      :editing?<div className="flex flex-col gap-2">
        <textarea aria-label="Edit page transcription" maxLength={8000} rows={10} value={draft}
         onChange={e=>setDraft(e.target.value)} className="w-full rounded-ctl border source-control p-2 source-text-primary"/>
        <MathPreview source={draft} className="min-w-0 max-w-full overflow-x-auto" />
        <div className="flex flex-wrap gap-3">
         <Control type="button" disabled={edit.isPending} onClick={()=>void save({body:draft})}
          className="px-2 source-accent">Save page</Control>
         <Control type="button" onClick={()=>setEditing(false)} className="px-2 source-text-secondary">Cancel</Control>
        </div>
       </div>:
        <div className="max-h-96 overflow-auto rounded-s source-card p-3"><MathText source={current.data.body}/></div>}
     {current.data?.body&&transcribed&&!editing&&<div className="mt-2 flex flex-wrap gap-3">
      <Control type="button" onClick={()=>setEditing(true)}
       className="flex items-center gap-1 px-2 source-text-secondary"><PenLine size={15}/>Edit page</Control>
      {current.data.confidence==='check'&&<Control type="button" disabled={edit.isPending}
       onClick={()=>void save({confidence:'high'})}
       className="flex items-center gap-1 px-2 source-text-secondary"><Check size={15}/>Mark checked</Control>}
     </div>}
    </div>
   </div>
  </section>}
 </div>;
}
