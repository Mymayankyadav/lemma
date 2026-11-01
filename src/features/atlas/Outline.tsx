import {memo} from 'react';
import {ChevronRight} from 'lucide-react';
import {Tex} from '../../ui/Tex';
import {plainMath} from '../../lib/plain-math';
import type {Arc,AtlasNode,Focus,Tone} from './tree';
import {arcTone,isPlainAtlasLabel} from './tree';
import {atlasRowGap,atlasRowHeight} from './rowGeometry';
import {layoutAtlasLanes} from './lanes';
import './rowMath.css';

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
  {s==='demonstrated'&&<circle cx="7" cy="7" r="6" fill="var(--ink-2)"/>}
  {s==='in_progress'&&<><circle cx="7" cy="7" r="5.4" fill="none" stroke="var(--ink-2)" strokeWidth="1.6"/><path d="M7 1.6a5.4 5.4 0 0 1 0 10.8z" fill="var(--ink-2)"/></>}
  {s==='revisit'&&<circle cx="7" cy="7" r="5.4" fill="none" stroke="var(--late)" strokeWidth="1.8" strokeDasharray="2.4 1.8"/>}
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
/** Reserve a readable 12px digit run plus left/right padding inside the 16px pill. */
function bundlePillWidth(count:number):number{return Math.max(22,12+String(count).length*8)}

