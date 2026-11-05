import {describe,expect,it} from 'vitest';
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter';
import {useReviewSession} from '../../../src/features/review-run/store';
import type {QueueFilter} from '../../../src/data/types';

const filter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};

describe('Review selection before daily quota',()=>{
 it.each([{matching:8,quota:3},{matching:2,quota:5}])(
  'uses actual demo adapter cards before applying quota (M=$matching Q=$quota)',async ({matching,quota})=>{
   const fixture=structuredClone(demoSeedFixture);
   const project=fixture.projects.find(p=>!p.system&&p.status!=='archived');
   if(!project)throw Error('Missing demo project');
   const otherProject=fixture.projects.find(p=>p.id!==project.id&&!p.system);
   if(!otherProject)throw Error('Missing second demo project');
   const template=fixture.notes.find(n=>n.cards.length>0);
   if(!template)throw Error('Missing demo note');
   fixture.notes=Array.from({length:10},(_,i)=>{
    const note=structuredClone(template);
    note.projectId=i<matching?project.id:otherProject.id;
    note.note.noteId='quota-note-'+i;
    note.note.noteNo=10000+i;
    note.note.status='active';
    note.cards=note.cards.slice(0,1);
    note.cards[0].id='quota-card-'+i;
    note.cards[0].state.state=2;
    note.cards[0].state.due='2020-01-01T00:00:00.000Z';
    return note;
   });
   const adapter=new DemoAdapter({fixture,now:()=>Date.parse('2026-11-04T12:00:00Z'),timeZone:'UTC'});
   const all=await adapter.getReviewItems(filter);
   const matchingCards=all.filter(c=>c.projectSlug===project.slug);
   expect(matchingCards).toHaveLength(matching);
   const chosen=matchingCards.slice(0,quota);
   const settings={reviewsPerDay:quota,newPerDay:quota,rolloverHour:4,timeZone:'UTC',learnAheadMinutes:0,mixDecks:false};
   useReviewSession.getState().initialize(chosen,settings,filter);
   const state=useReviewSession.getState();
   expect(state.total).toBe(Math.min(matching,quota));
   expect(state.queue?.total).toBe(state.total);
   expect(chosen.every(c=>c.projectSlug===project.slug)).toBe(true);
   expect(new Set(chosen.map(c=>c.cardId)).size).toBe(chosen.length);
   useReviewSession.getState().close();
  });
});
