import {ChevronRight} from 'lucide-react';
import {Tex} from '../../ui/Tex';
import {plainMath} from '../../lib/plain-math';
import type {Arc,AtlasNode,Focus,Tone} from './tree';
import {arcTone} from './tree';

/** Shared pieces of the collapsible idea graph: used by the Atlas and by plan review. */
export const ROW=44,GUTTER=84,INDENT=16;
/** Rows have a fixed height, so long names are clipped here (the graph theme un-truncates
 * `.truncate` elsewhere to keep formulas whole); the full name is in the details. */
export const clip={overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'} as const;
export const STORE='lemma.atlas.v2';
export const statusName={demonstrated:'Demonstrated',revisit:'Re-check due',in_progress:'In progress',not_started:'Not started'};
export const toneColor:Record<Tone,string>={up:'var(--grade-good)',down:'var(--accent)',related:'var(--hard)',self:'var(--accent)',none:'var(--ink-3)'};

export function StatusMark({node}:{node:AtlasNode}){
 const s=node.status;
 return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
  {s==='demonstrated'&&<circle cx="7" cy="7" r="5" fill="var(--accent)"/>}
  {s==='in_progress'&&<><circle cx="7" cy="7" r="5" fill="none" stroke="var(--accent)" strokeWidth="1.6"/><path d="M7 2a5 5 0 0 1 0 10z" fill="var(--accent)"/></>}
  {s==='revisit'&&<circle cx="7" cy="7" r="5" fill="none" stroke="var(--hard)" strokeWidth="1.8" strokeDasharray="2.4 1.8"/>}
  {s==='not_started'&&<circle cx="7" cy="7" r="4.6" fill="none" stroke="var(--ink-3)" strokeWidth="1.2"/>}
 </svg>;
}

/** Links drawn as nested arcs in a right-hand gutter, like a proof's dependency marks in a margin. */
export function Wires({arcs,rows,focus}:{arcs:Arc[];rows:number;focus:Focus|null}){
 const longest=Math.max(1,...arcs.map(a=>Math.abs(a.to-a.from)));
 const x0=8;
 const ordered=focus?[...arcs].sort((a,b)=>Number(arcTone(a,focus)!=='none')-Number(arcTone(b,focus)!=='none')):arcs;
 return <svg aria-hidden="true" data-atlas-wires="true" width={GUTTER} height={rows*ROW}
  className="pointer-events-none absolute right-0 top-0 overflow-visible">
  <defs>{(['none','up','down'] as Tone[]).map(t=><marker key={t} id={'atlas-arrow-'+t} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
   <path d="M1 1L7 4L1 7" fill="none" stroke={toneColor[t]} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></marker>)}</defs>
  {ordered.map(arc=>{
   const y1=arc.from*ROW+ROW/2,y2=arc.to*ROW+ROW/2,span=Math.abs(arc.to-arc.from);
   const reach=x0+10+(GUTTER-x0-22)*Math.sqrt(span/longest);
   const tone=arcTone(arc,focus),lit=tone!=='none';
   const opacity=focus?(lit?1:.12):arc.kind==='related'?.45:.62;
   const width=(lit?1.9:1.2)+Math.min(1.6,Math.log2(arc.count)*.7);
   return <g key={arc.key} data-arc-kind={arc.kind} data-arc-tone={tone} style={{transition:'opacity 160ms ease'}} opacity={opacity}>
    <path d={`M${x0} ${y1} C${reach} ${y1} ${reach} ${y2} ${x0} ${y2}`} fill="none" stroke={toneColor[tone]} strokeWidth={width}
     strokeDasharray={arc.kind==='related'?'2 4':undefined} strokeLinecap="round"
     markerEnd={arc.kind==='prereq'?`url(#atlas-arrow-${tone==='related'||tone==='self'?'none':tone})`:undefined}/>
    {arc.count>1&&<g transform={`translate(${reach*.75+x0*.25} ${(y1+y2)/2})`}>
     <circle r={Math.max(11.5,6+String(arc.count).length*4)} fill="var(--obsidian)" stroke={toneColor[tone]} strokeWidth="1"/>
     <text data-atlas-bundle-count="true" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="600" fill={toneColor[tone]}>{arc.count}</text>
    </g>}
   </g>;
  })}
 </svg>;
}

export function Row({node,open,tone,match,onToggle,onSelect}:{
 node:AtlasNode;open:boolean;tone:Tone;match:boolean;onToggle:()=>void;onSelect:()=>void;
}){
 const parent=node.children.length>0,root=node.depth===0,selected=tone==='self';
 // Preserve room for names on 360px phones beyond the third nesting level.
 const indentation=(depth:number)=>Math.min(depth,3)*INDENT+Math.max(0,depth-3)*8;
 const lead=12+indentation(node.depth);
 return <div role="treeitem" aria-level={node.depth+1} aria-expanded={parent?open:undefined} aria-selected={selected}
  data-atlas-row={node.id} data-level={node.level} data-tone={tone}
  className={'group relative flex items-center shadow-[inset_0_-1px_0_var(--line)] '+(selected?'bg-amber-tint':match?'bg-fill-1':'')}
  style={{height:ROW,paddingLeft:lead,paddingRight:GUTTER+4}}>
  {Array.from({length:node.depth},(_,d)=><span key={d} aria-hidden="true" className="absolute inset-y-0 w-px bg-edge"
   style={{left:12+indentation(d)+6}}/>)}
  {tone!=='none'&&<span aria-hidden="true" className="absolute inset-y-1 left-0 w-[3px] rounded-r" style={{background:toneColor[tone]}}/>}
  {parent?<button type="button" aria-label={(open?'Fold ':'Unfold ')+plainMath(node.name)} onClick={onToggle}
   className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-ctl text-ink-2">
   <ChevronRight size={16} style={{transform:open?'rotate(90deg)':'none',transition:'transform 140ms ease'}}/>
  </button>:<span className="flex size-7 shrink-0 items-center justify-center"><StatusMark node={node}/></span>}
  <button type="button" onClick={onSelect} aria-label={plainMath(node.name)+(parent?', '+node.done+' of '+node.total+' ideas':', '+statusName[node.status])}
   className="flex h-full min-w-0 flex-1 items-center gap-2 text-left">
   {root&&node.glyph&&<span aria-hidden="true" className="shrink-0 font-math text-title-s text-amber">{node.glyph}</span>}
   <span style={clip} className={'min-w-0 [&_*]:whitespace-nowrap '+(root?'font-serif text-body-l':parent?'text-body font-medium':'text-body')}><Tex source={node.name}/></span>
   {parent&&<span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1 text-caption tabular-nums text-ink-3">
    {node.revisit>0&&<span aria-label={node.revisit+' to re-check'} className="size-1.5 rounded-full bg-[var(--hard)]"/>}
    {node.done}/{node.total}
   </span>}
  </button>
 </div>;
}

