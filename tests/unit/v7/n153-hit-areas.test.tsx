import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {tapGroups,type ReviewDot,type RecallSeries} from '../../../src/features/card/v7/recallModel';
import {RecallChart} from '../../../src/features/card/v7/RecallChart';

// N153 · V36 leftovers: the card's recall-chart review dots and the Inbox list's checkboxes take a tap within 44 px.
const TOUCH=44,EPS=1e-9; // sums of pixel positions carry floating-point noise
function check(points:{x:number;y:number}[],touch=TOUCH){
 const groups=tapGroups(points,touch);
 expect(groups[0].first).toBe(0);
 expect(groups.at(-1)!.last).toBe(points.length-1);
 groups.forEach((group,index)=>{
  expect(group.right-group.left).toBeGreaterThanOrEqual(touch-EPS);
  expect(group.bottom-group.top).toBeGreaterThanOrEqual(touch-EPS);
  if(index>0){expect(group.first).toBe(groups[index-1].last+1);expect(group.left).toBe(groups[index-1].right);}
  for(const point of points.slice(group.first,group.last+1)){
   expect(point.x).toBeGreaterThanOrEqual(group.left);expect(point.x).toBeLessThanOrEqual(group.right);
   expect(point.y-group.top).toBeGreaterThanOrEqual(touch/2-EPS);expect(group.bottom-point.y).toBeGreaterThanOrEqual(touch/2-EPS);
  }
 });
 return groups;
}

describe('N153 the recall chart\'s tap targets',()=>{
 it('reviews far apart get a target each',()=>{
  const groups=check([{x:40,y:12},{x:120,y:30},{x:200,y:12},{x:300,y:60}]);
  expect(groups.map(group=>[group.first,group.last])).toEqual([[0,0],[1,1],[2,2],[3,3]]);
 });
 it('reviews closer than a fingertip share one; side-by-side targets never overlap and are each a full touch wide',()=>{
  // The demo card at 360 px: 18 reviews, several 0–7 px apart.
  const xs=[38,54,92,99,99,102,105,160,192,195,205,216,217,224,230,243,307,314],ys=[12,40,26,13,12,12,12,18,14,12,12,12,14,21,18,20,31,13];
  const groups=check(xs.map((x,index)=>({x,y:ys[index]})));
  expect(groups.length).toBeGreaterThanOrEqual(5);
  expect(groups.length).toBeLessThan(xs.length);
 });
 it('holds for many random charts, with the 44 px web and 48 px app targets',()=>{
  let seed=7;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let run=0;run<200;run++){
   const count=1+Math.floor(random()*30),width=280+random()*400;
   const points=Array.from({length:count},()=>({x:40+random()*(width-60),y:10+random()*150})).sort((a,b)=>a.x-b.x);
   check(points,run%2?48:44);
  }
 });
 it('one review, or several at the same moment, make one target',()=>{
  expect(check([{x:100,y:20}])).toHaveLength(1);
  expect(check([{x:100,y:20},{x:100,y:24},{x:100,y:30}])).toHaveLength(1);
  expect(tapGroups([],TOUCH)).toEqual([]);
 });
 it('a shared target names each of its reviews',()=>{
  const day=86_400_000,start=Date.UTC(2026,7,19);
  const dots:ReviewDot[]=[{at:start,recall:.9,rating:2,intervalDays:0},{at:start+day,recall:.95,rating:3,intervalDays:3},{at:start+60*day,recall:.8,rating:4,intervalDays:20}];
  const series:RecallSeries={line:[],dots,start,end:start+70*day};
  const html=renderToStaticMarkup(<RecallChart series={series} target={.9} zone="UTC"/>);
  const labels=[...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map(match=>match[1]);
  expect(labels).toEqual(['Wed 19 Aug to Thu 20 Aug, 2 reviews: Hard, Good','Sun 18 Oct, Easy, next in 20 days']);
 });
});

describe('N153 the Inbox list\'s checkboxes',()=>{
 it('the row\'s leading space belongs to the checkbox\'s label',()=>{
  const css=readFileSync('src/features/proposals/v7/inbox.css','utf8');
  expect(css).toContain('.v7-inbox-group li {padding:var(--v7-space-1) var(--v7-space-3) var(--v7-space-1) 0;');
  expect(css).toContain('.v7-inbox-group li > .v7-check-choice {padding-inline-start:var(--v7-space-3);}');
 });
});
