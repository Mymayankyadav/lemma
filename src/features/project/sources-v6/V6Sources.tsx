import {useState,type ReactNode} from 'react';
import type {Source,SourceTranscriptionStat} from '../../../data/types';
import {useSourceTranscriptionStats} from '../../../data/hooks';
import {FastTex as Tex} from '../../../ui/FastTex';
import {SourceTranscriptionView} from '../SourceTranscriptionView';

const action='min-h-11 rounded-ctl border border-edge bg-fill-1 px-4 py-2 text-label font-semibold text-ink focus-visible:outline-2 focus-visible:outline-amber';

export function orderedSources(sources:readonly Source[]):Source[]{
 return [...sources].sort((a,b)=>(a.position??Number.MAX_SAFE_INTEGER)-(b.position??Number.MAX_SAFE_INTEGER)
 ||Date.parse(a.addedAt??a.createdAt)-Date.parse(b.addedAt??b.createdAt)||a.id.localeCompare(b.id));
}
export function coverageOf(source:Source,stat:SourceTranscriptionStat|undefined):{label:string;verification:string}{
 const pages=source.pageCount;
 if(pages===null)return {label:source.hasText?'Text available · page count unknown':'Page count unknown',
  verification:'Verification unavailable'};
 if(!stat)return {label:source.hasText?pages+' pages · embedded text available':pages+' pages · transcription coverage unavailable',
  verification:'Verification unavailable'};
 const transcribed=Math.max(0,Math.min(pages,stat.transcribed));
 const needsCheck=Math.max(0,Math.min(transcribed,stat.needsCheck));
 return {label:transcribed+' of '+pages+' pages transcribed',
  verification:needsCheck>0?needsCheck+' '+(needsCheck===1?'page':'pages')+' need checking':
   transcribed>0?'No flagged transcription pages':'No verified transcription pages'};
}
/** N82 is presentation-only: existing owner-scoped ingestion and transcript controls remain authoritative. */
export default function V6Sources({projectId,sources,manage}:{projectId:string;sources:Source[];manage:ReactNode}){
 const stats=useSourceTranscriptionStats(projectId),[showManage,setShowManage]=useState(false),[limit,setLimit]=useState(20);
 const byId=new Map((stats.data??[]).map(stat=>[stat.sourceId,stat]));
 const rows=orderedSources(sources);
 return <section data-v6-sources className="flex min-w-0 flex-col gap-4">
  <header><h2 className="text-title-s font-semibold">Study sources</h2>
   <p className="text-label text-ink-2">{rows.length} {rows.length===1?'source':'sources'} in plan order</p>
   {stats.isPending&&<p role="status" className="text-caption text-ink-2">Loading transcription coverage…</p>}
   {stats.isError&&<p role="alert" className="text-caption text-ink-2">Transcription coverage unavailable. Source records remain visible.</p>}
  </header>
  {rows.length===0?<p className="rounded-ctl border border-edge bg-fill-1 p-4 text-label text-ink-2">
   No sources yet. Add a PDF, TeX or Markdown document below.</p>:
   <ol className="flex min-w-0 flex-col gap-3">{rows.slice(0,limit).map((source,index)=>{
    const stat=byId.get(source.id),coverage=coverageOf(source,stat);
    return <li key={source.id} className="min-w-0 rounded-ctl border border-edge bg-raised p-4">
     <div className="flex min-w-0 gap-3"><span className="shrink-0 text-caption text-amber">{index+1}</span>
      <div className="min-w-0 flex-1">
       <h3 className="break-words text-body-l font-semibold"><Tex source={source.title}/></h3>
       <p className="mt-1 text-label text-ink-2">{source.kind??'other'} · {source.status}</p>
       <p aria-label={'Coverage for '+source.title} className="mt-1 text-label text-ink-2">{coverage.label}</p>
       <p aria-label={'Verification for '+source.title} className="mt-1 text-label text-ink-2">{coverage.verification}</p>
       <p className="mt-1 text-caption text-ink-2">
        {source.planCheckedAt?'Checked against plan '+new Date(source.planCheckedAt).toLocaleDateString():'Not yet checked against plan'}</p>
       <div className="mt-3 min-w-0 break-words [overflow-wrap:anywhere]">
        <SourceTranscriptionView source={source} stat={stat}/></div>
      </div>
     </div>
    </li>;
   })}</ol>}
  {limit<rows.length&&<button type="button" className={action} onClick={()=>setLimit(n=>n+20)}>
   Show 20 more sources · {rows.length-limit} remaining</button>}
  <section aria-label="Manage sources" className="flex flex-col gap-3">
   <button type="button" className={action} aria-expanded={showManage} onClick={()=>setShowManage(v=>!v)}>
    {showManage?'Hide source management':'Add, edit or remove sources'}</button>
   {showManage&&manage}
  </section>
 </section>;
}
