import type {Arc} from './tree';

export interface AtlasLane{
 x:number;
 fromY:number;
 toY:number;
 d:string;
}
const X0=8;
const LANES=[74,65,56,47,38,29,20] as const;
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
 * track over the same vertical interval. Bounded to seven tracks in 84px.
 */
export function layoutAtlasLanes(arcs:readonly Arc[],centers?:readonly number[]):Map<string,AtlasLane>{
 const physicalSpan=(arc:Arc)=>Math.abs((centers?.[arc.to]??arc.to*ROW+ROW/2)-(centers?.[arc.from]??arc.from*ROW+ROW/2));
 const sorted=[...arcs].sort((a,b)=>physicalSpan(b)-physicalSpan(a)||a.key.localeCompare(b.key));
 const placed:{arc:Arc;x:number;low:number;high:number}[]=[];
 const result=new Map<string,AtlasLane>();
 for(const arc of sorted){
  const fromY=centers?.[arc.from]??arc.from*ROW+ROW/2;
  const toY=centers?.[arc.to]??arc.to*ROW+ROW/2;
  const low=Math.min(fromY,toY),high=Math.max(fromY,toY);
  // An overlapping, unrelated wire must NEVER reuse a lane: with eight
  // independent overlapping intervals and only seven 9px tracks, the eighth
  // becomes an explicit overflow disclosure instead of an unreadable rope.
  const sharesTrunk=(p:typeof placed[number])=>p.arc.from===arc.from||p.arc.to===arc.to;
  const fits=(lane:number)=>placed.every(p=>p.x!==lane||high<p.low||low>p.high||sharesTrunk(p));
  const shared=placed.find(p=>sharesTrunk(p)&&fits(p.x));
  const x=shared?.x??LANES.find(fits);
  if(x===undefined)continue;
  placed.push({arc,x,low,high});
  result.set(arc.key,{x,fromY,toY,d:atlasLanePath(x,fromY,toY)});
 }
 return result;
}
