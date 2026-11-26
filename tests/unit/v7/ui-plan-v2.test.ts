import {describe,expect,it} from 'vitest';
import {courseAction,fallbackTutor,nextStep,freeMinutes} from '../../../src/features/home/v7/nextStepModel';
import {scheduledConceptCheckpoint} from '../../../src/features/home/v7/scheduledCheckpoint';
import type {AgendaRead} from '../../../src/data/adaptive/agenda-api';
import type {ProjectSummary} from '../../../src/data/types';
import {tutorPresence} from '../../../src/features/tutor/presence';
import {finishPadStroke,initializePadInk,undoPadInk} from '../../../src/ui/v7/ink/ink';
import {fittedImageSize,inkBounds} from '../../../src/ui/v7/ink/images';
import {editInkDraft,emptyInk,finishStagedDrawing,keepDraftImage,removeSubmittedInk,type InkDraft} from '../../../src/data/tutor/ink-storage';
import {dayMinute,minuteClock} from '../../../src/ui/v7/RulerTime';
import {changeChip} from '../../../src/features/insights/v7/progressModel';
import {goalDates} from '../../../src/features/insights/v7/GoalEditor';
import {v7ScreenFor,V7_DETAIL_SCREENS} from '../../../src/app/v7Kit';
import {usedBridges} from '../../../src/features/adaptive/panels/AtlasLayers';
import {bridgeStrength,type AtlasLink} from '../../../supabase/functions/_shared/adaptive/links';

