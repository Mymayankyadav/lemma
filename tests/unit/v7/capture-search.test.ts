import {describe,expect,it} from 'vitest';
import {parseCapture,defaultStart,type CaptureContext} from '../../../src/app/v7/captureModel';
import {matchTitle,search,type SearchItem,type SearchGroupName} from '../../../src/app/v7/searchModel';

const ctx:CaptureContext={now:new Date('2026-11-11T08:20:00Z'),zone:'UTC',session:false,
 paths:[{id:'p1',slug:'real-analysis',title:'Real Analysis'},{id:'p2',slug:'topology',title:'Topology'}]};

describe('v7 capture parsing',()=>{
 it('reads date, time, length and path out of one line into a time block',()=>{
  const parsed=parseCapture('Rudin ch 4 tomorrow 4pm 90m #real',ctx);
  expect(parsed.kind).toBe('block');
  expect(parsed.title).toBe('Rudin ch 4');
  expect(parsed.date).toBe('2026-11-12');
  expect(parsed.time).toBe('16:00');
  expect(parsed.minutes).toBe(90);
  expect(parsed.path?.slug).toBe('real-analysis');
 });
 it('treats plain text as a task and "front :: back" as a card',()=>{
  expect(parseCapture('Buy notebook',ctx).kind).toBe('task');
  const card=parseCapture('Limit of a sequence :: A number L such that',ctx);
  expect(card.kind).toBe('card');
 });
 it('returns an ignored token to the title',()=>{
  const full=parseCapture('Rudin ch 4 tomorrow 4pm 90m #real',ctx);
  const token=full.tokens.find(item=>item.type==='time')!;
  const without=parseCapture('Rudin ch 4 tomorrow 4pm 90m #real',ctx,new Set([token.id]));
  expect(without.time).toBeNull();
  expect(without.title).toContain('4pm');
 });
 it('keeps a thought inside a session and does not mistake "#4" for a path',()=>{
  expect(parseCapture('idea about compactness',{...ctx,session:true}).kind).toBe('thought');
  expect(parseCapture('#4 is not a path, 25 apples',ctx).path).toBeNull();
 });
 it('starts a block at the next free half hour',()=>{
  expect(defaultStart('2026-11-12',null,ctx).date).toBe('2026-11-12');
  expect(defaultStart(null,'16:00',ctx).time).toBe('16:00');
 });
});

const items:SearchItem[]=[
 {id:'1',group:'Paths',title:'Compact sets',to:'/p/a'},
 {id:'2',group:'Cards',title:'Is a closed subset compact?',to:'/cards/1'},
 {id:'3',group:'Cards',title:'Compactness and covers',to:'/cards/2'},
 {id:'4',group:'Concepts',title:'Compact',to:'/atlas?id=c'},
 {id:'5',group:'Tasks',title:'Review compact notes',to:'/tasks'},
 {id:'6',group:'Actions',title:'Start focus',to:'/'},
];
describe('v7 search',()=>{
 it('splits the title around the match, ignoring case',()=>{
  const hit=matchTitle(items[1],'COMPACT')!;
  expect([hit.before,hit.match,hit.after]).toEqual(['Is a closed subset ','compact','?']);
  expect(matchTitle(items[5],'compact')).toBeNull();
 });
 it('groups in plan order and puts prefix matches first',()=>{
  const result=search(items,'compact');
  expect(result.groups.map(group=>group.name)).toEqual<SearchGroupName[]>(['Paths','Cards','Concepts','Tasks']);
  expect(result.groups[1].items[0].title).toBe('Compactness and covers');
  expect(result.flat).toHaveLength(5);
 });
 it('caps a group at four rows until it is expanded',()=>{
  const many:SearchItem[]=Array.from({length:7},(_,index)=>({id:String(index),group:'Cards',title:'Compact '+index,to:'/cards/'+index}));
  expect(search(many,'compact').groups[0]).toMatchObject({total:7});
  expect(search(many,'compact').groups[0].items).toHaveLength(4);
  expect(search(many,'compact',new Set<SearchGroupName>(['Cards'])).groups[0].items).toHaveLength(7);
  expect(search(many,'  ').flat).toHaveLength(0);
 });
});
