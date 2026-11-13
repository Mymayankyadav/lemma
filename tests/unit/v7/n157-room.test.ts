import {beforeEach,describe,expect,it,vi} from 'vitest';
import {FLAG_DEFAULTS} from '../../../src/flags';
import {overdueParts,readRoomRecent,rememberRoomItem,ROOM_RECENT_KEY} from '../../../src/ui/v7/room';
import {AtlasScene,type ScenePalette} from '../../../src/features/atlas/v7/scene';
import type {AtlasModel} from '../../../src/features/atlas/v7/model';

beforeEach(()=>localStorage.clear());
describe('U3 local navigation history',()=>{
 it('is opt-in and keeps exactly the last three distinct destinations, newest first',()=>{
  expect(FLAG_DEFAULTS.v7Room).toBe(false);
  for(let i=1;i<=4;i++)rememberRoomItem({id:String(i),group:'Cards',title:'Card '+i,to:'/cards/'+i});
  expect(readRoomRecent().map(item=>item.to)).toEqual(['/cards/4','/cards/3','/cards/2']);
  rememberRoomItem({id:'2',group:'Cards',title:'Updated card',to:'/cards/2'});
  expect(readRoomRecent().map(item=>item.title)).toEqual(['Updated card','Card 4','Card 3']);
 });
 it('ignores action shortcuts, so search actions never displace an opened learning item',()=>{
  rememberRoomItem({id:'p',group:'Paths',title:'Algebra',to:'/p/algebra'});
  rememberRoomItem({id:'action:focus',group:'Actions',title:'Quick focus',to:'/?quick=1'});
  expect(readRoomRecent()).toHaveLength(1);
 });
 it('keeps opened tutoring sessions alongside paths and cards',()=>{
  rememberRoomItem({id:'session',group:'Sessions',title:'Session 7 · Compactness',to:'/s/session-7'});
  expect(readRoomRecent()[0]).toMatchObject({group:'Sessions',to:'/s/session-7'});
 });
 it('rejects malformed storage, external URLs, control characters and unknown groups',()=>{
  const item={id:'1',group:'Cards',title:'Card',to:'/cards/1'};
  for(const value of ['{','null','{}']){localStorage.setItem(ROOM_RECENT_KEY,value);expect(readRoomRecent()).toEqual([]);}
  localStorage.setItem(ROOM_RECENT_KEY,JSON.stringify([null,{}, {...item,to:'https://example.com'}, {...item,to:'//example.com'}, {...item,to:'/cards/\\evil'}, {...item,group:'Unknown'},item]));
  expect(readRoomRecent()).toEqual([item]);
 });
 it('still opens pages when device storage is unavailable',()=>{
  const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
  expect(()=>rememberRoomItem({id:'p',group:'Paths',title:'Algebra',to:'/p/algebra'})).not.toThrow();
  spy.mockRestore();
 });
});
describe('Tasks tells the learner which things are overdue',()=>{
 it('names each nonzero kind without inventing a task count',()=>{
  expect(overdueParts({tasks:2,deadlines:0,topics:1})).toBe('2 tasks, 1 practice');
  expect(overdueParts({tasks:1,deadlines:2,topics:0})).toBe('1 task, 2 deadlines');
  expect(overdueParts({tasks:0,deadlines:1,topics:2})).toBe('1 deadline, 2 practice');
  expect(overdueParts({tasks:0,deadlines:0,topics:0})).toBe('');
 });
});
describe('Atlas fits the focused constellation',()=>{
 it('frames its stars and labels, without fitting a distant unrelated subject',()=>{
  const stars=[0,0,1].map((cluster,index)=>({id:String(index),slug:String(index),name:'A concept',label:'A concept',subjectId:String(cluster),cluster,state:'not_started' as const,radius:3,due:0,checkpoints:[],pin:null,degree:0}));
  const model:AtlasModel={stars,index:new Map(),clusters:[{id:'0',name:'Analysis',subject:'Analysis',index:0,size:2},{id:'1',name:'Algebra',subject:'Algebra',index:1,size:1}],edges:[],neighbours:[[],[],[]],counts:{concepts:3,connections:0,demonstrated:0}};
  const canvas={getContext:()=>({})} as unknown as HTMLCanvasElement;
  const scene=new AtlasScene(canvas,model,{x:[0,100,10000],y:[0,100,10000],centres:[[50,50],[10000,10000]]} as ConstructorParameters<typeof AtlasScene>[2],{} as ScenePalette);
  scene.setSize(390,844,1);scene.setInsets({top:120,right:0,bottom:100,left:0});
  scene.camera=scene.clusterCamera(0);
  for(const i of [0,1]){
   const [x,y]=scene.toScreen(i*100,i*100);
   expect(x).toBeGreaterThanOrEqual(24);expect(x+63).toBeLessThan(390-24);
   expect(y).toBeGreaterThan(120);expect(y).toBeLessThan(844-100);
  }
  const [otherX]=scene.toScreen(10000,10000);expect(otherX).toBeGreaterThan(390);
 });
});
