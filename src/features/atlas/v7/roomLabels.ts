export type LabelBox={x:number;y:number;width:number;height:number};
/** Find a readable place near a star; a dense constellation may need a leader line. Coordinates are screen pixels. */
export function roomLabelSpot(preferred:readonly [number,number][],width:number,height:number,bounds:LabelBox,occupied:readonly LabelBox[]):[number,number]|null{
 const step=height+5,candidates:readonly [number,number][]=[...preferred,[bounds.x,preferred[0]?.[1]??bounds.y],[bounds.x+bounds.width-width,preferred[0]?.[1]??bounds.y]];
 for(let row=0;row<=Math.ceil(bounds.height/step);row++)for(const sign of row?[1,-1]:[1])for(const [px,py] of candidates){
  const x=Math.max(bounds.x,Math.min(bounds.x+bounds.width-width,px)),y=py+row*step*sign;
  if(width>bounds.width||y<bounds.y||y+height>bounds.y+bounds.height)continue;
  if(occupied.some(box=>x<box.x+box.width+2&&x+width+2>box.x&&y<box.y+box.height+2&&y+height+2>box.y))continue;
  return [x,y];
 }
 return null;
}
