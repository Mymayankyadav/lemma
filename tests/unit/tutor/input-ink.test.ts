import {describe,expect,it} from 'vitest';
import {InkSession,INK_LIMITS} from '../../../src/features/tutor/input/inkSession';
import {normalizeInkGeometry,resampleInkPath} from '../../../src/features/tutor/input/inkGeometry';
import {matchPartialSymbols,type PartialMatch} from '../../../src/features/tutor/input/partialSymbolMatcher';
import {canAcceptInkCandidate,canAutoInsert,classifyInkResult,decideRecognition,passesInkReleaseRate,type InkQualification}
  from '../../../src/features/tutor/input/recognitionPolicy';
import type {EditTarget,InkInferenceResult,InkPoint,InkSnapshot} from '../../../src/features/tutor/input/types';

const target:EditTarget={scopeKey:'owner:2/path/checkpoint',mountId:'mount-a',editorRevision:6,selectionRevision:2,modeRevision:1};
const paper={width:300,height:180},asset='test-asset-version';
const pt=(x:number,y:number,t:number,pressure=.6):InkPoint=>({x,y,t,pressure});
const session=()=>new InkSession(target,'session',asset,paper);
type XY=[number,number];
const left:XY[]=[[83,18],[17,48],[83,78]],right:XY[]=[[17,18],[83,48],[17,78]];
const bar:XY[]=[[17,92],[83,92]], up:XY[]=[[18,34],[82,34]], down:XY[]=[[18,67],[82,67]];
const outer:XY[]=[[83,18],[47,18],[26,25],[17,43],[20,61],[35,73],[55,77],[83,77]];
const inner:XY[]=[[19,48],[72,47]],slash:XY[]=[[72,12],[31,89]];

function trace(active:InkSession,...paths:XY[][]) {
  let time=1;
  for(const path of paths) {
    const [first,...next]=path;
    const end=next.pop()??first;
    active.begin(1,'pen',pt(...first,time++));
    for(const at of next)active.move(1,pt(...at,time++));
    active.end(1,pt(...end,time++));
  }
  return active.snapshot(100);
}
const complete=(id:string):PartialMatch=>({completionDecision:'finished',possibleCompletions:[],finishedSymbols:[id]});
const qualified:InkQualification={assetSetVersion:asset,outputClassCount:3,temperature:1,minimumConfidence:.9,
  minimumMargin:.3,maximumUnknownMass:.05,qualifiedSymbols:['not-equal'],heldOut:{accepted:4000,errors:0,writers:20,devices:5}};
const guard={activePointer:null,readOnly:false,composing:false,enabled:true,choiceLocked:false};
function inference(snapshot:InkSnapshot,scores:[number,number,number]=[.98,.015,.005]):InkInferenceResult {
  const {target,assetSetVersion,sessionId,inkEpoch,inkRevision,sampledAtMs}=snapshot;
  return {target,assetSetVersion,sessionId,inkEpoch,inkRevision,sampledAtMs,scoreKind:'probability',rawScores:[
    {classId:'relation',symbolId:'not-equal',score:scores[0]},
    {classId:'alternative',symbolId:'equal',score:scores[1]},
    {classId:'unmapped',score:scores[2]},
  ]};
}

