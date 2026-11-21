import {inkPathLength,normalizeInkGeometry,pointDistance,resampleInkPath} from './inkGeometry';
import type {InkCompletion,InkCompletionDecision,InkGeometryRecognized,InkPoint,InkSnapshot,InkStroke} from './types';

export const PARTIAL_TEMPLATE_VERSION='lemma-relations-v1';

type XY=readonly [number,number];
type Paths=readonly (readonly XY[])[];
type Glyph={id:string;paths:Paths;extends?:readonly string[]};

const leftAngle:readonly XY[]=[[83,18],[17,48],[83,78]];
const mirror=(path:readonly XY[]):XY[]=>path.map(([x,y])=>[100-x,y]);
const rightAngle=mirror(leftAngle);
const lowerBar:readonly XY[]=[[17,92],[83,92]];
const upper:readonly XY[]=[[18,34],[82,34]];
const lower:readonly XY[]=[[18,67],[82,67]];
const slash:readonly XY[]=[[72,12],[31,89]];
const outer:readonly XY[]=[[83,18],[47,18],[26,25],[17,43],[20,61],[35,73],[55,77],[83,77]];
const curved:readonly XY[]=[[77,15],[50,12],[30,22],[20,39],[20,58],[34,74],[53,81],[79,80]];
const elementBar:readonly XY[]=[[19,48],[72,47]];
const curvedBar:readonly XY[]=[[20,47],[68,47]];

const glyphs:readonly Glyph[]=[
  {id:'less-than',paths:[leftAngle]},
  {id:'less-than-or-equal',paths:[leftAngle,lowerBar],extends:['less-than']},
  {id:'less-than-or-equal',paths:[[...leftAngle,[83,92],[17,92]]],extends:['less-than']},
  {id:'greater-than',paths:[rightAngle]},
  {id:'greater-than-or-equal',paths:[rightAngle,lowerBar],extends:['greater-than']},
  {id:'greater-than-or-equal',paths:[[...rightAngle,[17,92],[83,92]]],extends:['greater-than']},
  {id:'equal',paths:[upper,lower]},
  {id:'not-equal',paths:[upper,lower,slash],extends:['equal']},
  {id:'not-equal',paths:[[[79,32],[21,38]],[[16,70],[85,61]],[[67,10],[31,90]]],extends:['equal']},
  {id:'element-of',paths:[outer,elementBar]},
  {id:'element-of',paths:[curved,curvedBar]},
  {id:'not-element-of',paths:[outer,elementBar,slash],extends:['element-of']},
  {id:'not-element-of',paths:[curved,curvedBar,slash],extends:['element-of']},
  {id:'subset',paths:[outer]},
  {id:'subset',paths:[curved]},
  {id:'superset',paths:[mirror(outer)]},
  {id:'superset',paths:[mirror(curved)]},
  {id:'subset-or-equal',paths:[outer,lowerBar],extends:['subset']},
  {id:'subset-or-equal',paths:[curved,lowerBar],extends:['subset']},
  {id:'superset-or-equal',paths:[mirror(outer),lowerBar],extends:['superset']},
  {id:'superset-or-equal',paths:[mirror(curved),lowerBar],extends:['superset']},
  {id:'not-subset-or-equal',paths:[outer,lowerBar,slash],extends:['subset','subset-or-equal']},
  {id:'not-superset-or-equal',paths:[mirror(outer),lowerBar,slash],extends:['superset','superset-or-equal']},
];

function toStroke(path:readonly XY[]):InkStroke {
  return {pointerType:'unknown',points:path.map(([x,y],t)=>({x,y,t}))};
}

type Shape={points:readonly InkPoint[];length:number;aspect:number};

function shapeOf(strokes:readonly InkStroke[]):Shape|undefined {
  const geometry=normalizeInkGeometry(strokes);
  if(!geometry)return;
  const paths=geometry.strokes.map(stroke=>stroke.points).filter(path=>path.length);
  const length=paths.reduce((total,path)=>total+inkPathLength(path),0);
  if(length===0)return;
  const {width,height}=geometry.bounds;
  return {
    points:paths.flatMap(path=>resampleInkPath(path,Math.max(4,Math.min(18,Math.ceil(18*inkPathLength(path)))))),
    length,
    aspect:(width-height)/Math.max(width,height),
  };
}

type Template=Readonly<{id:string;shape:Shape;partial:boolean}>;
const templates:Template[]=[];

