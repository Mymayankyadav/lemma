import {useMemo,useState} from 'react';
import {Link} from 'react-router';
import {useAtlas} from '../../../data/hooks';
import {getApi} from '../../../data';
import ConceptPin from './ConceptPin';
import AtlasImpactPreview from './ImpactPreview';
import AtlasCommands from './AtlasCommands';
import {FastTex} from '../../../ui/FastTex';
import {buildAtlasTree,initialExpanded,matches,visibleRows,type AtlasTree} from '../tree';

const control='min-h-11 rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 text-label font-medium text-ink hover:bg-[var(--paper-2)] focus-visible:outline-2 focus-visible:outline-[var(--link)]';
/** Real concepts alone contribute to the Atlas count; generated grouping rows never do. */
export function realIdeas(tree:AtlasTree):number {
 let total=0;
 for(const node of tree.nodes.values())if(!node.synthetic)total++;
 return total;
}

/** Flagged phone-first list: the unchanged legacy graph remains available at ?view=map. */
export default function AtlasV6(){
 const query=useAtlas();
 const tree=useMemo(()=>query.data?buildAtlasTree(query.data):null,[query.data]);
 const [search,setSearch]=useState('');
 const [folded,setFolded]=useState<Set<string>|null>(null);
 const [pinId,setPinId]=useState<string|null>(null);
 const [inspectId,setInspectId]=useState<string|null>(null);
 const [editId,setEditId]=useState<string|null|undefined>(undefined);
 const open=folded??(tree?initialExpanded(tree):new Set<string>());
 const filter=search.trim()?(node:Parameters<typeof matches>[0])=>matches(node,search):undefined;
 const rows=tree?visibleRows(tree,open,filter):[];
 const ideaCount=tree?realIdeas(tree):0;
 const selectedPin=pinId?tree?.nodes.get(pinId):null;
 const inspecting=inspectId?tree?.nodes.get(inspectId):null;
 const savePin=async(id:string,x:number|null,y:number|null)=>{
  // Only the existing owner-scoped, audited LemmaApi pinConcept write is used.
  await getApi().pinConcept(id,x,y);
  await query.refetch();
 };
 const toggle=(id:string)=>{
  setFolded(previous=>{
   const next=new Set(previous??open);
   if(next.has(id))next.delete(id);else next.add(id);
   return next;
  });
 };
 if(query.isPending)return <main aria-label="Atlas" className="p-4">
  <p role="status">Loading ideas…</p>
 </main>;
 if(query.error||!tree)return <main aria-label="Atlas" className="p-4">
  <h1 className="text-title-s font-semibold">Atlas</h1>
  <p role="alert">Could not load your ideas.</p>
  <button type="button" className={control} onClick={()=>{void query.refetch();}}>Retry</button>
 </main>;
 const groupCount=tree?[...tree.nodes.values()].filter(node=>node.synthetic).length:0;
 // N117 (mockup Atlas list in `53__index`): List / Map picker, one search and a ruled concept list;
 // each concept's map, pin and edit actions sit behind its own disclosure.
 return <main aria-label="Atlas" className="lg-page flex min-w-0 flex-col text-ink" data-atlas-view="list">
  <p className="-mt-4 mb-2 text-label text-ink-2" aria-label="Real idea count">{ideaCount} ideas (generated groups excluded) · {query.data?.links.length??0} connections</p>
  <div role="group" aria-label="Atlas view" className="notebook-atlas-picker">
   <button type="button" aria-pressed="true">List</button>
   <Link to="/atlas?view=map" className="flex min-h-11 flex-1 items-center justify-center rounded-[7px] text-[.875rem] font-medium text-ink-2">Map</Link>
  </div>
  <section className="flex min-w-0 flex-col gap-3 px-2">
   <h2 className="!font-[var(--font-ui)] !text-[1rem] font-semibold text-ink-2">Browse {ideaCount} concepts and {groupCount} groups</h2>
   <p className="text-label text-ink-2">Browse an idea to see its connections and linked checkpoints.</p>
   <label className="lg-outline-search flex flex-col gap-2 text-label text-ink-2">Find a concept
    <input aria-label="Find an idea" placeholder="Search all concepts" className="w-full rounded-[8px] text-body"
     value={search} onChange={e=>setSearch(e.target.value)}/>
   </label>
   <div className="flex items-center justify-between gap-3">
    <p className="text-caption text-ink-2">{rows.length} matching {rows.length===1?'concept':'concepts'}</p>
    <button type="button" className={control} onClick={()=>setEditId(null)}>New idea</button>
   </div>
  </section>
  <section role="region" aria-label="Idea hierarchy" tabIndex={0}
   className="lg-outline-list min-w-0 px-2 pb-6 focus-visible:outline-2 focus-visible:outline-[var(--link)]">
   {ideaCount===0&&<p className="p-4 text-label text-ink-2">Your Atlas is empty. Ideas appear as your plans grow.</p>}
   {ideaCount>0&&rows.length===0&&<p className="p-4 text-label text-ink-2">No ideas match your search.</p>}
   <ul className="flex flex-col">
    {rows.map(row=>{
     const node=tree.nodes.get(row.id)!;
     const hasChildren=node.children.length>0;
     const isOpen=open.has(node.id)||!!filter;
     const indent=Math.min(4,row.depth)*16;
     return <li key={node.id} role="listitem" className="min-w-0 py-2" style={{paddingLeft:indent}}>
      <div className="flex min-h-12 min-w-0 items-center gap-2">
       {hasChildren?<button type="button" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[6px] text-ink-2" aria-expanded={isOpen}
        aria-label={(isOpen?'Collapse ':'Expand ')+node.name} onClick={()=>toggle(node.id)}>{isOpen?'−':'+'}</button>:null}
       <div className="min-w-0 flex-1">
        <p className="lg-outline-name break-words [overflow-wrap:anywhere]"><FastTex source={node.name}/></p>
        {node.synthetic?<small className="block">Generated grouping row — not an idea · {node.due} due in this group</small>:
         <small className="block">{node.status.replaceAll('_',' ')} · {node.due} due</small>}
       </div>
       {!node.synthetic&&<details className="relative shrink-0">
        <summary aria-label={'Actions for '+node.name} className="flex min-h-11 min-w-11 list-none items-center justify-center rounded-[6px] text-ink-2 [&::-webkit-details-marker]:hidden">⋯</summary>
        <div className="mt-2 flex w-[min(280px,calc(100vw-48px))] flex-wrap gap-2 rounded-[10px] border border-[var(--edge)] bg-[var(--paper)] p-2 shadow-lg absolute right-0 z-20">
         <Link to={'/atlas?view=map&id='+encodeURIComponent(node.id)+'&focus='+encodeURIComponent(node.slug)}
          className={control+' inline-flex items-center'}>View on map</Link>
         <button type="button" className={control} onClick={()=>setPinId(node.id)}
          aria-label={'Edit map pin for '+node.name}>
          {node.pinX===null?'Pin on map':'Edit map pin'}
         </button>
         <button type="button" className={control} onClick={()=>setEditId(node.id)}
          aria-label={"Edit idea "+node.name}>Edit idea</button>
         <button type="button" className={control} onClick={()=>setInspectId(node.id)}
          aria-label={'Preview changes for '+node.name}>Preview edits</button>
         {node.checkpointRefs.map(checkpoint=>
          <Link key={checkpoint.projectSlug+checkpoint.code} className={control+' inline-flex items-center'}
           to={'/p/'+checkpoint.projectSlug+'/cp/'+checkpoint.code}>Checkpoint {checkpoint.code}</Link>
         )}
        </div>
       </details>}
      </div>
     </li>;
    })}
   </ul>
  </section>
  {selectedPin&&!selectedPin.synthetic&&<ConceptPin
   key={selectedPin.id} id={selectedPin.id} name={selectedPin.name}
   x={selectedPin.pinX} y={selectedPin.pinY}
   onSave={savePin} onClose={()=>setPinId(null)}/>}
  {editId!==undefined&&query.data&&
   <AtlasCommands key={editId??'new'} graph={query.data} sourceId={editId}
    onClose={()=>setEditId(undefined)} onSaved={async()=>{await query.refetch()}}/>}
  {inspecting&&!inspecting.synthetic&&query.data&&
   <AtlasImpactPreview key={inspecting.id} graph={query.data}
    sourceId={inspecting.id} onClose={()=>setInspectId(null)}/>}
 </main>;
}
