import {useState} from 'react';
import {FileText} from 'lucide-react';
import {useSearchParams} from 'react-router';
import {createLazyModule} from '../../../app/lazyModule';
import LazyOverlay from '../../../app/v7/LazyOverlay';
import {useSourceTranscriptionStats} from '../../../data/hooks';
import type {Source} from '../../../data/types';
import {Button,Sheet} from '../../../ui/v7/components';
import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {handoffLayer} from '../../../ui/v7/layers';
import {SourceTranscriptionView} from '../SourceTranscriptionView';

const managerModule=createLazyModule(()=>import('../SourcesPanel'));
const sourcesManager={read:()=>managerModule.read().then(module=>({default:module.V7SourcesManager}))};

export default function SourcesV7({projectId,sources,focusSourceId}: {projectId:string;sources:Source[];focusSourceId?:string|null}) {
  const stats=useSourceTranscriptionStats(projectId);
  const [params,setParams]=useSearchParams();
  const [selected,setSelected]=useState<string|null>(null);
  const [manageSource,setManageSource]=useState<string|null>();
  const [readerDirty,setReaderDirty]=useState(false);
  const source=sources.find(item=>item.id===(focusSourceId??selected));
  const followsUrl=!!source&&source.id===focusSourceId;
  const historyEntry=followsUrl&&typeof window!=='undefined'&&window.history.state?.idx>0;
  function closeReader(){
    setSelected(null);setReaderDirty(false);
    if(followsUrl){
      const next=new URLSearchParams(params);
      next.delete('source');
      setParams(next,{replace:true});
    }
  }
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
    {source&&<Sheet key={source.id} open title={source.title} focusTitle historyEntry={historyEntry} dirty={readerDirty} onClose={closeReader}>
        <p className="v7-meta">{source.short}{source.pageCount!=null?' · '+source.pageCount+' pages':''}</p>
        <SourceTranscriptionView source={source} stat={stats.data?.find(row=>row.sourceId===source.id)} initiallyOpen v7 onDirtyChange={setReaderDirty}/>
        <Button small onClick={()=>{
          if(readerDirty){setManageSource(source.id);return;}
          handoffLayer(()=>{setManageSource(source.id);closeReader();});
        }}>Manage this source</Button>
    </Sheet>}
    {manageSource!==undefined&&<LazyOverlay title="Manage sources" onClose={()=>setManageSource(undefined)}
      source={sourcesManager} bodyProps={{projectId,sources,focusSourceId:manageSource}}/>}
  </>;
}
