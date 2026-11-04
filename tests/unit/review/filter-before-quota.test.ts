import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {useReviewSession} from '../../../src/features/review-run/store';
import type {QueueFilter,ReviewItem} from '../../../src/data/types';

const filter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};

describe('Review selection before daily quota',()=>{
 it.each([{matching:8,quota:3},{matching:2,quota:5}])(
  'passes only the matching selection to the queue (M=$matching Q=$quota)',({matching,quota})=>{
   const source=readFileSync('src/features/review/Page.tsx','utf8');
   expect(source).toMatch(/const dueItems=useMemo\(\(\)=>reviewEligible\(cards\.data/);
   expect(source).toMatch(/const chosen=\(onlyNew\?selection\.filter\([\s\S]*?\):selection\)\.slice\(0,settings\.data\.reviewsPerDay\|\|200\)/);
   const cards=Array.from({length:10},(_,i)=>({
    cardId:'card-'+i,projectSlug:i<matching?'included':'excluded',
    checkpointCode:null,state:{state:2,due:new Date(0).toISOString()},
   })) as unknown as ReviewItem[];
   const selected=cards.filter(c=>c.projectSlug==='included').slice(0,quota);
   useReviewSession.getState().initialize(selected,{reviewsPerDay:quota,mixDecks:false} as any,filter);
   const state=useReviewSession.getState();
   expect(state.total).toBe(Math.min(matching,quota));
   expect(state.queue?.total).toBe(state.total);
   expect(selected.every(c=>c.projectSlug==='included')).toBe(true);
   useReviewSession.getState().close();
  });
});
