import {useState} from 'react';
import {FileText} from 'lucide-react';
import {useSourceTranscriptionStats} from '../../../data/hooks';
import type {Source} from '../../../data/types';
import {Button,Sheet} from '../../../ui/v7/components';
import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {Disclosure} from '../../../ui/v7/Disclosure';
import {SourceTranscriptionView} from '../SourceTranscriptionView';
import {SourcesPanel} from '../SourcesPanel';

export default function SourcesV7({projectId,sources,focusSourceId}: {projectId:string;sources:Source[];focusSourceId?:string|null}) {
  const stats=useSourceTranscriptionStats(projectId);
  const [selected,setSelected]=useState<string|null>(focusSourceId??null),[manage,setManage]=useState(false);
  const source=sources.find(item=>item.id===selected);
  return <>
    {!sources.length?<EmptyMoment title="No sources yet" action={{label:'Add source',onClick:()=>setManage(true)}}/>:
      <section aria-label="Sources" className="v7-path-source-list">
        <ul>{sources.map(item=>{
          const summary=stats.data?.find(row=>row.sourceId===item.id);
          const pages=summary?.transcribed??0;
          return <li key={item.id}>
            <FileText aria-hidden="true" size={18}/>
            <button type="button" onClick={()=>setSelected(item.id)}><strong>{item.short||item.title}</strong>
              <small>{pages} of {item.pageCount??0} pages transcribed</small></button>
            {item.planCheckedAt===null&&<span className="v7-meta-chip">To check</span>}
          </li>;
        })}</ul>
        <Button small onClick={()=>setManage(true)}>Manage sources</Button>
      </section>}
    {source&&<Sheet open title={source.title} onClose={()=>setSelected(null)}>
      <p>{source.short||source.title}</p>
      <Disclosure label="Source actions"><Button small onClick={()=>{setSelected(null);setManage(true);}}>Manage or download</Button></Disclosure>
    </Sheet>}
    {manage&&<Sheet open title="Manage sources" onClose={()=>setManage(false)}>
      <SourcesPanel projectId={projectId} sources={sources} focusSourceId={selected}/>
    </Sheet>}
  </>;
}
