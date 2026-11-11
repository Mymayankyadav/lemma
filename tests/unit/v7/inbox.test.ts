import {describe,expect,it} from 'vitest';
import type {Proposal} from '../../../src/data/types';
import {changeRows,groupBySession,mergeOrder,miniWindow,sameSession,skipFirst,swipeIntent,swipeStyle} from '../../../src/features/proposals/v7/inboxModel';
import {v7ScreenFor} from '../../../src/app/v7Kit';

const proposal=(id:string,over:Partial<Proposal>={}):Proposal=>({id,kind:'card',projectSlug:'ra',projectGlyph:'∫',sessionNumber:7,origin:'claude',reason:null,
 createdAt:'2026-11-08T10:00:00Z',card:{front:'f',back:'b',type:'basic',kind:'why'},cardEdit:null,plan:null,planChange:null,...over} as Proposal);

describe('v7 Inbox (PLAN §6.10)',()=>{
 it('decides at 35% of the width or on a fast flick, otherwise springs back',()=>{
  expect(swipeIntent(126,0,360)).toBe('approve');
  expect(swipeIntent(-126,10,360)).toBe('reject');
  expect(swipeIntent(100,0,360)).toBeNull();
  expect(swipeIntent(60,0,360,1.2)).toBe('approve');
  expect(swipeIntent(-60,0,360,-1.2)).toBe('reject');
  expect(swipeIntent(10,-120,360)).toBe('skip');
  expect(swipeIntent(10,120,360)).toBeNull();
 });
 it('tilts at most 6° and names the decision while dragging',()=>{
  expect(swipeStyle(500,360)).toEqual({rotate:6,wash:1,word:'Approve'});
  expect(swipeStyle(-500,360).rotate).toBe(-6);
  expect(swipeStyle(10,360).word).toBeNull();
 });
 it('keeps the queue order stable, skips to the end and adds new arrivals last',()=>{
  expect(skipFirst(['a','b','c'])).toEqual(['b','c','a']);
  expect(mergeOrder(['c','a'],['a','b','c'])).toEqual(['c','a','b']);
  expect(mergeOrder(['x','a'],['a'])).toEqual(['a']);
 });
 it('offers "Approve all" only for new cards from the same path and session',()=>{
  const queue=[proposal('1'),proposal('2'),proposal('3',{sessionNumber:6}),proposal('4',{kind:'card_edit'}),proposal('5',{projectSlug:'la'})];
  expect(sameSession(queue[0],queue).map(p=>p.id)).toEqual(['1','2']);
  expect(sameSession(proposal('x',{sessionNumber:null}),queue)).toEqual([]);
 });
 it('groups the list view by path and session',()=>{
  const groups=groupBySession([proposal('1'),proposal('2',{sessionNumber:null}),proposal('3')],slug=>slug==='ra'?'Real Analysis':slug);
  expect(groups.map(group=>[group.label,group.items.length])).toEqual([['Real Analysis · Session 7',2],['Real Analysis · Without a session',1]]);
 });
 it('describes each plan change in words with its icon',()=>{
  const title=(code:string)=>({CP4:'Compactness',CP5:'Continuity',CP4a:'Finite subcover lemma'} as Record<string,string>)[code]??code;
  expect(changeRows([
   {op:'add',code:'CP4a',title:'Finite subcover lemma',after:'CP4',objective:'',criterion:'',steps:[]},
   {op:'prereq_add',code:'CP5',prereq:'CP4a'},{op:'remove',code:'CP5'},{op:'update',code:'CP4',title:'Compact sets'},{op:'move',code:'CP5',after:'CP4'},
  ],title)).toEqual([
   {icon:'add',code:'CP4a',text:'Add Finite subcover lemma after Compactness'},
   {icon:'link',code:'CP5',text:'Continuity now needs Finite subcover lemma'},
   {icon:'remove',code:'CP5',text:'Remove Continuity'},
   {icon:'edit',code:'CP4',text:'Change Compactness to Compact sets'},
   {icon:'move',code:'CP5',text:'Move Continuity after Compactness'},
  ]);
 });
 it('shows five nodes around the first change',()=>{
  const nodes=Array.from({length:12},(_,index)=>({code:'CP'+index,title:'T'+index,criterion:'',steps:[],prereqs:[]}));
  expect(miniWindow(nodes,new Set(['CP9'])).map(node=>node.code)).toEqual(['CP7','CP8','CP9','CP10','CP11']);
  expect(miniWindow(nodes,new Set(['CP1'])).map(node=>node.code)).toEqual(['CP0','CP1','CP2','CP3','CP4']);
  expect(miniWindow(nodes.slice(0,3),new Set())).toHaveLength(3);
 });
 it('routes the Inbox and plan proposals to v7',()=>{
  expect(v7ScreenFor('/proposals')).toBe('inbox');
  expect(v7ScreenFor('/proposals/abc')).toBe('plan-proposal');
 });
});
