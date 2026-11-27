import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createInkRecognizer, TUTOR_MODEL_ASSET_SET} from './inkRecognizer';
import {InkSession} from './inkSession';
import {matchPartialSymbols} from './partialSymbolMatcher';
import {canAcceptInkCandidate, canAutoInsert, classifyInkResult, decideRecognition, sameEditTarget, sameInkSnapshot} from './recognitionPolicy';
import {INK_VIEWPORT} from './TutorInkPad';
import type {EditTarget, InkInferenceResult, InkPoint, InkReadiness, InkResult, InkSnapshot, InkStroke} from './types';

const PREVIEW_PERIOD=80;

type Options={
  scopeKey:string;enabled:boolean;automatic:boolean;readOnly:boolean;composing:boolean;
  target:()=>EditTarget;
  insert:(id:string,target:EditTarget)=>boolean;
};

export function useTutorInputAssist(options:Options) {
  const config=useRef(options);config.current=options;
  const session=useRef<InkSession|null>(null);
  const recognizer=useRef<ReturnType<typeof createInkRecognizer>|null>(null);
  const samples=useRef(new Map<number,InkSnapshot>());
  const [readiness,setReadiness]=useState<InkReadiness>('unloaded');
  const workerState=useRef<InkReadiness>('unloaded');
  const wasEnabled=useRef(options.enabled);
  const [drawing,setDrawing]=useState(false), drawingNow=useRef(false);
  const [picker,setPicker]=useState(false), pickerTarget=useRef<EditTarget|null>(null);
  const [keepDrawing,setKeepDrawing]=useState(false), keepDrawingNow=useRef(false);
  const [snapshot,setSnapshot]=useState<InkSnapshot|null>(null);
  const [result,setResult]=useState<InkResult|null>(null), currentResult=useRef<InkResult|null>(null);
  const [error,setError]=useState('');
  const [recent,setRecent]=useState<readonly string[]>([]);
  const candidateHeld=useRef(false);
  const pressedCandidate=useRef<{id:string; result:InkResult}|null>(null);
  const previousPreviewRevision=useRef(-1),previousResultRevision=useRef(-1);
  const frame=useRef<number|undefined>(undefined),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const submissionAt=useRef(-Infinity);

  function display(value:InkResult|null) {
    currentResult.current=value;
    setResult(value);
  }
  function paint(immediate=false) {
    if(immediate) {
      if(frame.current!==undefined)cancelAnimationFrame(frame.current);
      frame.current=undefined;
      setSnapshot(session.current?.snapshot(performance.now())??null);
    }else if(frame.current===undefined)frame.current=requestAnimationFrame(()=>{
      frame.current=undefined;
      setSnapshot(session.current?.snapshot(performance.now())??null);
    });
  }
  function fresh() {
    session.current=new InkSession(config.current.target(),crypto.randomUUID(),TUTOR_MODEL_ASSET_SET,INK_VIEWPORT);
    paint(true);
  }
  function clearWork() {
    clearTimeout(timer.current);timer.current=undefined;
    recognizer.current?.cancel();
    samples.current.clear();
    previousPreviewRevision.current=-1;previousResultRevision.current=-1;
    submissionAt.current=-Infinity;
    candidateHeld.current=false;pressedCandidate.current=null;
    display(null);
  }
  function stop() {
    clearWork();
    session.current?.cancel();session.current=null;
    pickerTarget.current=null;setPicker(false);
    drawingNow.current=false;setDrawing(false);
    setError('');
    paint(true);
  }
  function pause() {
    if(!drawingNow.current&&!pickerTarget.current)return;
    clearWork();
    session.current?.pause();
    pickerTarget.current=null;setPicker(false);
    drawingNow.current=false;setDrawing(false);
    setError('');
    paint(true);
  }
  function received(raw:InkInferenceResult) {
    const active=session.current, opts=config.current;
    const requested=samples.current.get(raw.inkRevision);
    if(!active||!drawingNow.current||candidateHeld.current||!opts.enabled||opts.readOnly||opts.composing||!requested)return;
    if(raw.sessionId!==requested.sessionId||raw.inkEpoch!==requested.inkEpoch||raw.assetSetVersion!==requested.assetSetVersion||
      raw.sampledAtMs!==requested.sampledAtMs||!sameEditTarget(raw.target,requested.target)||!sameEditTarget(raw.target,opts.target()))return;
    const current=active.snapshot(performance.now());
    const decision=decideRecognition(requested,raw,matchPartialSymbols(requested));
    const validity=classifyInkResult(current,decision,{nowMs:performance.now(),activePointer:active.activePointer,
      previousPreviewRevision:previousPreviewRevision.current,previousResultRevision:previousResultRevision.current});
    if(validity==='stale')return;
    if(validity==='preview')previousPreviewRevision.current=decision.inkRevision;
    else {
      previousResultRevision.current=decision.inkRevision;
      if(active.activePointer===null)active.phase=decision.completionDecision==='finished'?'choice_required':'awaiting_more_ink';
    }
    display(decision);
    if(validity==='exact'&&canAutoInsert(current,decision,{enabled:opts.automatic,activePointer:active.activePointer,
      choiceLocked:active.explicitChoiceLocked,readOnly:opts.readOnly,composing:opts.composing})) {
      const symbol=decision.recognized[0];
      if(symbol)accept(symbol.symbolId,current.target);
    }
  }
  function submit() {
    timer.current=undefined;submissionAt.current=performance.now();
    const active=session.current, opts=config.current;
    if(!active||!drawingNow.current||!opts.enabled||opts.readOnly||opts.composing||candidateHeld.current)return;
    const request=active.snapshot(submissionAt.current);
    if(!request.strokes.length||!sameEditTarget(request.target,opts.target()))return;
    if(request.overBudget) {display(null);return;}
    // Geometry remains usable on its own while the worker starts or when model files are unavailable.
    const partial=matchPartialSymbols(request);
    if(partial.exactMatches?.length||partial.possibleCompletions.length||workerState.current!=='ready') {
      const previous=currentResult.current;
      const partialOnly=decideRecognition(request,undefined,partial);
      if(workerState.current!=='ready'||!previous?.recognized.some(item=>item.source==='model')||active.activePointer===null)display(partialOnly);
    }
    samples.current.set(request.inkRevision,request);
    while(samples.current.size>6)samples.current.delete(samples.current.keys().next().value!);
    if(workerState.current==='ready')recognizer.current?.submit(request);
  }
  function schedule(immediate=false) {
    if(immediate) {clearTimeout(timer.current);submit();return;}
    if(timer.current!==undefined)return;
    const delay=PREVIEW_PERIOD-(performance.now()-submissionAt.current);
    if(delay<=0)submit();
    else timer.current=setTimeout(submit,delay);
  }
  function openDraw() {
    const opts=config.current;
    if(opts.readOnly||opts.composing)return;
    pickerTarget.current=null;setPicker(false);
    drawingNow.current=true;setDrawing(true);
    setError('');
    if(session.current) {
      session.current.resume(opts.target());
      clearWork();
      paint(true);
    }else fresh();
    if(!opts.enabled)return;
    if(!recognizer.current)recognizer.current=createInkRecognizer({onReadiness:(state:InkReadiness)=>{
      workerState.current=state;setReadiness(state);
      if(state==='ready'||state==='unavailable')schedule(true);
    },onResult:received});
    recognizer.current.prepare();
    schedule(true);
  }
  function openPicker() {
    if(config.current.readOnly||config.current.composing)return;
    session.current?.lockChoice();
    pickerTarget.current=config.current.target();
    setError('');
    setPicker(true);
  }
  function closePicker() {
    pickerTarget.current=null;
    setPicker(false);
  }
  function accept(id:string,target:EditTarget) {
    const opts=config.current;
    if(opts.readOnly||opts.composing||!sameEditTarget(target,opts.target()))return;
    const active=session.current;
    const previousPhase=active?.phase;
    if(active) {active.lockChoice();active.phase='committing';}
    if(!opts.insert(id,target)) {
      if(active&&previousPhase)active.phase=previousPhase;
      setError('Choose a place in the answer with room for this symbol.');
      return;
    }
    setRecent(old=>[id,...old.filter(value=>value!==id)].slice(0,12));
    closePicker();
    if(keepDrawingNow.current&&drawingNow.current&&opts.enabled) {
      clearWork();
      fresh();
      setError('');
    }else stop();
  }
  function pressCandidate(id:string) {
    session.current?.lockChoice();
    const answer=currentResult.current;
    if(!answer)return;
    candidateHeld.current=true;
    pressedCandidate.current={id,result:answer};
  }
  function releaseCandidate(cancelled=false) {
    candidateHeld.current=false;
    if(cancelled)pressedCandidate.current=null;
  }
  function acceptCandidate(id:string, pointerClick=false) {
    // Accessibility activation has no pointer receipt. A cancelled pointer press
    // must not override the candidate that was activated by keyboard or AT.
    const presented=pointerClick?pressedCandidate.current:null;
    releaseCandidate(true);
    const active=session.current, currentDisplayed=currentResult.current, opts=config.current;
    if(!active||!currentDisplayed||pickerTarget.current||!opts.enabled)return;
    if(pointerClick&&!presented)return;
    if(presented&&(presented.id!==id||!sameInkSnapshot(presented.result,currentDisplayed)||
      presented.result.sampledAtMs!==currentDisplayed.sampledAtMs))return;
    const expected=presented?.result??currentDisplayed;
    const current=active.snapshot(performance.now());
    if(canAcceptInkCandidate(current,expected,id,{activePointer:active.activePointer,readOnly:opts.readOnly,composing:opts.composing}))accept(id,current.target);
  }
  function discardInk(change:'clear'|'undo') {
    clearWork();
    session.current?.[change]();
    paint(true);
    if(change==='undo')schedule(true);
  }
  function replacePaperInk(paths:readonly (readonly InkPoint[])[]|null) {
    const active=session.current, opts=config.current;
    if(!active||!drawingNow.current||!opts.enabled||opts.readOnly||opts.composing||pickerTarget.current)return;
    clearWork();
    active.replacePaperInk(paths);
    paint(true);
    if(paths?.length)schedule(true);
  }
  function onBegin(id:number,type:InkStroke['pointerType'],point:InkPoint) {
    if(config.current.readOnly||config.current.composing||pickerTarget.current)return;
    const active=session.current;
    candidateHeld.current=false;
    pressedCandidate.current=null;
    if(active?.begin(id,type,point)){setError('');paint();schedule();}
  }
  function onMove(id:number,point:InkPoint) {
    if(session.current?.move(id,point)){paint();schedule();}
  }
  function onEnd(id:number,point:InkPoint) {
    if(session.current?.end(id,point)){paint(true);schedule(true);}
  }
  function onInterrupt(id:number) {
    if(!session.current?.interrupt(id))return;
    clearWork();paint(true);schedule(true);
  }
  useLayoutEffect(()=>{
    stop();
    setRecent([]);
    setReadiness('unloaded');
    keepDrawingNow.current=false;setKeepDrawing(false);
    return ()=>{
      clearTimeout(timer.current);
      if(frame.current!==undefined)cancelAnimationFrame(frame.current);
      recognizer.current?.dispose();recognizer.current=null;
      workerState.current='unloaded';
      session.current=null;
      samples.current.clear();
    };
  // Scope changes synchronously invalidate pending work.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[options.scopeKey]);
  useLayoutEffect(()=>{
    const disabled=wasEnabled.current&&!options.enabled;
    wasEnabled.current=options.enabled;
    if(disabled) {
      recognizer.current?.dispose();recognizer.current=null;
      workerState.current='unloaded';setReadiness('unloaded');
      stop();
    }else if(options.readOnly||options.composing)pause();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[options.enabled,options.readOnly,options.composing]);
  useEffect(()=>{
    const visibility=()=>{if(document.visibilityState==='hidden')pause();};
    window.addEventListener('blur',pause);
    document.addEventListener('visibilitychange',visibility);
    return ()=>{
      window.removeEventListener('blur',pause);
      document.removeEventListener('visibilitychange',visibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const actionable=Boolean(snapshot&&result&&snapshot.inkRevision===result.inkRevision&&snapshot.inkEpoch===result.inkEpoch&&
    snapshot.sessionId===result.sessionId&&session.current?.activePointer===null&&!options.composing&&!options.readOnly);
  return {drawing,picker,keepDrawing,snapshot,actionable,readiness,error,recent,openDraw,openPicker,closePicker,pause,stop,
    recognized:result?.recognized.map(value=>value.symbolId)??[],
    completions:result?.possibleCompletions.map(value=>value.symbolId)??[],
    onBegin,onMove,onEnd,onInterrupt,replacePaperInk,
    onKeepDrawing:()=>{keepDrawingNow.current=!keepDrawingNow.current;setKeepDrawing(keepDrawingNow.current);},
    onUndo:()=>discardInk('undo'),onClear:()=>discardInk('clear'),
    lockAutomatic:()=>{session.current?.lockChoice();},
    pressCandidate,releaseCandidate,
    onAccept:acceptCandidate,
    onPick:(id:string)=>{if(pickerTarget.current)accept(id,pickerTarget.current);},
  };
}
