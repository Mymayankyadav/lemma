import {describe,expect,it} from 'vitest';
import {dayMinutes,layoutDayIntervals,moveInterval,resizeInterval,snapDragMinutes} from
 '../../../src/features/calendar/grid/layout';
const utc={start:'2026-11-09T00:00:00Z',end:'2026-11-10T00:00:00Z'};
const ev=(id:string,start:string,end:string)=>({id,start:`2026-11-09T${start}:00Z`,end:`2026-11-09T${end}:00Z`});
describe('N121 Calendar interval positioning',()=>{
 it('uses true elapsed day lengths for spring and autumn DST changes',()=>{
  expect(dayMinutes({start:'2026-03-08T05:00:00Z',end:'2026-03-09T04:00:00Z'})).toBe(23*60);
  expect(dayMinutes({start:'2026-11-01T04:00:00Z',end:'2026-11-02T05:00:00Z'})).toBe(25*60);
 });
 it('positions a 90-minute item as 1.5 hours and clips midnight continuations',()=>{
  const result=layoutDayIntervals([
   ev('one','15:00','16:30'),
   {id:'midnight',start:'2026-11-08T23:30:00Z',end:'2026-11-09T00:30:00Z'},
   {id:'tomorrow',start:'2026-11-09T23:30:00Z',end:'2026-11-10T02:30:00Z'},
  ],utc,64);
  expect(result.find(x=>x.id==='one')).toMatchObject({top:960,height:96,lanes:1,lane:0});
  expect(result.find(x=>x.id==='midnight')).toMatchObject({top:0,height:32,continuesBefore:true});
  expect(result.find(x=>x.id==='tomorrow')).toMatchObject({continuesAfter:true,height:32});
 });
 it('assigns three simultaneous items separate lanes and frees touching endpoints',()=>{
  const result=layoutDayIntervals([ev('a','08:00','10:00'),ev('b','08:30','09:30'),
   ev('c','09:00','10:30'),ev('d','10:30','11:00')],utc);
  expect(result.filter(x=>x.id!=='d').map(x=>x.lane)).toEqual([0,1,2]);
  expect(result.slice(0,3).map(x=>x.lanes)).toEqual([3,3,3]);
  expect(result.find(x=>x.id==='d')).toMatchObject({lane:0,lanes:1});
 });
 it('snaps drag moves and preserves the block length; resize has a minimum',()=>{
  expect(snapDragMinutes(64)).toBe(60);
  expect(snapDragMinutes(12)).toBe(15);
  const shifted=moveInterval('2026-11-09T10:00:00Z','2026-11-09T11:00:00Z',15);
  expect(shifted.start).toBe('2026-11-09T10:15:00.000Z');
  expect(shifted.end).toBe('2026-11-09T11:15:00.000Z');
  expect(resizeInterval('2026-11-09T10:00:00Z','2026-11-09T11:00:00Z',-120).end)
   .toBe('2026-11-09T10:15:00.000Z');
 });
 it('refuses invalid absolute dates and negative intervals',()=>{
  expect(()=>layoutDayIntervals([{id:'bad',start:'2026-11-09T10:00',end:'2026-11-09T11:00'}],utc)).toThrow();
  expect(()=>moveInterval('2026-11-09T11:00:00Z','2026-11-09T10:00:00Z',15)).toThrow();
 });
});