describe('bounded single-symbol ink session',()=>{
  it('retains chronological geometry, ownership, pressure and the exact pointer-up endpoint',()=>{
    const active=session();
    expect(active.begin(7,'touch',pt(10,12,10,1.5))).toBe(true);
    const before=active.snapshot(100);
    expect(active.move(3,pt(123,45,11))).toBe(false);
    active.move(7,pt(22,36,9,.2));
    active.end(7,pt(30,40,12,.5));
    const after=active.snapshot(120);
    expect(before.strokes[0]).toEqual({pointerType:'touch',points:[pt(10,12,10,1)]});
    expect(before.completedRevision).toBeNull();
    expect(after.strokes[0].points).toEqual([pt(10,12,10,1),pt(22,36,10,.2),pt(30,40,12,.5)]);
    expect(after.completedRevision).toBe(after.inkRevision);
    expect(active.activePointer).toBeNull();
  });

  it('preserves a dot, rejects non-finite input and does not give abnormal endings a completion receipt',()=>{
    const active=session();
    const dot=trace(active,[[15,15]]);
    expect(dot.strokes).toHaveLength(1);
    expect(dot.strokes[0].points.every(point=>point.x===15&&point.y===15)).toBe(true);
    active.begin(2,'pen',pt(40,70,10));
    expect(active.end(2,pt(NaN,80,11))).toBe(true);
    expect(active.snapshot(120)).toMatchObject({completedRevision:null,interrupted:true});
    expect(active.activePointer).toBeNull();
    expect(active.begin(3,'pen',pt(12,Infinity,12))).toBe(false);
    expect(active.snapshot(121).strokes).toHaveLength(2);
  });

  it('fences multitouch and cancel, then rebinds retained ink only through an explicit resume',()=>{
    const active=session();
    active.begin(4,'touch',pt(15,30,2));
    const sample=active.snapshot(80);
    expect(active.begin(5,'touch',pt(90,30,3))).toBe(false);
    expect(active.activePointer).toBe(4);
    active.end(4,pt(32,60,4));
    expect(active.snapshot(90)).toMatchObject({completedRevision:null,interrupted:true,inkEpoch:sample.inkEpoch+1});
    active.pause();
    expect(active.begin(6,'pen',pt(15,30,5))).toBe(false);
    active.resume({...target,selectionRevision:3});
    const rebound=active.snapshot(110);
    expect(rebound.target.selectionRevision).toBe(3);
    expect(rebound.strokes).toHaveLength(1);
    expect(rebound.completedRevision).toBeNull();
    active.cancel();
    expect(active.snapshot(120).strokes).toHaveLength(0);
    expect(active.phase).toBe('paused');
  });

  it('rebases both axes uniformly on resize and invalidates Undo and Clear',()=>{
    const active=session();
    const old=trace(active,left);
    active.resize({width:200,height:400});
    const resized=active.snapshot(102);
    const prior=normalizeInkGeometry(old.strokes)!.bounds,next=normalizeInkGeometry(resized.strokes)!.bounds;
    expect(next.width/next.height).toBeCloseTo(prior.width/prior.height);
    expect(resized.completedRevision).toBeNull();
    expect(resized.inkEpoch).toBeGreaterThan(old.inkEpoch);
    active.undo();
    const undone=active.snapshot(104);
    expect(undone.strokes).toHaveLength(0);
    expect(undone.inkEpoch).toBeGreaterThan(resized.inkEpoch);
    active.clear();
    expect(active.snapshot(105).inkRevision).toBeGreaterThan(undone.inkRevision);
  });

  it('resamples a complete path and flags the point and stroke limits',()=>{
    const active=session();
    active.begin(0,'mouse',pt(0,10,0));
    for(let i=1;i<600;i++)active.move(0,pt(i/2,20+Math.sin(i)*9,i));
    active.end(0,pt(299,70,600));
    const first=active.snapshot(650);
    expect(first.overBudget).toBe(true);
    expect(first.strokes[0].points.length).toBeLessThanOrEqual(INK_LIMITS.pointsPerStroke);
    expect(first.strokes[0].points.at(-1)).toEqual(pt(299,70,600));
    for(let i=1;i<INK_LIMITS.strokes+3;i++)trace(active,left);
    expect(active.snapshot(700).strokes).toHaveLength(INK_LIMITS.strokes);
    expect(active.snapshot(700).overBudget).toBe(true);
    active.clear();
    expect(active.snapshot(710).overBudget).toBe(false);
    const straight=resampleInkPath([pt(0,0,0),pt(1,0,1),pt(12,0,12)],4);
    expect(straight.map(point=>point.x)).toEqual([0,4,8,12]);
  });

  it('holds a choice lock through an in-progress gesture and releases it only on a later valid stroke',()=>{
    const active=session();
    active.begin(1,'pen',pt(12,30,0));
    active.lockChoice();
    active.end(1,pt(30,40,1));
    expect(active.explicitChoiceLocked).toBe(true);
    active.undo();
    expect(active.explicitChoiceLocked).toBe(true);
    trace(active,left);
    expect(active.explicitChoiceLocked).toBe(false);
  });
});

