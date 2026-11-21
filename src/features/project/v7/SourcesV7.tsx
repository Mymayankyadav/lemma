import {useEffect,useState} from 'react';
import {FileText} from 'lucide-react';
import {useLocation} from 'react-router';
import {useSourceTranscriptionStats} from '../../../data/hooks';
import type {Source} from '../../../data/types';
import {Button,Sheet} from '../../../ui/v7/components';
import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {SourceTranscriptionView} from '../SourceTranscriptionView';
import {SourcesPanel} from '../SourcesPanel';

export default function SourcesV7({projectId,sources,focusSourceId}: {projectId:string;sources:Source[];focusSourceId?:string|null}) {
  const stats=useSourceTranscriptionStats(projectId),location=useLocation();
  const [selected,setSelected]=useState<string|null>(focusSourceId??null);
  const [manageSource,setManageSource]=useState<string|null>();
  useEffect(()=>{if(focusSourceId)setSelected(focusSourceId);},[focusSourceId,location.key]);
  const source=sources.find(item=>item.id===selected);
  return <>
    {!sources.length?<EmptyMoment title="No sources yet" action={{label:'Add source',onClick:()=>setManageSource(null)}}/>:
      <section aria-label="Sources" className="v7-path-source-list">
        <ul>{sources.map(item=>{
          const summary=stats.data?.find(row=>row.sourceId===item.id);
          const progress=summary&&item.pageCount!=null?`${summary.transcribed} of ${item.pageCount} pages transcribed`
            :summary&&summary.transcribed>0?`${summary.transcribed} pages transcribed`
            :item.pageCount!=null?`${item.pageCount} pages`:null;
          const needsCheck=summary?.needsCheck??0;
          return <li key={item.id}>
            <FileText aria-hidden="true" size={18}/>
            <button type="button" onClick={()=>setSelected(item.id)}><strong>{item.short||item.title}</strong>
              {progress&&<small>{progress}</small>}</button>
            {needsCheck>0?<span className="v7-meta-chip">{needsCheck} to check</span>
              :item.planCheckedAt===null&&<span className="v7-meta-chip">To check</span>}
          </li>;
        })}</ul>
        <Button small onClick={()=>setManageSource(null)}>Manage sources</Button>
      </section>}
    {source&&<Sheet key={source.id} open title={source.title} focusTitle onClose={()=>setSelected(null)}>
        <p className="v7-meta">{source.short}{source.pageCount!=null?' · '+source.pageCount+' pages':''}</p>
        <SourceTranscriptionView source={source} stat={stats.data?.find(row=>row.sourceId===source.id)} initiallyOpen/>
        <Button small onClick={()=>{setManageSource(source.id);setSelected(null);}}>Manage this source</Button>
    </Sheet>}
    {manageSource!==undefined&&<Sheet open title="Manage sources" onClose={()=>setManageSource(undefined)}>
      <SourcesPanel projectId={projectId} sources={sources} focusSourceId={manageSource}/>
    </Sheet>}
  </>;
}
