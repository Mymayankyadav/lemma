import type {ConceptLevel} from '../../data/types';

/** A field is a notebook heading, not a regular outline row. Keeping these
 * offsets explicit lets virtual rows and their dependency wires share a single
 * coordinate system, including after folding or filtering.
 */
export const atlasRowHeight=(level:ConceptLevel):number=>level==='cluster'?56:44;
/** Notebook breathing room is outside the interactive target, never part of
 * its 56/44px hit area. The virtual geometry includes the space explicitly. */
export const atlasRowGap=(level:ConceptLevel):number=>level==='cluster'||level==='galaxy'?8:0;

export interface AtlasRowGeometry{
 offsets:number[];
 centers:number[];
 totalHeight:number;
}
export function buildAtlasRowGeometry(levels:readonly ConceptLevel[]):AtlasRowGeometry{
 const offsets=[0],centers:number[]=[];
 for(const level of levels){
  const height=atlasRowHeight(level),gap=atlasRowGap(level);
  centers.push(offsets[offsets.length-1]+gap+height/2);
  offsets.push(offsets[offsets.length-1]+gap+height);
 }
 return {offsets,centers,totalHeight:offsets[offsets.length-1]};
}

/** Return the row containing a vertical position (clamped at both ends).
 * Binary search keeps scroll handling O(log n) for the 2,500-idea fixture.
 */
export function atlasRowAt(offsets:readonly number[],y:number):number{
 const count=Math.max(0,offsets.length-1);
 if(count===0)return 0;
 let lo=0,hi=count;
 const value=Number.isFinite(y)?y:0;
 while(lo<hi){
  const mid=(lo+hi+1)>>>1;
  if(offsets[mid]<=value)lo=mid;
  else hi=mid-1;
 }
 return Math.min(count-1,lo);
}