const now=Date.parse('2026-11-09T13:43:00Z');
const facts={due:23,reviewMinutes:10,active:false,now,localMinute:13*60+43,zone:'UTC',closed:false,projects:[],tasks:[],scopedReview:true};
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
    expect(nextStep(agenda({kind:'action',taskId:'p/review:card-1',start:now/60000,end:now/60000+10},'Review · Stokes'),facts))
      .toMatchObject({action:'Start review',title:'Review · Stokes',href:'/review/run?target=card&id=card-1',minutes:10});
    expect(nextStep(agenda({kind:'action',taskId:'task/1',start:0,end:25},'Solve problems'),facts).action).toBe('Start focus');
    expect(nextStep(agenda({kind:'no-capacity',until:null}),facts).title).toBe('How long do you have?');
    expect(nextStep(agenda({kind:'fixed',until:now/60000+60}),facts).title).toBe('Free at 14:43');
    expect(nextStep(agenda({kind:'unavailable',until:null}),facts).action).toBe('Start review');
    expect(nextStep(agenda({kind:'protected',until:null}),{...facts,active:true}).action).toBe('Return to focus');
  });

  it('uses the selected action target and handles missing targets without picking a different path',()=>{
    const first:ProjectSummary={id:'project-analysis',slug:'real-analysis',title:'Real Analysis',status:'active',total:4,done:3,
      subject:{id:'subject-analysis',name:'Analysis',glyph:'∫',hue:'amber',position:0},current:{code:'CP4',title:'Compactness',step:0,stepsTotal:4},
      lastActivityAt:null,cardsCount:0,sessionsCount:0,sourcesCount:0};
    const selected:ProjectSummary={...first,id:'project-linear',slug:'linear-algebra',title:'Linear Algebra',current:{code:'CP9',title:'Diagonalization',step:0,stepsTotal:4}};
    const input={...facts,projects:[first,selected],due:0};
    const action=(taskId:string,label:string)=>agenda({kind:'action',taskId,start:0,end:20},label);
    const learn=action('project-linear/teach:linear-10','Learn · Eigenvectors');
    expect(nextStep(learn,{...input,checkpoint:{code:'CP10',title:'Eigenvectors'}})).toMatchObject({
      action:'Start with tutor',href:'/p/linear-algebra/cp/CP10/tutor',why:'Eigenvectors is next on Linear Algebra.',
    });
    expect(fallbackTutor(learn,input.projects)).toBeUndefined();
    expect(nextStep(learn,input)).toMatchObject({action:'Open path',href:'/p/linear-algebra',why:'The recommended checkpoint on Linear Algebra is unavailable.'});
    expect(nextStep(learn,{...input,projects:[first]})).toMatchObject({action:'Quick focus',why:'The recommended step is unavailable.'});
    expect(nextStep(undefined,input)).toMatchObject({action:'Start with tutor',href:'/p/real-analysis/cp/CP4/tutor'});
    expect(nextStep(undefined,{...input,waitingForAgenda:true}).href).toBeUndefined();
    expect(nextStep(action('project-linear/practice:concept-vector','Practice · Vector spaces'),input)).toMatchObject({
      part:'Practice',action:'Start practice',href:'/practice',why:'The plan has time to practise Vector spaces on Linear Algebra.',
    });
    expect(nextStep(action('project-linear/review:card-2','Review · Rank'),{...input,scopedReview:false})).toMatchObject({
      part:'Checks',action:'Open review',href:'/review?path=linear-algebra',why:'A card from Linear Algebra is ready to review.',
    });
  });

  it('matches certification, re-entry and final checks by concept within the scheduled path',()=>{
    const checkpoint=(id:string,position:number,status='not_started',project_id='linear')=>({id,code:id,title:id,position,status,project_id,tier:'core'});
    const checkpoints=[checkpoint('other-project',1,'not_started','analysis'),checkpoint('prerequisite',1,'demonstrated'),
      checkpoint('first',2),checkpoint('final',3)];
    const rows={checkpoints,cpConcepts:[{concept_id:'revisit',checkpoint_id:'prerequisite'},{concept_id:'check',checkpoint_id:'first'},
      {concept_id:'final',checkpoint_id:'final'},{concept_id:'check',checkpoint_id:'other-project'}],
      prereqs:[{checkpoint_id:'first',prereq_id:'prerequisite'}]};
    for(const [taskId,expected] of [['linear/check:check','first'],['linear/probe:revisit','prerequisite'],['linear/final:final','final']]){
      const action=courseAction(agenda({kind:'action',taskId,start:0,end:5}))!;
      expect(scheduledConceptCheckpoint(action,rows)?.id).toBe(expected);
    }
    const unrelated=courseAction(agenda({kind:'action',taskId:'linear/check:final',start:0,end:5}))!;
    expect(scheduledConceptCheckpoint(unrelated,rows)).toBeUndefined();
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

  it('clears only submitted images when a draft has separate drawings and photos',()=>{
    const first={id:'drawing-1',kind:'drawing',mimeType:'image/png',blob:new Blob()} as const;
    const other={id:'photo-1',kind:'photo',mimeType:'image/jpeg',blob:new Blob()} as const;
    const stored={...emptyInk,photos:[first,other],drawingId:'drawing-2',strokes:[[{x:10,y:20}]]};
    expect(removeSubmittedInk(stored,new Set(['different-draft']))).toBe(stored);
    expect(removeSubmittedInk(stored,new Set(['drawing-1']))).toEqual({
      ...stored,photos:[other],
    });
    expect(removeSubmittedInk(stored,new Set(['drawing-1','drawing-2']))).toEqual({
      ...emptyInk,photos:[other],drawingId:undefined,
    });
    const queued={...stored,queuedText:''};
    expect(removeSubmittedInk(queued,new Set(['drawing-1']),{question:''})).toBe(queued);
    expect(removeSubmittedInk(queued,new Set(['drawing-1','drawing-2','photo-1']),{question:''})).toEqual({
      ...emptyInk,drawingId:undefined,queuedText:undefined,queuedAcceptedSpans:undefined,
    });
  });

  it('checks competing photo and ink edits against the latest attachment count',()=>{
    const image=(id:string)=>({id,kind:'photo',mimeType:'image/jpeg',blob:new Blob()} as const);
    const initial={...emptyInk,photos:[image('one'),image('two')]};
    const addPhoto=(draft:InkDraft)=>({...draft,photos:[...draft.photos,image('three')]});
    const addStroke=(draft:InkDraft)=>({...draft,strokes:[[{x:10,y:20}]]});
    const photoFirst=editInkDraft(initial,addPhoto),inkFirst=editInkDraft(initial,addStroke);
    expect(photoFirst.photos).toHaveLength(3);
    expect(inkFirst.strokes).toHaveLength(1);
    expect(editInkDraft(photoFirst,addStroke)).toBe(photoFirst);
    expect(editInkDraft(inkFirst,addPhoto)).toBe(inkFirst);
    const queued={...inkFirst,queuedText:''};
    const removePhoto=(draft:InkDraft)=>({...draft,photos:draft.photos.slice(1)});
    expect(editInkDraft(queued,removePhoto)).toBe(queued);
    expect(editInkDraft({...queued,queuedText:undefined},removePhoto).photos).toHaveLength(1);
  });

  it('keeps current references and bounds detached drawing revisions without counting them as attachments',()=>{
    const image=(id:string)=>({id,kind:'drawing',mimeType:'image/png',blob:new Blob()} as const);
    const referenced=['keep'];
    let draft:InkDraft={...emptyInk,inlineImages:true,photos:[image('keep')]};
    for(let revision=0;revision<20;revision++){
      draft={...draft,photos:keepDraftImage(draft,image('revision-'+revision),referenced)};
    }
    expect(draft.photos.map(item=>item.id)).toEqual([
      'keep',...Array.from({length:12},(_,index)=>'revision-'+(index+8)),
    ]);
    const addStroke=(current:InkDraft)=>({...current,strokes:[[{x:10,y:20}]]});
    expect(editInkDraft(draft,addStroke,referenced)).not.toBe(draft);
    expect(editInkDraft(draft,addStroke,['keep','revision-18','revision-19'])).toBe(draft);
  });

  it('finishes only the stage that was published and preserves unrelated working ink',()=>{
    const strokes=[[{x:4,y:8}]];
    const drawn={...emptyInk,strokes,width:3,accent:false,stagedDrawing:{id:'first'}};
    expect(finishStagedDrawing(drawn,'different')).toBe(drawn);
    expect(finishStagedDrawing(drawn,'first')).toMatchObject({strokes:[],stagedDrawing:undefined});
    const editing={...drawn,editingDrawing:{id:'old',strokes,width:2,accent:true},
      stagedDrawing:{id:'replacement',replacesId:'old'}};
    expect(finishStagedDrawing(editing,'replacement')).toMatchObject({strokes,editingDrawing:undefined,stagedDrawing:undefined});
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
