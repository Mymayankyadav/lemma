import {describe,it,expect} from 'vitest';
import {layoutRoute,type RouteStageSpan} from '../../../src/ui/timeline/route-layout';

const stages=(total:number,size:number):RouteStageSpan[]=>
 Array.from({length:Math.ceil(total/size)},(_,i)=>({
  start:i*size,end:Math.min(total-1,(i+1)*size-1),
 }));
function assertClearance(total:number,size:number,width:number,selected:number){
 const result=layoutRoute(stages(total,size),total,selected,width);
 expect(result.marks.some(m=>m.kind==='station'&&m.index===selected&&m.selected)).toBe(true);
 for(let i=1;i<result.marks.length;i++){
  const a=result.marks[i-1],b=result.marks[i];
  const edgeGap=b.x-b.width/2-(a.x+a.width/2);
  expect(edgeGap).toBeGreaterThanOrEqual(8-0.01);
 }
 for(const m of result.marks){
  expect(m.x-m.width/2).toBeGreaterThanOrEqual(0);
  expect(m.x+m.width/2).toBeLessThanOrEqual(width);
 }
 return result;
}
describe('LOOK-3b one-line Route geometry',()=>{
 it('draws all nine checkpoints in plain mode',()=>{
  const r=assertClearance(9,3,390,4);
  expect(r.mode).toBe('plain');
  expect(r.marks).toHaveLength(9);
  expect(r.marks.every(m=>m.kind==='station')).toBe(true);
 });
 it('folds 36 unstaged checkpoints into neutral groups of eight',()=>{
  const r=assertClearance(36,8,360,0);
  expect(r.mode).toBe('folded');
  expect(r.marks.some(m=>m.kind==='stage')).toBe(true);
  expect(r.marks.filter(m=>m.kind==='station').length).toBeLessThanOrEqual(9);
 });
 it('preserves clearance and current checkpoint with 40 stages of 15',()=>{
  for(const width of [360,390])for(const selected of [0,317,599]){
   const r=assertClearance(600,15,width,selected);
   expect(r.mode).toBe('folded');
   expect(r.marks.length).toBeLessThan(40);
   expect(r.marks.some(m=>m.kind==='stage'&&m.stages>1)).toBe(true);
  }
 });
 it('bundles 100 stages of 15 without crowding at either phone width',()=>{
  for(const width of [360,390])for(const selected of [0,750,1499]){
   const r=assertClearance(1500,15,width,selected);
   expect(r.mode).toBe('folded');
   expect(r.marks.length).toBeLessThan(40);
   expect(r.marks.some(m=>m.kind==='stage'&&m.stages>1)).toBe(true);
  }
 });
 it('sizes unmerged stage capsules by square root of actual checkpoint count',()=>{
  const r=layoutRoute([{start:0,end:0},{start:1,end:4},{start:5,end:20}],21,0,390);
  expect(r.mode).toBe('folded');
  const capsules=r.marks.filter(m=>m.kind==='stage');
  expect(capsules).toHaveLength(2);
  expect(capsules[1].width).toBeGreaterThan(capsules[0].width);
 });
 it('reserves the actual current halo when keyboard selection moves elsewhere',()=>{
  for(const width of [360,390]){
   for(const [total,size,current,selected] of [[16,4,3,8],[36,8,3,26],[600,15,3,317],[1500,15,10,750]]){
    const r=layoutRoute(stages(total,size),total,selected,width,current);
    const actual=r.marks.find(m=>m.kind==='station'&&m.index===current);
    const focus=r.marks.find(m=>m.kind==='station'&&m.index===selected);
    expect(actual).toBeDefined();
    expect(focus).toBeDefined();
    expect(actual!.width).toBeGreaterThanOrEqual(22);
    for(let i=1;i<r.marks.length;i++){
     const previous=r.marks[i-1],next=r.marks[i];
     const visibleGap=next.x-next.width/2-(previous.x+previous.width/2);
     expect(visibleGap).toBeGreaterThanOrEqual(8-0.01);
    }
    for(const m of r.marks){
     expect(m.x-m.width/2).toBeGreaterThanOrEqual(0);
     expect(m.x+m.width/2).toBeLessThanOrEqual(width);
    }
   }
  }
 });
 it('never draws a station rail when there are no checkpoints',()=>{
  expect(layoutRoute([],0,0,360)).toEqual({mode:'plain',marks:[],activeStage:0});
 });
});
