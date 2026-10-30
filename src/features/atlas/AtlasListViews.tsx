import {useState} from 'react';
import type {AtlasGraph} from '../../data/types';
import {ChevronDown,ChevronRight,Check,RotateCcw} from 'lucide-react';
import {atlasHierarchy} from './hierarchy';
import type {AtlasConcept,AtlasTopicGroup} from './hierarchy';

export type AtlasListMode='branches'|'outline';
export type AtlasFilter='all'|'revisit'|'demonstrated';

const statusName:Record<AtlasConcept['status'],string>={
 demonstrated:'Demonstrated',revisit:'Re-check due',in_progress:'In progress',not_started:'Not started',
};
function StatusMark({status}:{status:AtlasConcept['status']}){
 return status==='demonstrated'?<Check size={14} aria-hidden="true" className="text-easy"/>:
  status==='revisit'?<RotateCcw size={14} aria-hidden="true" className="text-amber"/>:
  <span aria-hidden="true" className={'block size-2 rounded-full '+(status==='in_progress'?'bg-amber':'bg-ink-4')}/>;
}
function Idea({concept,filter,selected,onSelect,mode}:{concept:AtlasConcept;filter:AtlasFilter;selected:boolean;onSelect:(id:string)=>void;mode:AtlasListMode}){
 const dim=filter!=='all'&&concept.status!==filter&&!selected;
 return <button type="button" data-atlas-idea={concept.id} onClick={()=>onSelect(concept.id)}
  aria-label={concept.name+', '+statusName[concept.status]} aria-pressed={selected}
  className={'flex min-h-11 w-full items-center gap-2 rounded-ctl px-3 text-left transition-opacity '+(selected?'bg-amber-tint text-amber':'text-ink-soft hover:bg-fill-1')+(dim?' opacity-[.18]':'')}>
  <StatusMark status={concept.status}/>
  <span className="min-w-0 flex-1 break-words font-math text-body">{concept.name}</span>
  {mode==='outline'&&concept.dueCards>0&&<span className="shrink-0 text-caption tabular-nums text-ink-3">{concept.dueCards} due</span>}
 </button>;
}
function Progress({done,total}:{done:number;total:number}){
 return <div className="h-1 w-full overflow-hidden rounded-full bg-fill-2" role="progressbar"
  aria-label="Demonstrated ideas" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
  <div className="h-full rounded-full bg-amber" style={{width:(total?done/total*100:0)+'%'}}/>
 </div>;
}
function Topic({topic,subjectId,mode,filter,selectedId,onSelect,defaultOpen}:{topic:AtlasTopicGroup;subjectId:string;mode:AtlasListMode;filter:AtlasFilter;selectedId:string|null;onSelect:(id:string)=>void;defaultOpen:boolean}){
 const key=subjectId+'|'+topic.name;
 const [open,setOpen]=useState(defaultOpen);
 return <section data-atlas-topic={key} className={mode==='branches'?'min-w-0 rounded-slab border border-edge-2 bg-raised/70 p-2':'min-w-0 border-l border-edge-2 pl-3'}>
  <button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}
   className="flex min-h-11 w-full items-center gap-2 rounded-ctl px-2 text-left text-ink">
   {open?<ChevronDown size={16} aria-hidden="true"/>:<ChevronRight size={16} aria-hidden="true"/>}
   <span className="min-w-0 flex-1 break-words font-semibold text-body">{topic.name}</span>
   <span className="shrink-0 text-caption tabular-nums text-ink-3">{topic.demonstrated}/{topic.concepts.length}</span>
  </button>
  <Progress done={topic.demonstrated} total={topic.concepts.length}/>
  {open&&<div className={mode==='branches'?'mt-2 border-l border-amber-line pl-2':'mt-2 pl-2'}>
   {topic.concepts.map(concept=><Idea key={concept.id} concept={concept} mode={mode} filter={filter}
    selected={selectedId===concept.id} onSelect={onSelect}/>)}
  </div>}
 </section>;
}
export function AtlasListViews({graph,mode,filter,selectedId,onSelect}:{graph:AtlasGraph;mode:AtlasListMode;filter:AtlasFilter;selectedId:string|null;onSelect:(id:string)=>void}){
 const subjects=atlasHierarchy(graph);
 const [collapsed,setCollapsed]=useState<string[]>([]);
 return <div data-atlas-mode={mode} className={"absolute inset-x-0 bottom-0 top-0 overflow-y-auto overscroll-contain px-4 pt-56 text-ink "+(selectedId?"pb-[360px]":"pb-48")}>
  <div className="mx-auto flex max-w-[760px] flex-col gap-4">
   {subjects.map(subject=>{
    const open=!collapsed.includes(subject.id);
    return <section key={subject.id} data-atlas-subject={subject.id} className="rounded-slab border border-edge-2 bg-raised/90 p-3">
     <button type="button" aria-expanded={open} onClick={()=>setCollapsed(ids=>open?[...ids,subject.id]:ids.filter(id=>id!==subject.id))}
      className="flex min-h-11 w-full items-center gap-3 rounded-ctl text-left">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-ctl bg-amber-tint font-math text-headline text-amber">{subject.glyph}</span>
      <span className="min-w-0 flex-1"><strong className="block break-words font-serif text-title-s">{subject.name}</strong>
       <span className="text-caption text-ink-3">{subject.demonstrated}/{subject.total} ideas demonstrated</span></span>
      {open?<ChevronDown size={18}/>:<ChevronRight size={18}/>}
     </button>
     <div className="mt-2"><Progress done={subject.demonstrated} total={subject.total}/></div>
     {open&&<div className={mode==='branches'?'mt-4 grid gap-3 sm:grid-cols-2':'mt-3 flex flex-col gap-3'}>
      {subject.topics.map(topic=><Topic key={subject.id+'|'+topic.name} subjectId={subject.id}
       topic={topic} mode={mode} filter={filter} selectedId={selectedId} onSelect={onSelect}
       defaultOpen={mode==='outline'||topic.active>0}/>)}
     </div>}
    </section>;
   })}
  </div>
 </div>;
}