function collect(id:string,strokes:readonly InkStroke[],partial:boolean) {
  const shape=shapeOf(strokes);
  if(shape)templates.push({id,shape,partial});
}
for(const glyph of glyphs){
  const strokes=glyph.paths.map(toStroke);
  collect(glyph.id,strokes,false);
  if(!glyph.extends)continue;
  const whole=(1<<strokes.length)-1;
  for(let mask=1;mask<whole;mask++){
    collect(glyph.id,strokes.filter((_,index)=>Boolean(mask&(1<<index))),true);
  }
  for(const [index,stroke] of strokes.entries()){
    const sampled=resampleInkPath(stroke.points,9);
    const other=strokes.filter((_,at)=>at!==index);
    for(const limit of [3,5,7]){
      for(const points of [sampled.slice(0,limit),sampled.slice(-limit)]){
        for(let mask=0;mask<(1<<other.length);mask++){
          collect(glyph.id,[...other.filter((_,at)=>Boolean(mask&(1<<at))),{...stroke,points}],true);
        }
      }
    }
  }
}

function averageDistance(source:readonly InkPoint[],target:readonly InkPoint[]) {
  let sum=0;
  for(const point of source){
    let closest=Infinity;
    for(const candidate of target){
      const x=point.x-candidate.x,y=point.y-candidate.y;
      closest=Math.min(closest,x*x+y*y);
    }
    sum+=Math.sqrt(closest);
  }
  return sum/source.length;
}

function similarity(a:Shape,b:Shape) {
  if(Math.abs(a.aspect-b.aspect)>.30||a.length/b.length<.68||a.length/b.length>1.44)return 0;
  const samplingDistance=Math.max(averageDistance(a.points,b.points),averageDistance(b.points,a.points));
  const lengthPenalty=Math.abs(Math.log(a.length/b.length))*.1;
  return Math.max(0,1-3*(samplingDistance+lengthPenalty));
}

export type PartialMatch=Readonly<{
  completionDecision:InkCompletionDecision;
  possibleCompletions:readonly InkCompletion[];
  finishedSymbols:readonly string[];
  exactMatches?:readonly InkGeometryRecognized[];
}>;

const unknown:PartialMatch={completionDecision:'unknown',possibleCompletions:[],finishedSymbols:[]};
// These useful complete glyphs are absent from the packaged classifier.
const geometryOnly=new Set(['less-than','greater-than','equal','not-equal']);

/** Compare complete letterforms and geometric portions independently of model rank or proof context. */
export function matchPartialSymbols(snapshot:InkSnapshot):PartialMatch {
  if(snapshot.overBudget||snapshot.strokes.length===0)return unknown;
  const original=normalizeInkGeometry(snapshot.strokes)?.bounds;
  const minimum=Math.max(10,Math.min(snapshot.viewport.width,snapshot.viewport.height)*.055);
  if(!original||Math.max(original.width,original.height)<minimum)return unknown;
  const observed=shapeOf(snapshot.strokes);
  if(!observed)return unknown;
  const full=new Map<string,number>(),partial=new Map<string,number>();
  for(const template of templates){
    const score=similarity(observed,template.shape);
    const group=template.partial?partial:full;
    group.set(template.id,Math.max(score,group.get(template.id)??0));
  }
  const ranked=[...full].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const [symbolId,geometryScore]=ranked[0];
  // These four complete shapes can offer an explicit choice at a lower score than the finished-shape check below.
  const exactMatches=geometryOnly.has(symbolId)&&geometryScore>=.86&&geometryScore-(ranked[1]?.[1]??0)>=.07
    ? [{source:'geometry' as const,symbolId,geometryScore}]:undefined;
  const explicit=exactMatches?{exactMatches}:{};
  const possibleCompletions=[...partial]
    .filter(([id,score])=>score>=.82&&score>(full.get(id)??0)+.07)
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
    .map(([symbolId,extensionScore])=>({symbolId,extensionScore,requiresExplicitSelection:true as const}));
  if(possibleCompletions.length)return {completionDecision:'extendable',possibleCompletions,finishedSymbols:[],...explicit};
  const finishedSymbols=ranked.filter(([,score])=>score>=.87).map(([id])=>id);
  return finishedSymbols.length===1?{completionDecision:'finished',possibleCompletions:[],finishedSymbols,...explicit}
    : exactMatches?{...unknown,...explicit}:unknown;
}
