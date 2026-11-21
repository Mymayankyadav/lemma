import {describe,expect,it} from 'vitest';
import {nextStep,freeMinutes} from '../../../src/features/home/v7/nextStepModel';
import type {AgendaRead} from '../../../src/data/adaptive/agenda-api';
import {tutorPresence} from '../../../src/features/tutor/presence';
import {finishPadStroke,initializePadInk,undoPadInk} from '../../../src/ui/v7/ink/ink';
import {fittedImageSize,inkBounds} from '../../../src/ui/v7/ink/images';
import {dayMinute,minuteClock} from '../../../src/ui/v7/RulerTime';
import {changeChip} from '../../../src/features/insights/v7/progressModel';
import {goalDates} from '../../../src/features/insights/v7/GoalEditor';
import {v7ScreenFor,V7_DETAIL_SCREENS} from '../../../src/app/v7Kit';
import {usedBridges} from '../../../src/features/adaptive/panels/AtlasLayers';
import {bridgeStrength,type AtlasLink} from '../../../supabase/functions/_shared/adaptive/links';

const now=Date.parse('2026-11-09T13:43:00Z');
const facts={due:23,reviewMinutes:10,tutorHref:'/p/analysis/tutor',tutorTitle:'Compactness',active:false,now,
  localMinute:13*60+43,zone:'UTC',closed:false};
function agenda(outcome:AgendaRead['decision']['outcome'],label?:string):AgendaRead {
  return {label,decision:{asOf:new Date(now).toISOString(),snapshotVersion:'test',requested:'new',effective:'new',
    policyVersion:'test',reason:'Private scheduler reason',outcome,baseline:outcome}};
}

describe('November UI plan',()=>{
  it('lists only approved bridges with a recorded use',()=>{
    const link:AtlasLink={id:'bridge',from_id:'metric',to_id:'open',kind:'analogous',status:'approved'};
    const empty={from:link.from_id,to:link.to_id,strength:bridgeStrength(0,0)};
    const observed={...empty,strength:bridgeStrength(2,1)};
    expect(usedBridges({links:[link],bridges:[empty]})).toEqual([]);
    expect(usedBridges({links:[link],bridges:[{...empty,strength:bridgeStrength(1,0)}]})).toEqual([]);
    expect(usedBridges({links:[{...link,status:'proposed'}],bridges:[observed]})).toEqual([]);
    expect(usedBridges({links:[link],bridges:[observed]})).toEqual([observed]);
  });

  it('turns each scheduler outcome into plain actions',()=>{
    expect(nextStep(agenda({kind:'action',taskId:'p/review',start:now/60000,end:now/60000+10},'Review'),facts))
      .toMatchObject({action:'Start review',title:'Review 23 cards',minutes:10});
    expect(nextStep(agenda({kind:'action',taskId:'task/1',start:0,end:25},'Solve problems'),facts).action).toBe('Start focus');
    expect(nextStep(agenda({kind:'no-capacity',until:null}),facts).title).toBe('How long do you have?');
    expect(nextStep(agenda({kind:'fixed',until:now/60000+60}),facts).title).toBe('Free at 14:43');
    expect(nextStep(agenda({kind:'unavailable',until:null}),facts).action).toBe('Start review');
    expect(nextStep(agenda({kind:'protected',until:null}),{...facts,active:true}).action).toBe('Return to focus');
  });

  it('fits free time before a commitment and uses evening and night language',()=>{
    expect(freeMinutes(now,new Date(now+41*60_000).toISOString(),50)).toBe(40);
    expect(freeMinutes(now,undefined,25)).toBe(25);
    expect(nextStep(undefined,{...facts,localMinute:21*60}).action).toBe('Close the day');
    expect(nextStep(undefined,{...facts,localMinute:40}).action).toBe('Plan tomorrow');
  });

  it('shows an active claim before listener presence and expires old reads',()=>{
    const recent=new Date(now-29_999).toISOString();
    expect(tutorPresence(now,recent)).toBe('Listening');
    expect(tutorPresence(now,recent,new Date(now+1_000).toISOString())).toBe('Replying');
    expect(tutorPresence(now,new Date(now-30_000).toISOString())).toBe('Not listening');
    expect(tutorPresence(now,recent,null,true)).toBe('Not listening');
  });

  it('round trips bounded ink and crops it before sharing',()=>{
    const blank=initializePadInk()!;
    const ink=finishPadStroke(blank,[{x:20,y:32},{x:42,y:46}]);
    expect(inkBounds(ink.strokes,5)).toEqual({x:15,y:27,width:32,height:24});
    expect(initializePadInk(JSON.parse(JSON.stringify(ink.strokes)))?.strokes).toEqual(ink.strokes);
    expect(undoPadInk(ink)).toEqual(blank);
    expect(fittedImageSize(4000,2000)).toEqual({width:1024,height:512});
  });

  it('preserves exact minute values and skips a comparison without prior data',()=>{
    expect(minuteClock(dayMinute('07:13'))).toBe('07:13');
    expect(minuteClock(2000)).toBe('23:59');
    expect(changeChip(95,0,'30')).toBeNull();
    expect(goalDates('2026-11-09','week',1)).toEqual({startDate:'2026-11-09',endDate:'2026-11-15'});
    expect(goalDates('2026-12-21','month',1)).toEqual({startDate:'2026-12-01',endDate:'2026-12-31'});
  });

  it('routes details to the single action dock and renders direct review results in v7',()=>{
    for(const route of ['/p/analysis','/p/analysis/cp/CP2','/p/analysis/cp/CP2/tutor','/s/analysis/2','/cards/1','/proposals/1','/focus','/today/close','/review/done']) {
      expect(V7_DETAIL_SCREENS.has(v7ScreenFor(route)!)).toBe(true);
    }
    for(const route of ['/','/projects','/review','/calendar','/insights']) expect(V7_DETAIL_SCREENS.has(v7ScreenFor(route)!)).toBe(false);
    expect(v7ScreenFor('/review/done')).toBe('review-done');
  });
});