export function layoutBundleLabels(arcs:readonly Arc[],rows:number,centers?:readonly number[],heightPx?:number):Map<string,BundlePlacement>{
 const physicalSpan=(arc:Arc)=>Math.abs((centers?.[arc.to]??arc.to*ROW+ROW/2)-(centers?.[arc.from]??arc.from*ROW+ROW/2));
 const longest=Math.max(1,...arcs.map(physicalSpan));
 const height=heightPx??rows*ROW,x0=8;
 const items=arcs.filter(arc=>arc.count>1).map(arc=>{
  const y1=centers?.[arc.from]??arc.from*ROW+ROW/2,y2=centers?.[arc.to]??arc.to*ROW+ROW/2;
  const span=physicalSpan(arc);
  const reach=x0+10+(GUTTER-x0-22)*Math.sqrt(span/longest);
  return {arc,anchorX:reach*.75+x0*.25,anchorY:(y1+y2)/2,
   // The collision circle must contain every corner of the painted rectangle.
    // The 1px stroke expands its width by 1px; the painted height is 16px.
    radius:Math.hypot((bundlePillWidth(arc.count)+1)/2,8)};
 }).sort((a,b)=>b.radius-a.radius||a.anchorY-b.anchorY||a.arc.key.localeCompare(b.arc.key));
 const placed:BundlePlacement[]=[],result=new Map<string,BundlePlacement>();
 // A badge tests only nearby painted rectangles. Scanning every previous
 // placement for each 4px candidate becomes quadratic in dense 60-arc gutters
 // under 4x CPU. Vertical buckets preserve the original exact circle test
 // and candidate ordering, including the overflow-summary backtracking.
 const placedByY=new Map<number,BundlePlacement[]>(),bucketHeight=64;
 let widestPlacedRadius=0;
 const register=(badge:BundlePlacement)=>{
  placed.push(badge);
  const bucket=Math.floor(badge.y/bucketHeight);
  const group=placedByY.get(bucket)??[];
  group.push(badge);placedByY.set(bucket,group);
  widestPlacedRadius=Math.max(widestPlacedRadius,badge.radius);
 };
 const unregisterLast=():BundlePlacement=>{
  const badge=placed.pop()!,bucket=Math.floor(badge.y/bucketHeight);
  const group=placedByY.get(bucket);
  if(group){
   const index=group.indexOf(badge);
   if(index>=0)group.splice(index,1);
   if(!group.length)placedByY.delete(bucket);
  }
  // A conservative maximum after removal costs only extra bucket lookups.
  return badge;
 };
 const clearOfPlaced=(x:number,y:number,radius:number):boolean=>{
  if(!placed.length)return true;
  const reach=radius+widestPlacedRadius+9;
  for(let bucket=Math.floor((y-reach)/bucketHeight);bucket<=Math.floor((y+reach)/bucketHeight);bucket++){
   for(const other of placedByY.get(bucket)??[]){
    const dx=x-other.x,dy=y-other.y,clearance=radius+other.radius+9;
    if(dx*dx+dy*dy<clearance*clearance)return false;
   }
  }
  return true;
 };
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
    // SVG circles have a 1px stroke (0.5px per edge), so reserve 9px
    // between geometric radii to guarantee >=8 CSS px between painted marks.
    if(clearOfPlaced(x,y,radius))
     return {x,y,radius,anchorX,anchorY};
   }
  }
  return null;
 };
 const hiddenKeys:string[]=[];
 for(const item of items){
  const label=findSlot(item.radius,item.anchorX,item.anchorY);
  if(label){register(label);result.set(item.arc.key,label)}
  else hiddenKeys.push(item.arc.key);
 }
 if(hiddenKeys.length){
  // Reserve a 44px tap target. Remove individual badges if necessary until
  // the summary itself has the same eight-pixel clearance as every other mark.
  let summary=findSlot(22,GUTTER/2,height/2);
  while(!summary&&placed.length){
   const removed=unregisterLast();
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
  }else if(['stress','extreme'].includes(query.get('demo')??'')&&query.get('atlasDenseLanes')==='1'&&window.location.hash.startsWith('#/atlas')){
   // Nine unrelated overlapping spans cannot fit eight 9px lanes. Keep the
   // fixture independent of the backend and prove the overflow is disclosed.
   arcs=Array.from({length:9},(_,i)=>({key:'dense-lane:'+i,from:i,to:i+9,kind:'prereq' as const,count:1,links:[]}));
   rows=18;focus=null;centers=undefined;heightPx=undefined;
   if(query.get('atlasDenseLanesFocus')==='1'){
    // The shortest ninth arc belongs to the selected prerequisite chain;
    // it must win a physical lane before unrelated long connections.
    arcs[8].links=[{fromId:'supplier',toId:'selected',kind:'prereq'}];
    focus={start:new Set(['selected']),up:new Set(['supplier']),down:new Set(),related:new Set()};
   }
  }
 }
 const ordered=focus?[...arcs].sort((a,b)=>Number(arcTone(a,focus)!=='none')-Number(arcTone(b,focus)!=='none')):arcs;
 const priorityKeys=focus?new Set(arcs.filter(arc=>arcTone(arc,focus)!=='none').map(arc=>arc.key)):undefined;
 const lanes=layoutAtlasLanes(arcs,centers,priorityKeys);
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
   // 9px center spacing with 1px strokes leaves exactly 8px of painted-edge
   // clearance. Emphasis uses tone/opacity, never wider overlapping strokes.
   const width=1;
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
   // The painted pill is exactly 16px high, including its inset 1px border.
   // Width grows with digits; collision radii conservatively include a
   // further 1px margin, preserving >=8px edge clearance.
   // The placement circle encloses the painted pill's corners, not merely
   // its horizontal half-width. Diagonal pills must retain 8px edge clearance.
   const pillWidth=bundlePillWidth(arc.count);
   return <g key={'badge:'+arc.key} opacity={opacity} data-atlas-bundle={arc.key}>
    {Math.hypot(badge.x-badge.anchorX,badge.y-badge.anchorY)>3&&
     <path d={'M'+badge.anchorX+' '+badge.anchorY+' L'+badge.x+' '+badge.y}
      stroke={toneColor[tone]} strokeWidth="1" strokeDasharray="2 2" fill="none"/>}
    <g transform={'translate('+badge.x+' '+badge.y+')'}>
     <g data-atlas-bundle-pill="true" data-atlas-bundle-circle="true">
      {/* A one-pixel inset fill creates a real 16px painted outline. SVG
          stroke extends outside the box and Playwright includes it in
          boundingBox(), even when CSS clipping hides those pixels. */}
      <rect x={-pillWidth/2} y="-8" width={pillWidth} height="16" rx="8" fill={toneColor[tone]}/>
      <rect x={1-pillWidth/2} y="-7" width={pillWidth-2} height="14" rx="7" fill="var(--paper)"/>
     </g>
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

// Scrolling and the ResizeObserver update the Atlas row window without
// changing arcs, geometry or focus. Avoid rerunning the expensive finite
// lane/badge placement for those unrelated state changes.
export const MemoWires=memo(Wires);
MemoWires.displayName='AtlasWires';

/** Distinct hierarchy without shortening any interactive target. The full
 * mathematical name stays in the button's accessible label and details sheet.
 */