describe('independent geometric completion',()=>{
  it.each([
    ['less-than-or-equal',[left]],
    ['greater-than-or-equal',[right]],
    ['not-equal',[down,up]],
    ['not-element-of',[inner,outer.toReversed()]],
    ['subset-or-equal',[outer]],
    ['superset-or-equal',[outer.map(([x,y])=>[100-x,y] as XY)]],
  ] as const)('finds %s without classifier help', (symbolId,paths)=>{
    expect(matchPartialSymbols(trace(session(),...paths)).possibleCompletions).toEqual(
      expect.arrayContaining([expect.objectContaining({symbolId,requiresExplicitSelection:true})]));
  });

  it('accounts for reordered, split and noisy strokes while preserving whole-symbol proportions',()=>{
    const noisy:XY[]=[[81,20],[48,33],[16,48],[53,63],[86,80]];
    for(const shape of [[noisy],[left.slice(0,2),left.slice(1).reverse()],[noisy.toReversed()]]){
      expect(matchPartialSymbols(trace(session(),...shape)).possibleCompletions.some(row=>row.symbolId==='less-than-or-equal')).toBe(true);
    }
    expect(matchPartialSymbols(trace(session(),bar,left)).possibleCompletions.some(row=>row.symbolId==='less-than-or-equal')).toBe(false);
  });

  it('finds a partial glyph even if only one stroke is drawn and abstains on tiny marks',()=>{
    expect(matchPartialSymbols(trace(session(),up)).possibleCompletions.some(row=>row.symbolId==='not-equal')).toBe(true);
    const tiny=trace(session(),[[12,12],[14,13],[12,14]]);
    expect(matchPartialSymbols(tiny)).toEqual({completionDecision:'unknown',possibleCompletions:[],finishedSymbols:[]});
  });

  it('requires independent whole geometry to call a completed relation finished',()=>{
    const complete=trace(session(),slash,up,down);
    expect(matchPartialSymbols(complete)).toMatchObject({
      completionDecision:'finished',possibleCompletions:[],finishedSymbols:['not-equal'],
      exactMatches:[{source:'geometry',symbolId:'not-equal'}],
    });
    expect(matchPartialSymbols(trace(session(),up,down)).completionDecision).toBe('extendable');
  });
});

