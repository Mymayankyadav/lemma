import {ChevronRight} from 'lucide-react';
import {Tex} from '../../ui/Tex';
import {plainMath} from '../../lib/plain-math';
import type {Arc,AtlasNode,Focus,Tone} from './tree';
import {arcTone} from './tree';
import {layoutAtlasLanes} from './lanes';

/** Shared pieces of the collapsible idea graph: used by the Atlas and by plan review. */
export const ROW=44,GUTTER=84,INDENT=16;
/** Rows have a fixed height, so long names are clipped here (the graph theme un-truncates
 * `.truncate` elsewhere to keep formulas whole); the full name is in the details. */
export const clip={overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'} as const;
export const STORE='lemma.atlas.v2';
export const statusName={demonstrated:'Demonstrated',revisit:'Re-check due',in_progress:'In progress',not_started:'Not started'};
export const toneColor:Record<Tone,string>={up:'var(--link)',down:'var(--accent)',related:'var(--ink-3)',self:'var(--accent)',none:'var(--ink-3)'};

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
export const OVERFLOW_BUNDLE_KEY='atlas:overflow-bundles';
interface BundlePlacement {
 x:number;y:number;radius:number;anchorX:number;anchorY:number;
 /** When space runs out, every suppressed count remains available in the summary. */
 hiddenKeys?:string[];
}
/** The gutter has finite area. Never fall back to overlapping badges: replace
 * overflow with one 44px, keyboard-accessible summary containing every count.
 */
export function layoutBundleLabels(arcs:readonly Arc[],rows:number,centers?:readonly number[],heightPx?:number):Map<string,BundlePlacement>{
 const longest=Math.max(1,...arcs.map(a=>Math.abs(a.to-a.from)));
 const height=heightPx??rows*ROW,x0=8;
 const items=arcs.filter(arc=>arc.count>1).map(arc=>{
  const y1=centers?.[arc.from]??arc.from*ROW+ROW/2,y2=centers?.[arc.to]??arc.to*ROW+ROW/2;
  const span=Math.abs(arc.to-arc.from);
  const reach=x0+10+(GUTTER-x0-22)*Math.sqrt(span/longest);
  return {arc,anchorX:reach*.75+x0*.25,anchorY:(y1+y2)/2,
   radius:Math.max(11.5,6+String(arc.count).length*4)};
 }).sort((a,b)=>b.radius-a.radius||a.anchorY-b.anchorY||a.arc.key.localeCompare(b.arc.key));
 const placed:BundlePlacement[]=[],result=new Map<string,BundlePlacement>();
 const findSlot=(radius:number,anchorX:number,anchorY:number):BundlePlacement|null=>{
  const inset=radius>=22?0:2; // A 44px summary must fit even a one-row outline.
  const minX=radius+inset,maxX=GUTTER-radius-inset;
  const minY=radius+inset,maxY=height-radius-inset;
  if(maxX<minX||maxY<minY)return null;
  const clampX=(x:number)=>Math.max(minX,Math.min(maxX,x));
  const xs=[anchorX,minX,maxX,GUTTER/2,(minX+GUTTER/2)/2,(maxX+GUTTER/2)/2]
   .map(clampX).filter((x,i,array)=>array.findIndex(other=>Math.abs(x-other)<.1)===i);
  // Bound candidate work for a 2,500-row virtual outline; beyond this density
  // the +N summary is preferable to scanning the entire document height.
  const maxSteps=Math.min(Math.ceil(height/4)+2,items.length*20+20);
  for(let step=0;step<=maxSteps;step++){
   const offset=step===0?0:Math.ceil(step/2)*4*(step%2?1:-1);
   const y=anchorY+offset;
   if(y<minY||y>maxY)continue;
   for(const x of xs){
    if(placed.every(other=>Math.hypot(x-other.x,y-other.y)>=radius+other.radius+8))
     return {x,y,radius,anchorX,anchorY};
   }
  }
  return null;
 };
 const hiddenKeys:string[]=[];
 for(const item of items){
  const label=findSlot(item.radius,item.anchorX,item.anchorY);
  if(label){placed.push(label);result.set(item.arc.key,label)}
  else hiddenKeys.push(item.arc.key);
 }
 if(hiddenKeys.length){
  // Reserve a 44px tap target. Remove individual badges if necessary until
  // the summary itself has the same eight-pixel clearance as every other mark.
  let summary=findSlot(22,GUTTER/2,height/2);
  while(!summary&&placed.length){
   const removed=placed.pop()!;
   const key=[...result].find(([,value])=>value===removed)?.[0];
   if(key){result.delete(key);hiddenKeys.push(key)}
   summary=findSlot(22,GUTTER/2,height/2);
  }
  if(summary){
   summary.hiddenKeys=hiddenKeys.sort();
   result.set(OVERFLOW_BUNDLE_KEY,summary);
  }
 }
 return result;
}

/** Links drawn as nested arcs in a right-hand gutter, like a proof's dependency marks in a margin. */
export function Wires({arcs,rows,focus,centers,heightPx}:{arcs:Arc[];rows:number;focus:Focus|null;centers?:readonly number[];heightPx?:number}){
 // Deterministic demo-only browser fixture for the finite 84px gutter. It is
 // never enabled in live mode; CI exercises the real rendered keyboard control.
 if(typeof window!=='undefined'){
  const query=new URLSearchParams(window.location.search);
  if(query.get('demo')==='stress'&&query.get('atlasDenseFixture')==='1'&&window.location.hash.startsWith('#/atlas')){
   const dense:Arc[]=[];
   // Twenty same-source bundles legitimately share one trunk. This
   // isolates the finite badge-placement budget from the separate eight
   // unrelated-lane collision fixture below.
   for(let i=0;i<20;i++){
    const kind=i%2?'related' as const:'prereq' as const;
    dense.push({key:kind+':'+i,from:0,to:1+i%4,kind,count:2,links:[]});
   }
   arcs=dense;rows=5;focus=null;centers=undefined;heightPx=undefined;
  }else if(query.get('demo')==='stress'&&query.get('atlasDenseLanes')==='1'&&window.location.hash.startsWith('#/atlas')){
   // Eight unrelated overlapping spans cannot fit seven 9px lanes. Keep the
   // fixture independent of the backend and prove the overflow is disclosed.
   arcs=Array.from({length:8},(_,i)=>({key:'dense-lane:'+i,from:i,to:i+8,kind:'prereq' as const,count:1,links:[]}));
   rows=16;focus=null;centers=undefined;heightPx=undefined;
  }
 }
 const ordered=focus?[...arcs].sort((a,b)=>Number(arcTone(a,focus)!=='none')-Number(arcTone(b,focus)!=='none')):arcs;
 const lanes=layoutAtlasLanes(arcs,centers);
 const hiddenLanes=ordered.filter(arc=>!lanes.has(arc.key));
 const hiddenLinkCount=hiddenLanes.reduce((total,arc)=>total+arc.count,0);
 // Even when a physical lane cannot be allocated, the two affected rows
 // retain noninteractive in/out ports. The details disclosure lists the link.
 const hiddenPorts=new Map<string,{row:number;direction:'in'|'out';y:number}>();
 for(const arc of hiddenLanes){
  for(const [row,direction] of [[arc.from,'out'],[arc.to,'in']] as const){
   const key=row+':'+direction;
   if(!hiddenPorts.has(key))hiddenPorts.set(key,{row,direction,y:(centers?.[row]??row*ROW+ROW/2)+(direction==='in'?5:-5)});
  }
 }
 const badges=layoutBundleLabels(arcs.filter(arc=>lanes.has(arc.key)),rows,centers,heightPx);
 const overflow=badges.get(OVERFLOW_BUNDLE_KEY);
 return <><svg aria-hidden="true" data-atlas-wires="true" width={GUTTER} height={heightPx??rows*ROW}
  className="pointer-events-none absolute right-0 top-0 overflow-visible">
  <defs>{(['none','up','down'] as Tone[]).map(t=><marker key={t} id={'atlas-arrow-'+t} viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="6" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse">
   <path d="M0 0L6 3L0 6Z" fill={toneColor[t]}/></marker>)}</defs>
  {[...hiddenPorts.values()].map(port=><path key={'port:'+port.row+':'+port.direction}
   data-atlas-hidden-port={port.direction} data-atlas-row={port.row}
   d={'M2 '+port.y+' H8'} fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round"/>)}
  {ordered.map(arc=>{
   const lane=lanes.get(arc.key);
   if(!lane)return null;
   const tone=arcTone(arc,focus),lit=tone!=='none';
   const opacity=focus?(lit?1:.12):.35;
   const width=(lit?2:1.3)+Math.min(1.1,Math.log2(arc.count)*.4);
   return <g key={arc.key} data-arc-kind={arc.kind} data-arc-tone={tone} data-atlas-lane={lane.x}
    style={{transition:'opacity 160ms ease'}} opacity={opacity}>
    <path d={lane.d} fill="none" stroke={toneColor[tone]} strokeWidth={width}
     strokeDasharray={arc.kind==='related'?'2 4':undefined} strokeLinecap="round"
     markerEnd={arc.kind==='prereq'?'url(#atlas-arrow-'+(tone==='related'||tone==='self'?'none':tone)+')':undefined}/>
    {arc.kind==='prereq'&&<circle data-atlas-supplier-dot="true" cx="8" cy={lane.fromY} r="1.2" fill={toneColor[tone]}/>}
   </g>;
  })}
  {ordered.filter(arc=>arc.count>1&&lanes.has(arc.key)).map(arc=>{
   const badge=badges.get(arc.key);
   if(!badge)return null;
   const tone=arcTone(arc,focus),lit=tone!=='none';
   const opacity=focus?(lit?1:.12):arc.kind==='related'?.45:.62;
   return <g key={'badge:'+arc.key} opacity={opacity} data-atlas-bundle={arc.key}>
    {Math.hypot(badge.x-badge.anchorX,badge.y-badge.anchorY)>3&&
     <path d={'M'+badge.anchorX+' '+badge.anchorY+' L'+badge.x+' '+badge.y}
      stroke={toneColor[tone]} strokeWidth="1" strokeDasharray="2 2" fill="none"/>}
    <g transform={'translate('+badge.x+' '+badge.y+')'}>
     <rect data-atlas-bundle-pill="true" data-atlas-bundle-circle="true"
      x={-Math.max(16,String(arc.count).length*7+8)/2+0.5} y="-7.5"
      width={Math.max(16,String(arc.count).length*7+8)-1} height="15" rx="7.5"
      fill="var(--paper)" stroke={toneColor[tone]} strokeWidth="1"/>
     <text data-atlas-bundle-count="true" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="600" fill={toneColor[tone]}>{arc.count}</text>
    </g>
   </g>;
  })}
 </svg>
  {hiddenLanes.length>0&&<details data-atlas-lane-overflow="true" className="absolute right-0 top-0 z-20">
   <summary aria-label={`Show ${hiddenLinkCount} hidden Atlas links`}
    className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-ctl border border-edge-2 bg-[var(--paper)] px-1 text-[12px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
    +{hiddenLinkCount}
   </summary>
   <div className="absolute right-0 top-11 max-h-60 w-[min(280px,calc(100vw-24px))] overflow-y-auto rounded-ctl border border-edge-2 bg-[var(--paper)] p-3 shadow-[var(--e-float)]">
    <p className="mb-2 text-[12px] font-semibold">Connections hidden by the 9px lane spacing</p>
    <ul className="space-y-1 text-[12px]">
     {hiddenLanes.map(arc=><li key={arc.key}>Rows {arc.from+1}–{arc.to+1}: {arc.count} link{arc.count===1?'':'s'}</li>)}
    </ul>
   </div>
  </details>}
  {overflow&&<details data-atlas-hidden-bundles="true" className="absolute z-20"
   style={{right:GUTTER-overflow.x-22,top:overflow.y-22}}>
   <summary data-atlas-overflow-count="true" aria-label={`Show ${overflow.hiddenKeys?.length??0} hidden Atlas link bundles`}
    style={{outlineOffset:-3}}
    className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-edge-2 bg-raised text-body font-semibold text-ink [&::-webkit-details-marker]:hidden">
    +{overflow.hiddenKeys?.length??0}
   </summary>
   <div className="absolute right-0 top-11 max-h-60 w-[min(280px,calc(100vw-24px))] overflow-y-auto rounded-ctl border border-edge-2 bg-raised p-3 shadow-[var(--e-float)]">
    <p className="mb-2 text-body font-semibold">Other bundled connections</p>
    <ul className="space-y-1 text-body text-ink-2">
     {(overflow.hiddenKeys??[]).map(key=>{
      const arc=arcs.find(item=>item.key===key);
      return arc?<li key={key}>{arc.kind==='prereq'?'Prerequisite':'Related'} rows {arc.from+1}–{arc.to+1}: {arc.count} links</li>:null;
     })}
    </ul>
   </div>
  </details>}
 </>;
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