export function Row({node,open,tone,match,focused=false,sticky=true,onToggle,onSelect}:{
 node:AtlasNode;open:boolean;tone:Tone;match:boolean;focused?:boolean;sticky?:boolean;onToggle:()=>void;onSelect:()=>void;
}){
 const parent=node.children.length>0,root=node.level==='cluster',area=node.level==='galaxy';
 const selected=tone==='self',height=atlasRowHeight(node.level);
 const indentation=(depth:number)=>Math.min(depth,3)*INDENT+Math.max(0,depth-3)*8;
 const lead=12+indentation(node.depth);
 const textStyle=node.level==='cluster'?'font-serif italic text-[21px] leading-[24px] font-medium':
  area?'text-[12px] leading-[18px] font-semibold tracking-[0.05em] [font-variant:small-caps]':
  node.level==='system'?'text-[15px] leading-5 font-semibold':
  node.level==='moon'?'text-[13px] leading-[18px] text-ink-2':'text-[15px] leading-[22px]';
 const showProgress=root||area;
 return <div role="treeitem" aria-level={node.depth+1} aria-expanded={parent?open:undefined} aria-selected={selected}
  data-atlas-row={node.id} data-level={node.level} data-tone={tone}
  className={'group relative flex items-center bg-[var(--paper)] '+(root&&sticky?'sticky top-0 z-10 ':'')+(match?'bg-fill-1':'')}
  style={{height,marginTop:atlasRowGap(node.level),paddingLeft:lead,paddingRight:GUTTER+4,
   // Inset rule keeps the 44px button's painted hitbox intact (border-box lost 1px).
   boxShadow:root||area?'inset 0 1px var(--hair)':undefined,
   backgroundColor:selected?'color-mix(in srgb, var(--accent) 12%, var(--paper))':undefined,
   opacity:focused&&tone==='none'?0.42:1}}>
  {Array.from({length:node.depth},(_,d)=><span key={d} aria-hidden="true" className="absolute inset-y-0 w-px"
   style={{left:12+indentation(d)+6,background:'color-mix(in srgb,var(--ink) 6%,transparent)'}}/>)}
  {tone!=='none'&&<span aria-hidden="true" className="absolute inset-y-1 left-1 w-[3px] rounded-r" style={{background:toneColor[tone]}}/>}
  {parent?<button type="button" aria-label={(open?'Fold ':'Unfold ')+plainMath(node.name)} onClick={onToggle}
   className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-ctl text-ink-2">
   <ChevronRight size={16} style={{transform:open?'rotate(90deg)':'none',transition:'transform 140ms ease'}}/>
  </button>:<span className="flex size-7 shrink-0 items-center justify-center"><StatusMark node={node}/></span>}
  <button type="button" onClick={onSelect} aria-label={plainMath(node.name)+(parent?', '+node.done+' of '+node.total+' ideas':', '+statusName[node.status])}
   className="flex h-full min-w-0 flex-1 items-center gap-2 text-left">
   {root&&node.glyph&&<span aria-hidden="true" className="shrink-0 font-math text-[22px] text-[var(--accent)]">{node.glyph}</span>}
   <span title={plainMath(node.name)} data-atlas-title-scroll
    style={{...clip,overflowX:'auto',textOverflow:'clip',scrollbarWidth:'none'}}
    className={'atlas-row-title-scroll min-w-0 flex-1 [&_*]:whitespace-nowrap '+textStyle}>{isPlainAtlasLabel(node.name)?node.name:<Tex source={node.name}/>}</span>
   {showProgress&&<span className="flex shrink-0 items-center gap-1.5 pl-1 text-[12px] tabular-nums text-ink-3">
    <span aria-hidden="true" className="h-1.5 w-11 overflow-hidden rounded-full bg-[var(--paper-2)]">
     <span className="block h-full rounded-full bg-[var(--ink-2)]" style={{width:(node.total?100*node.done/node.total:0)+'%'}}/>
    </span>
    <span>{node.done}/{node.total}</span>
   </span>}
   {!showProgress&&parent&&<span className="ml-auto shrink-0 text-[12px] tabular-nums text-ink-3">{node.total}</span>}
   {node.revisit>0&&parent&&<span aria-label={node.revisit+' to re-check'} className="size-3 shrink-0 rounded-full bg-[var(--late)]"/>}
  </button>
 </div>;
}
