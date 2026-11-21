import type {InkPoint,InkStroke} from './types';

export type InkBounds=Readonly<{left:number;top:number;width:number;height:number}>;
export const pointDistance=(a:Pick<InkPoint,'x'|'y'>,b:Pick<InkPoint,'x'|'y'>)=>Math.hypot(a.x-b.x,a.y-b.y);

export function inkBounds(strokes:readonly InkStroke[]):InkBounds|undefined {
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const stroke of strokes)for(const point of stroke.points){
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return;
    left=Math.min(left,point.x);
    right=Math.max(right,point.x);
    top=Math.min(top,point.y);
    bottom=Math.max(bottom,point.y);
  }
  if(left===Infinity)return;
  const width=right-left,height=bottom-top;
  if(Number.isFinite(width)&&Number.isFinite(height))return {left,top,width,height};
}

export function inkPathLength(points:readonly InkPoint[]) {
  let length=0;
  for(let i=1;i<points.length;i++)length+=pointDistance(points[i-1],points[i]);
  return length;
}

function interpolate(from:InkPoint,to:InkPoint,ratio:number):InkPoint {
  return {
    x:from.x+(to.x-from.x)*ratio,
    y:from.y+(to.y-from.y)*ratio,
    t:from.t+(to.t-from.t)*ratio,
    ...(from.pressure!==undefined&&to.pressure!==undefined
      ?{pressure:from.pressure+(to.pressure-from.pressure)*ratio}:{}),
  };
}

/** Equal arc-length samples preserve both ends, regardless of original event frequency. */
export function resampleInkPath(points:readonly InkPoint[],count:number):InkPoint[] {
  if(points.length<2||count<2)return points.slice(0,Math.max(0,count));
  const length=inkPathLength(points);
  const last=points.at(-1)!;
  if(!Number.isFinite(length)||length===0)return [points[0],last];
  const result=[points[0]];
  let segment=1,distanceBefore=0;
  for(let index=1;index<count-1;index++){
    const next=length*index/(count-1);
    let segmentLength=pointDistance(points[segment-1],points[segment]);
    while(segment<points.length-1&&(segmentLength===0||distanceBefore+segmentLength<next)){
      distanceBefore+=segmentLength;
      segment++;
      segmentLength=pointDistance(points[segment-1],points[segment]);
    }
    result.push(interpolate(points[segment-1],points[segment],segmentLength>0?(next-distanceBefore)/segmentLength:0));
  }
  result.push(last);
  return result;
}

export function normalizeInkGeometry(strokes:readonly InkStroke[]) {
  const bounds=inkBounds(strokes);
  if(!bounds)return;
  const scale=Math.max(bounds.width,bounds.height)||1;
  const centerX=bounds.left+bounds.width/2,centerY=bounds.top+bounds.height/2;
  return {
    bounds,
    strokes:strokes.map(stroke=>({...stroke,points:stroke.points.map(point=>({
      ...point,x:(point.x-centerX)/scale,y:(point.y-centerY)/scale,
    }))})),
  };
}
