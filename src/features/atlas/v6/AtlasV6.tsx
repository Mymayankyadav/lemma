import {useMemo,useState} from 'react';
import {Link} from 'react-router';
import {useAtlas} from '../../../data/hooks';
import {getApi} from '../../../data';
import ConceptPin from './ConceptPin';
import AtlasImpactPreview from './ImpactPreview';
import AtlasEditor from './AtlasEditor';
import {FastTex} from '../../../ui/FastTex';
import {buildAtlasTree,initialExpanded,matches,visibleRows,type AtlasTree} from '../tree';

const control='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber';
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
 const [editorId,setEditorId]=useState<string|null>(null);
 const open=folded??(tree?initialExpanded(tree):new Set<string>());
 const filter=search.trim()?(node:Parameters<typeof matches>[0])=>matches(node,search):undefined;
 const rows=tree?visibleRows(tree,open,filter):[];
 const ideaCount=tree?realIdeas(tree):0;
 const selectedPin=pinId?tree?.nodes.get(pinId):null;
 const inspecting=inspectId?tree?.nodes.get(inspectId):null;
 const edited=editorId&&editorId!=='new'?query.data?.concepts.find(c=>c.id===editorId)??null:null;
 const afterEdit=async()=>{await query.refetch();setEditorId(null);setInspectId(null);};
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
 return <main aria-label="Atlas" className="flex h-dvh flex-col overflow-hidden text-ink">
  <header className="shrink-0 border-b border-edge bg-[var(--paper)] p-4">
   <div className="flex items-center justify-between gap-3">
    <div><h1 className="text-title-s font-semibold">Atlas ideas</h1>
     <p className="text-label text-ink-2" aria-label="Real idea count">{ideaCount} ideas (generated groups excluded)</p></div>
    <div className="flex flex-wrap gap-2">
     {query.data?.subjects.length?<button type="button" className={control} onClick={()=>setEditorId('new')}>New idea</button>:null}
     <Link to="/atlas?view=map" className={control}>Map</Link>
    </div>
   </div>
   <label className="mt-3 block text-label font-semibold text-ink-2">Find an idea
    <input aria-label="Find an idea" className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 text-body text-ink"
     value={search} onChange={e=>setSearch(e.target.value)}/>
   </label>
  </header>
  <section className="min-h-0 flex-1 overflow-y-auto p-3 pb-24" aria-label="Idea hierarchy">
   {ideaCount===0&&<p className="p-4 text-label text-ink-2">Your Atlas is empty. Ideas appear as your plans grow.</p>}
   {ideaCount>0&&rows.length===0&&<p className="p-4 text-label text-ink-2">No ideas match your search.</p>}
   <ul className="flex flex-col gap-2">
    {rows.map(row=>{
     const node=tree.nodes.get(row.id)!;
     const hasChildren=node.children.length>0;
     const isOpen=open.has(node.id)||!!filter;
     const indent=Math.min(4,row.depth)*12;
     return <li key={node.id} className="min-w-0 rounded-ctl border border-edge bg-[var(--paper)] p-3"
      style={{marginLeft:indent}}>
      <div className="flex min-w-0 items-start gap-2">
       {hasChildren?<button type="button" className={control+' shrink-0'} aria-expanded={isOpen}
        aria-label={(isOpen?'Collapse ':'Expand ')+node.name} onClick={()=>toggle(node.id)}>{isOpen?'−':'+'}</button>:
        <span aria-hidden="true" className="w-2 shrink-0"/>}
       <div className="min-w-0 flex-1">
        <p className="break-words text-body font-semibold"><FastTex source={node.name}/></p>
        {node.synthetic?<p className="text-caption text-ink-2">Generated grouping row — not an idea</p>:
         <p className="text-caption text-ink-2">{node.status.replaceAll('_',' ')} · {node.due} due</p>}
        {node.synthetic&&<p className="text-caption text-ink-2">{node.due} due in this group</p>}
       </div>
      </div>
      {!node.synthetic&&<div className="mt-2 flex flex-wrap gap-2">
       <Link to={'/atlas?view=map&id='+encodeURIComponent(node.id)+'&focus='+encodeURIComponent(node.slug)}
        className={control}>View on map</Link>
       <button type="button" className={control} onClick={()=>setPinId(node.id)}
        aria-label={'Edit map pin for '+node.name}>
        {node.pinX===null?'Pin on map':'Edit map pin'}
       </button>
       <button type="button" className={control} onClick={()=>setEditorId(node.id)}
        aria-label={'Edit idea '+node.name}>Edit idea</button>
       <button type="button" className={control} onClick={()=>setInspectId(node.id)}
        aria-label={'Preview changes for '+node.name}>Edit links / merge</button>
       {node.checkpointRefs.map(checkpoint=>
        <Link key={checkpoint.projectSlug+checkpoint.code} className={control}
         to={'/p/'+checkpoint.projectSlug+'/cp/'+checkpoint.code}>Checkpoint {checkpoint.code}</Link>
       )}
      </div>}
     </li>;
    })}
   </ul>
  </section>
  {selectedPin&&!selectedPin.synthetic&&<ConceptPin
   key={selectedPin.id} id={selectedPin.id} name={selectedPin.name}
   x={selectedPin.pinX} y={selectedPin.pinY}
   onSave={savePin} onClose={()=>setPinId(null)}/>}
  {editorId&&query.data&&<AtlasEditor key={editorId}
   graph={query.data} concept={edited} onSaved={afterEdit}
   onClose={()=>setEditorId(null)}/>}
  {inspecting&&!inspecting.synthetic&&query.data&&
   <AtlasImpactPreview key={inspecting.id} graph={query.data}
    sourceId={inspecting.id} onSaved={afterEdit}
    onClose={()=>setInspectId(null)}/>}
 </main>;
}
