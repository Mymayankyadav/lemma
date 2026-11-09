import {plainMath} from '../../../lib/plain-math';
import {useMemo,useState} from 'react';
import {Link} from 'react-router';
import {useV6HeaderTitle} from '../../../app/v6Title';
import {useAtlas} from '../../../data/hooks';
import {getApi} from '../../../data';
import ConceptPin from './ConceptPin';
import AtlasImpactPreview from './ImpactPreview';
import AtlasCommands from './AtlasCommands';
import {FastTex} from '../../../ui/FastTex';
import {buildAtlasTree,conceptCounts,matches,type AtlasTree} from '../tree';

const control='min-h-11 rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 text-label font-medium text-ink hover:bg-[var(--paper-2)] focus-visible:outline-2 focus-visible:outline-[var(--link)]';
/** Real concepts alone contribute to the Atlas count; generated grouping rows never do. */
export function realIdeas(tree:AtlasTree):number {
 let total=0;
 for(const node of tree.nodes.values())if(!node.synthetic)total++;
 return total;
}

const PAGE=200;
const statusText=(status:string)=>({demonstrated:'Demonstrated',in_progress:'In progress',revisit:'Re-check due',not_started:'Not started'} as Record<string,string>)[status]??'Not started';
/** Flagged phone-first list: the unchanged legacy graph remains available at ?view=map. */
export default function AtlasV6(){
 const query=useAtlas();
 const tree=useMemo(()=>query.data?buildAtlasTree(query.data):null,[query.data]);
 const [search,setSearch]=useState('');
 const [pinId,setPinId]=useState<string|null>(null);
 const [inspectId,setInspectId]=useState<string|null>(null);
 const [editId,setEditId]=useState<string|null|undefined>(undefined);
 const [actionsFor,setActionsFor]=useState<string|null>(null);
 const [shown,setShown]=useState(PAGE);
 // #1333 (mockup): one flat, ruled list of concept names; generated groups are not listed.
 const rows=useMemo(()=>tree?[...tree.nodes.values()].filter(node=>!node.synthetic&&(!search.trim()||matches(node,search)))
  .sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base'})):[],[tree,search]);
 const ideaCount=tree?realIdeas(tree):0;
 const counts=tree?conceptCounts(tree):null;
 useV6HeaderTitle('Concept map',counts?counts.concepts+' concepts · '+counts.connections+' connections':null);
 const selectedPin=pinId?tree?.nodes.get(pinId):null;
 const inspecting=inspectId?tree?.nodes.get(inspectId):null;
 const savePin=async(id:string,x:number|null,y:number|null)=>{
  // Only the existing owner-scoped, audited LemmaApi pinConcept write is used.
  await getApi().pinConcept(id,x,y);
  await query.refetch();
 };
 if(query.isPending)return <main aria-label="Atlas" className="p-4">
  <p role="status">Loading concepts…</p>
 </main>;
 if(query.error||!tree)return <main aria-label="Atlas" className="p-4">
  <h1 className="text-title-s font-semibold">Concept map</h1>
  <p role="alert">Could not load your concepts.</p>
  <button type="button" className={control} onClick={()=>{void query.refetch();}}>Retry</button>
 </main>;

 // N117 (mockup Atlas list in `53__index`): List / Map picker, one search and a ruled concept list;
 // each concept's map, pin and edit actions sit behind its own disclosure.
 // N117 + #1325/#1326 (mockup Atlas list): the count is the header subtitle; the list is plain names.
 // A concept row opens its own actions; a group keeps a quiet expander; status stays for screen readers.
 return <main aria-label="Atlas" className="lg-page flex min-w-0 flex-col text-ink" data-atlas-view="list">
  <p className="sr-only" aria-label="Real concept count">{ideaCount} concepts (generated groups excluded)</p>
  <div role="group" aria-label="Atlas view" className="notebook-atlas-picker">
   <button type="button" aria-pressed="true">List</button>
   <Link to="/atlas?view=map" className="flex min-h-11 flex-1 items-center justify-center rounded-[7px] text-[.875rem] font-medium text-ink-2">Map</Link>
  </div>
  <section className="flex min-w-0 flex-col gap-3 px-2">
   <h2 className="sr-only">{ideaCount} concepts</h2>
   <p className="text-label text-ink-2">Open a concept to see its connections and linked checkpoints.</p>
   <label className="lg-outline-search flex flex-col gap-2 text-label text-ink-2">Find a concept
    <input aria-label="Find a concept" placeholder="Search all concepts" className="w-full rounded-[8px] text-body"
     value={search} onChange={e=>{setSearch(e.target.value);setShown(PAGE);}}/>
   </label>
   {search.trim()&&<p className="text-caption text-ink-2">{rows.length} matching {rows.length===1?'concept':'concepts'}</p>}
  </section>
  <section role="region" aria-label="Concept list" tabIndex={0}
   className="lg-outline-list min-w-0 px-2 pb-6 focus-visible:outline-2 focus-visible:outline-[var(--link)]">
   {ideaCount===0&&<p className="p-4 text-label text-ink-2">No concepts yet. They appear as your plans grow.</p>}
   {ideaCount>0&&rows.length===0&&<p className="p-4 text-label text-ink-2">No concepts match your search.</p>}
   <ul className="flex flex-col">
    {rows.slice(0,shown).map(node=>{
     const acting=actionsFor===node.id;
     return <li key={node.id} role="listitem" className="min-w-0">
      <div className="flex min-h-14 min-w-0 items-center gap-2">
       <button type="button" aria-expanded={acting} aria-label={'Actions for '+plainMath(node.name)}
        onClick={()=>setActionsFor(acting?null:node.id)}
        className="lg-outline-name min-h-11 min-w-0 flex-1 break-words text-left [overflow-wrap:anywhere]"><FastTex source={node.name}/></button>
      </div>
      <p className="-mt-2 pb-2 text-caption text-ink-2">{statusText(node.status)}{node.due>0?' · '+node.due+' due':''}</p>
      {acting&&<div className="flex flex-wrap gap-2 pb-3">
       <Link to={'/atlas?view=map&id='+encodeURIComponent(node.id)+'&focus='+encodeURIComponent(node.slug)}
        className={control+' inline-flex items-center'}>View on map</Link>
       <button type="button" className={control} onClick={()=>setPinId(node.id)}
        aria-label={'Edit map pin for '+plainMath(node.name)}>
        {node.pinX===null?'Pin on map':'Edit map pin'}
       </button>
       <button type="button" className={control} onClick={()=>setEditId(node.id)}
        aria-label={"Edit concept "+plainMath(node.name)}>Edit concept</button>
       <button type="button" className={control} onClick={()=>setInspectId(node.id)}
        aria-label={'Preview changes for '+plainMath(node.name)}>Preview edits</button>
       {node.checkpointRefs.map(checkpoint=>
        <Link key={checkpoint.projectSlug+checkpoint.code} className={control+' inline-flex items-center'}
         to={'/p/'+checkpoint.projectSlug+'/cp/'+checkpoint.code}>Open checkpoint {checkpoint.code}</Link>
       )}
      </div>}
     </li>;
    })}
   </ul>
   {rows.length>shown&&<button type="button" className="mt-2 min-h-11 text-label text-[var(--link)]" onClick={()=>setShown(n=>n+PAGE)}>
    Show more concepts ({rows.length-shown} left)</button>}
   {ideaCount>0&&<button type="button" className="mt-4 min-h-11 text-label text-[var(--link)]" onClick={()=>setEditId(null)}>New concept</button>}
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