describe('recognized candidates and acceptance',()=>{
  it('never treats unqualified raw scores, wrong assets, or missing score mass as calibrated confidence',()=>{
    const snapshot=trace(session(),up,down,slash);
    const partial=complete('not-equal');
    const raw=inference(snapshot);
    for(const options of [undefined,{...qualified,assetSetVersion:'different-assets'},{...qualified,outputClassCount:4}]){
      const result=decideRecognition(snapshot,raw,partial,options);
      expect(result.identityDecision).toBe('uncertain');
      expect(canAutoInsert(snapshot,result,guard)).toBe(false);
      expect(canAcceptInkCandidate(snapshot,result,'not-equal',guard)).toBe(true);
      expect(result.recognized[0]?.calibratedConfidence).toBeUndefined();
    }
    expect(decideRecognition(snapshot,inference(snapshot,[.92,.01,.07]),partial,qualified).identityDecision).toBe('uncertain');
    expect(decideRecognition(snapshot,inference(snapshot,[.51,.48,.01]),partial,qualified).identityDecision).toBe('uncertain');
  });

  it('requires both gates, exact pointer-up and a writable live target; offers independent explicit completions',()=>{
    const snapshot=trace(session(),up,down,slash);
    const raw=inference(snapshot);
    const result=decideRecognition(snapshot,raw,complete('not-equal'),qualified);
    expect(canAutoInsert(snapshot,result,guard)).toBe(true);
    for(const disallowed of [{enabled:false},{activePointer:1},{readOnly:true},{composing:true},{choiceLocked:true}]){
      expect(canAutoInsert(snapshot,result,{...guard,...disallowed})).toBe(false);
    }
    expect(canAutoInsert({...snapshot,completedRevision:null},result,guard)).toBe(false);
    expect(canAutoInsert({...snapshot,overBudget:true},result,guard)).toBe(false);
    expect(canAutoInsert({...snapshot,interrupted:true},result,guard)).toBe(false);
    const earlier={...snapshot,inkRevision:snapshot.inkRevision-1};
    expect(canAcceptInkCandidate(earlier,result,'not-equal',guard)).toBe(false);
    expect(canAcceptInkCandidate(snapshot,result,'nonexistent',guard)).toBe(false);
    const angle=trace(session(),left);
    const geometrical=decideRecognition(angle,undefined,matchPartialSymbols(angle));
    expect(geometrical.recognized).toMatchObject([{source:'geometry',symbolId:'less-than'}]);
    expect(geometrical.completionDecision).toBe('extendable');
    expect(canAcceptInkCandidate(angle,geometrical,'less-than-or-equal',guard)).toBe(true);
    expect(canAutoInsert(angle,geometrical,guard)).toBe(false);
  });

  it.each([
    ['less-than',[left]],['greater-than',[right]],['equal',[up,down]],['not-equal',[up,down,slash]],
  ] as const)('offers %s as an explicit geometry match without model confidence',(symbolId,paths)=>{
    const snapshot=trace(session(),...paths),partial=matchPartialSymbols(snapshot);
    const result=decideRecognition(snapshot,undefined,partial,qualified);
    expect(result.recognized).toMatchObject([{source:'geometry',symbolId}]);
    expect(result.recognized[0]).not.toHaveProperty('rankScore');
    expect(result.recognized[0]).not.toHaveProperty('calibratedConfidence');
    expect(canAcceptInkCandidate(snapshot,result,symbolId,guard)).toBe(true);
    expect(canAutoInsert(snapshot,result,guard)).toBe(false);
    const contradictory=decideRecognition(snapshot,inference(snapshot),partial,qualified);
    expect(canAutoInsert(snapshot,contradictory,guard)).toBe(false);
  });
  it('abstains on unsupported or strongly distorted geometry without hiding independent extensions',()=>{
    const scribble=trace(session(),[[12,40],[75,160],[180,10],[12,40],[150,170]]);
    const distorted=trace(session(),[[83,18],[47,38],[34,51],[49,83],[90,105]]);
    expect(matchPartialSymbols(scribble).exactMatches).toBeUndefined();
    expect(matchPartialSymbols(distorted).exactMatches).toBeUndefined();
    expect(matchPartialSymbols(trace(session(),left)).possibleCompletions.map(row=>row.symbolId)).toContain('less-than-or-equal');
    expect(matchPartialSymbols(trace(session(),left,bar)).exactMatches).toBeUndefined();
  });
  it('offers a modestly tilted relation as a choice without accepting its partial or ambiguous ink',()=>{
    const tilted:XY[]=[[85,21],[17,46],[81,80]];
    const snapshot=trace(session(),tilted);
    const result=decideRecognition(snapshot,undefined,matchPartialSymbols(snapshot),qualified);
    expect(result.recognized).toMatchObject([{source:'geometry',symbolId:'less-than'}]);
    expect(result.possibleCompletions).toEqual(expect.arrayContaining([
      expect.objectContaining({symbolId:'less-than-or-equal',requiresExplicitSelection:true}),
    ]));
    expect(canAcceptInkCandidate(snapshot,result,'less-than',guard)).toBe(true);
    expect(canAutoInsert(snapshot,result,guard)).toBe(false);
    const unfinished=trace(session(),[tilted[0],tilted[1],[46,62]]);
    expect(matchPartialSymbols(unfinished).exactMatches).toBeUndefined();
    const flat=trace(session(),[[83,34],[17,48],[83,62]]);
    expect(matchPartialSymbols(flat).exactMatches).toBeUndefined();
  });

  it('admits only increasing bounded-age append previews and invalidates previous epochs, targets and assets',()=>{
    const active=session();
    active.begin(1,'pen',pt(12,30,0));
    const first=active.snapshot(100);
    active.move(1,pt(15,42,1));
    const current=active.snapshot(120);
    const frame={nowMs:160,activePointer:1,previousPreviewRevision:-1,previousResultRevision:-1};
    expect(classifyInkResult(current,first,frame)).toBe('preview');
    expect(classifyInkResult(current,first,{...frame,nowMs:400})).toBe('stale');
    expect(classifyInkResult(current,first,{...frame,previousPreviewRevision:first.inkRevision})).toBe('stale');
    expect(classifyInkResult(current,first,{...frame,activePointer:null})).toBe('stale');
    expect(classifyInkResult(current,current,frame)).toBe('exact');
    expect(classifyInkResult(current,current,{...frame,previousResultRevision:current.inkRevision})).toBe('stale');
    for(const bad of [
      {...first,target:{...target,scopeKey:'other-account'}},
      {...first,target:{...target,editorRevision:7}},
      {...first,target:{...target,selectionRevision:3}},
      {...first,target:{...target,modeRevision:2}},
      {...first,target:{...target,mountId:'new-mount'}},
      {...first,sessionId:'other'},
      {...first,assetSetVersion:'different'},
    ])expect(classifyInkResult(current,bad,frame)).toBe('stale');
    active.undo();
    expect(classifyInkResult(active.snapshot(180),current,frame)).toBe('stale');
  });

  it('requires release statistics rather than accepting a small perfect demonstration',()=>{
    expect(passesInkReleaseRate(100,0)).toBe(false);
    expect(passesInkReleaseRate(4000,0)).toBe(true);
    expect(passesInkReleaseRate(4000,4)).toBe(false);
  });
});
