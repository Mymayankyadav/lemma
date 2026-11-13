import type {CardState,Rating,Settings} from '../../../data/types';
import {DEFAULT_W,preview,retrievability,scheduleConfig} from '../../../lib/fsrs';

/** PLAN §6.11 Memory chart. The recall line is a replay of the card's own reviews through the owner's scheduler: after each
 *  review recall is 100%, then it decays with that review's stability. Pure, so the shape is testable from data. */
export const gradeWord:Readonly<Record<Rating,string>>={1:'Again',2:'Hard',3:'Good',4:'Easy'};
export const gradeKey:Readonly<Record<Rating,string>>={1:'again',2:'hard',3:'good',4:'easy'};
export interface RecallPoint{at:number;recall:number}
export interface ReviewDot{at:number;recall:number;rating:Rating;intervalDays:number}
export interface RecallSeries{line:RecallPoint[];dots:ReviewDot[];start:number;end:number}
const DAY=86_400_000;
const newCard=(at:number):CardState=>({state:0,due:new Date(at).toISOString(),stability:0,difficulty:0,lastReview:null,step:0,reps:0,lapses:0});

export function recallSeries(history:readonly {reviewedAt:string;rating:Rating}[],settings:Settings|undefined,now:number,samplesPerGap=12):RecallSeries|null{
 const reviews=[...history].map(item=>({at:Date.parse(item.reviewedAt),rating:item.rating})).filter(item=>Number.isFinite(item.at)).sort((a,b)=>a.at-b.at);
 if(!reviews.length)return null;
 let config:ReturnType<typeof scheduleConfig>|null=null;
 try{config=settings?scheduleConfig(settings):null;}catch{config=null;}
 const w=config?.w??[...DEFAULT_W];
 let card=newCard(reviews[0].at);
 const line:RecallPoint[]=[],dots:ReviewDot[]=[];
 const decay=(from:number,to:number,stability:number)=>{
  if(stability<=0||to<=from)return;
  for(let index=1;index<=samplesPerGap;index++){
   const at=from+(to-from)*index/samplesPerGap;
   line.push({at,recall:retrievability(w,(at-from)/DAY,stability)});
  }
 };
 for(const [index,review] of reviews.entries()){
  const before=index===0?1:card.stability>0&&card.lastReview?retrievability(w,(review.at-Date.parse(card.lastReview))/DAY,card.stability):1;
  if(index>0&&card.lastReview)decay(Date.parse(card.lastReview),review.at,card.stability);
  let interval=0;
  if(config){
   const choice=preview(card,review.at,config)[review.rating];
   card={...choice.card,lastReview:new Date(review.at).toISOString()};
   // The wait until the next review, in days (a learning step can be minutes).
   interval=Math.max(0,choice.delay)/DAY;
  }else{
   // Without settings there is no scheduler to replay; keep the dots and draw no line.
   card={...card,lastReview:new Date(review.at).toISOString(),stability:0};
  }
  dots.push({at:review.at,recall:Math.max(0,Math.min(1,before)),rating:review.rating,intervalDays:interval});
  if(card.stability>0)line.push({at:review.at,recall:1});
 }
 const last=reviews[reviews.length-1].at,end=Math.max(now,last);
 if(card.lastReview)decay(last,end,card.stability);
 return {line,dots,start:reviews[0].at,end};
}
/** Recall now, from the card's stored state (the same number the scheduler uses). */
export function recallNow(state:CardState|undefined,settings:Settings|undefined,now:number):number|null{
 if(!state?.lastReview||state.stability<=0)return null;
 return retrievability(settings?.fsrsWeights??DEFAULT_W,Math.max(0,(now-Date.parse(state.lastReview))/DAY),state.stability);
}

/** One tap target on the recall chart: reviews `first`…`last` (indices into the dots) and its box in CSS pixels. */
export interface TapGroup{first:number;last:number;left:number;right:number;top:number;bottom:number}
/**
 * N153 · V36: the recall chart's tap targets. Reviews are often closer together than a fingertip, so the time axis is cut
 * into side-by-side targets, each at least one touch target wide and tall, that never overlap: a cut falls midway
 * between two reviews, as early as it can while the target before it and the one after it each stay a full touch wide.
 * Each target spans its reviews' heights plus half a touch above and below. `points` are the dots' centres in CSS
 * pixels, in time order.
 */
export function tapGroups(points:readonly {x:number;y:number}[],touch:number):TapGroup[]{
 const groups:TapGroup[]=[];
 if(!points.length)return groups;
 const end=points[points.length-1].x+touch/2;
 const close=(first:number,last:number,left:number,right:number)=>{
  const ys=points.slice(first,last+1).map(point=>point.y);
  groups.push({first,last,left,right,top:Math.min(...ys)-touch/2,bottom:Math.max(...ys)+touch/2});
 };
 let first=0,left=points[0].x-touch/2;
 for(let index=0;index<points.length-1;index++){
  const here=points[index].x,next=points[index+1].x,cut=(here+next)/2;
  if(next-here>=1&&cut-left>=touch&&end-cut>=touch){close(first,index,left,cut);first=index+1;left=cut;}
 }
 close(first,points.length-1,left,end);
 return groups;
}
