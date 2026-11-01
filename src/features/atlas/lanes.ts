import type {Arc} from './tree';

export interface AtlasLane{
 x:number;
 fromY:number;
 toY:number;
 d:string;
}
const X0=8;
// The outermost center at x=83 leaves 0.5px for a 1px stroke inside
// the 84px gutter; eight independent 9px-spaced tracks fit without overlap.
const LANES=[83,74,65,56,47,38,29,20] as const;
const ROW=44;

/** A notebook-margin wire: two horizontal strokes and a vertical lane, with
 * 5px rounded elbows. No cubic bows or screen-space camera.
 */
export function atlasLanePath(x:number,fromY:number,toY:number):string{
 const sign=toY>=fromY?1:-1;
 const r=Math.min(5,Math.abs(toY-fromY)/2);
 if(r===0)return `M ${X0} ${fromY} H ${x}`;
 return `M ${X0} ${fromY} H ${x-r} Q ${x} ${fromY} ${x} ${fromY+sign*r} V ${toY-sign*r} Q ${x} ${toY} ${x-r} ${toY} H ${X0}`;
}

/** Longest connections receive the outer lanes. Where several links share an
 * endpoint, reuse its lane as a trunk; otherwise prefer an unoccupied 9px
 * track over the same vertical interval. Bounded to eight tracks in 84px.
 */
export function layoutAtlasLanes(arcs:readonly Arc[],centers?:readonly number[],priorityKeys?:ReadonlySet<string>):Map<string,AtlasLane>{
 const physicalSpan=(arc:Arc)=>Math.abs((centers?.[arc.to]??arc.to*ROW+ROW/2)-(centers?.[arc.from]??arc.from*ROW+ROW/2));
 // Selected prerequisite chains take capacity before unrelated connections.
 // The finite 84px gutter still cannot show every possible overlapping link;
 // any omitted links remain disclosed rather than silently overpainted.
 const sorted=[...arcs].sort((a,b)=>Number(priorityKeys?.has(b.key)??false)-Number(priorityKeys?.has(a.key)??false)||physicalSpan(b)-physicalSpan(a)||a.key.localeCompare(b.key));
 type Placement={arc:Arc;x:number;low:number;high:number;order:number};
 const placed:Placement[]=[];
 // Every fit check only needs the placements on its candidate lane.
 // Endpoint indexes preserve the original earliest shared-trunk preference.
 const byLane=new Map<number,Placement[]>(),byFrom=new Map<number,Placement[]>(),
  byTo=new Map<number,Placement[]>();
 const result=new Map<string,AtlasLane>();
 for(const arc of sorted){
  const fromY=centers?.[arc.from]??arc.from*ROW+ROW/2;
  const toY=centers?.[arc.to]??arc.to*ROW+ROW/2;
  const low=Math.min(fromY,toY),high=Math.max(fromY,toY);
  // An overlapping, unrelated wire must NEVER reuse a lane: with nine
  // independent overlapping intervals and only eight 9px tracks, the ninth
  // becomes an explicit overflow disclosure instead of an unreadable rope.
  const sharesTrunk=(p:Placement)=>p.arc.from===arc.from||p.arc.to===arc.to;
  // All candidates for this arc see the same placed set. Cache each lane's
  // collision result once rather than rescanning a shared trunk repeatedly.
  const fitCache=new Map<number,boolean>();
  const fits=(lane:number):boolean=>{
   const cached=fitCache.get(lane);
   if(cached!==undefined)return cached;
   const clear=(byLane.get(lane)??[]).every(p=>
    high<p.low||low>p.high||sharesTrunk(p));
   fitCache.set(lane,clear);
   return clear;
  };
  // Merge two insertion-ordered endpoint lists. The first fitting candidate
  // is identical to placed.find(sharesTrunk && fits), without scanning every
  // unrelated prior arc or sorting the candidates.
  const from=byFrom.get(arc.from)??[],to=byTo.get(arc.to)??[];
  let fi=0,ti=0,shared:Placement|undefined;
  while(fi<from.length||ti<to.length){
   let candidate:Placement;
   if(ti>=to.length||(fi<from.length&&from[fi].order<=to[ti].order)){
    candidate=from[fi++];
    if(ti<to.length&&to[ti]===candidate)ti++;
   }else candidate=to[ti++];
   if(fits(candidate.x)){shared=candidate;break}
  }
  const x=shared?.x??LANES.find(fits);
  if(x===undefined)continue;
  const entry:Placement={arc,x,low,high,order:placed.length};
  placed.push(entry);
  for(const [map,key] of [[byLane,x],[byFrom,arc.from],[byTo,arc.to]] as const){
   const entries=map.get(key)??[];
   entries.push(entry);map.set(key,entries);
  }
  result.set(arc.key,{x,fromY,toY,d:atlasLanePath(x,fromY,toY)});
 }
 return result;
}
