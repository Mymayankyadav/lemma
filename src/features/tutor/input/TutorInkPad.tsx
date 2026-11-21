import {useEffect, useRef, type PointerEvent} from 'react';
import {Keyboard, LoaderCircle, Sigma, Trash2, Undo2} from 'lucide-react';
import {Link} from 'react-router';
import {Button, IconButton} from '../../../ui/v7/components';
import {symbolById, type SymbolDefinition} from './symbolCatalog';
import type {InkPoint, InkStroke} from './types';

export const INK_VIEWPORT={width:320,height:116};
const VISIBLE_CHOICES_PER_GROUP=3;

export function TutorInkPad({enabled,strokes,readiness,recognized,completions,actionable,keepDrawing,overBudget,error,
  onBegin,onMove,onEnd,onInterrupt,onUndo,onClear,onClose,onBrowse,onKeepDrawing,onLockAutomatic,onPressCandidate,onReleaseCandidate,onAccept}:{
  enabled:boolean;strokes:readonly InkStroke[];readiness:'unloaded'|'loading'|'ready'|'unavailable';
  recognized:readonly string[];completions:readonly string[];actionable:boolean;keepDrawing:boolean;overBudget:boolean;error:string;
  onBegin:(id:number,type:InkStroke['pointerType'],point:InkPoint)=>void;
  onMove:(id:number,point:InkPoint)=>void;onEnd:(id:number,point:InkPoint)=>void;onInterrupt:(id:number)=>void;
  onUndo:()=>void;onClear:()=>void;onClose:()=>void;onBrowse:()=>void;onKeepDrawing:()=>void;
  onLockAutomatic:()=>void;onPressCandidate:(id:string)=>void;
  onReleaseCandidate:(cancelled?:boolean)=>void;onAccept:(id:string,pointerClick?:boolean)=>void;
}) {
  const owned=useRef<number|null>(null);
  const paper=useRef<SVGSVGElement>(null);
  const strokeBox=useRef<DOMRect|null>(null);
  const interrupted=useRef(onInterrupt);
  interrupted.current=onInterrupt;
  useEffect(()=>{
    const node=paper.current;
    if(!node||typeof ResizeObserver==='undefined')return;
    let previous=node.getBoundingClientRect();
    const watcher=new ResizeObserver(()=>{
      const next=node.getBoundingClientRect();
      if((next.width!==previous.width||next.height!==previous.height)&&owned.current!==null){
        interrupted.current(owned.current);owned.current=null;strokeBox.current=null;
      }
      previous=next;
    });
    watcher.observe(node);
    return ()=>watcher.disconnect();
  },[enabled]);
  function point(event:PointerEvent<SVGSVGElement>,sample:Pick<PointerEvent,'clientX'|'clientY'|'timeStamp'|'pressure'>=event):InkPoint {
    const box=strokeBox.current??event.currentTarget.getBoundingClientRect();
    const scale=Math.min(box.width/INK_VIEWPORT.width,box.height/INK_VIEWPORT.height)||1;
    return {x:(sample.clientX-box.x-(box.width-INK_VIEWPORT.width*scale)/2)/scale,
      y:(sample.clientY-box.y-(box.height-INK_VIEWPORT.height*scale)/2)/scale,t:sample.timeStamp,pressure:sample.pressure};
  }
  function cancel(id:number) {
    if(owned.current===id){owned.current=null;strokeBox.current=null;}
    onInterrupt(id);
  }
  const shownGlyphs=new Set<string>();
  function collectChoices(ids:readonly string[]) {
    const choices=[];
    for(const id of ids){
      const symbol=symbolById(id);
      if(!symbol||shownGlyphs.has(symbol.glyph))continue;
      shownGlyphs.add(symbol.glyph);
      choices.push(symbol);
      if(choices.length===VISIBLE_CHOICES_PER_GROUP)break;
    }
    return choices;
  }
  // A possible extension owns its glyph when the model also offers it as a match.
  const extensionChoices=collectChoices(completions);
  const matchChoices=collectChoices(recognized);
  function candidates(label:string,choices:readonly SymbolDefinition[]) {
    if(!choices.length)return null;
    return <div className="tutor-ink-candidates" role="group" aria-label={label}>
      {choices.map(symbol=>
        <button key={symbol.id} type="button" disabled={!actionable}
          aria-label={label+' '+symbol.name} onFocus={onLockAutomatic} onBlur={()=>onReleaseCandidate(true)}
          onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&!event.repeat)onPressCandidate(symbol.id);}}
          onKeyUp={event=>{if(event.key==='Enter'||event.key===' ')requestAnimationFrame(()=>onReleaseCandidate());}}
          onPointerDown={event=>{
            if(event.button!==0||!event.isPrimary)return;
            event.preventDefault();onPressCandidate(symbol.id);
          }}
          onPointerLeave={()=>onReleaseCandidate()} onPointerCancel={()=>onReleaseCandidate(true)}
          onPointerUp={()=>requestAnimationFrame(()=>onReleaseCandidate())}
          onClick={event=>onAccept(symbol.id,event.detail>0)}>{symbol.glyph}</button>)}
    </div>;
  }
  const loading=readiness==='loading';
  const feedback=error || (overBudget ? 'Clear to draw one symbol, or browse symbols.' :
    readiness==='unavailable' ? 'Recognition unavailable. Browse symbols.' : '');
  return <section className="tutor-symbol-ink" aria-label="Symbol recognition">
    {enabled ? <>
      <svg ref={paper} className="tutor-symbol-paper" role="img" aria-label="Draw one symbol" viewBox={`0 0 ${INK_VIEWPORT.width} ${INK_VIEWPORT.height}`}
        onPointerDown={event=>{
          if(event.button!==0)return;
          event.preventDefault();
          if(owned.current!==null){cancel(owned.current);return;}
          if(!event.isPrimary)return;
          owned.current=event.pointerId;
          strokeBox.current=event.currentTarget.getBoundingClientRect();
          event.currentTarget.setPointerCapture(event.pointerId);
          const type=event.pointerType;
          onBegin(event.pointerId,type==='pen'||type==='touch'||type==='mouse'?type:'unknown',point(event));
        }}
        onPointerMove={event=>{
          if(owned.current!==event.pointerId)return;
          const samples=event.nativeEvent.getCoalescedEvents?.()??[];
          for(const sample of samples.length?samples:[event.nativeEvent])onMove(event.pointerId,point(event,sample));
        }}
        onPointerUp={event=>{
          if(owned.current!==event.pointerId)return;
          owned.current=null;
          onEnd(event.pointerId,point(event));
          strokeBox.current=null;
        }}
        onPointerCancel={event=>cancel(event.pointerId)}
        onLostPointerCapture={event=>{if(owned.current===event.pointerId)cancel(event.pointerId);}}>
        {!strokes.length&&<text x="160" y="62" textAnchor="middle">Draw one symbol</text>}
        {strokes.map(({points},index)=>points.every(point=>point.x===points[0].x&&point.y===points[0].y)
          ? <circle key={index} cx={points[0].x} cy={points[0].y} r="1.75"/>
          : <polyline key={index} points={points.map(p=>p.x+','+p.y).join(' ')}/>)}
      </svg>
      <div className="tutor-ink-results">
        {loading&&<LoaderCircle className="tutor-ink-spinner" aria-hidden="true"/>}
        {candidates('Matches',matchChoices)}
        {candidates('Could become',extensionChoices)}
        <span role="status" className={feedback?'tutor-ink-feedback':'v7-sr-only'}>
          {feedback||(loading?'Preparing recognition…':'')}
        </span>
      </div>
    </> : <p className="tutor-ink-feedback">Enable Draw single symbols in <Link to="/settings?section=tutor">Tutor settings</Link>.</p>}
    <div className="tutor-symbol-tools">
      <IconButton label="Cancel symbol drawing" onClick={onClose}><Keyboard aria-hidden="true"/></IconButton>
      <IconButton label="Browse symbols" onClick={onBrowse}><Sigma aria-hidden="true"/></IconButton>
      {enabled&&<>
        <IconButton label="Undo symbol stroke" disabled={!strokes.length} onClick={onUndo}><Undo2 aria-hidden="true"/></IconButton>
        <IconButton label="Clear symbol ink" disabled={!strokes.length} onClick={onClear}><Trash2 aria-hidden="true"/></IconButton>
        <Button small variant="ghost" aria-pressed={keepDrawing} onClick={onKeepDrawing}>Keep drawing</Button>
      </>}
    </div>
  </section>;
}
