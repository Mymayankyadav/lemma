import {useRef,useState,type PointerEvent} from 'react';
import {
  appendPadPoint,replacePadStrokes,erasePadStroke,finishPadStroke,PAD_PAPER,padStrokePath,
  paperPoint,type PadInkHistory,type PadPoint,type PadStroke,type PadStrokes,
} from './ink';
import './ink.css';

type Contact = {x:number;y:number};
type Interaction =
  | {pointer:number;type:'pen';stroke:PadStroke}
  | {pointer:number;type:'eraser';history:PadInkHistory}
  | {pointer:number;type:'hand';at:Contact};
const contact = (event: PointerEvent<SVGSVGElement>):Contact => ({x:event.clientX,y:event.clientY});

export function InkCanvas({history,onChange,mode='pen',width=3,accent=false,label,className='',
  onStroke,onStrokeEnd,onPan}: {
  history:PadInkHistory;onChange:(history:PadInkHistory)=>void;mode?:'pen'|'eraser'|'hand';
  width?:number;accent?:boolean;label:string;className?:string;onStroke?:()=>void;onStrokeEnd?:()=>void;
  onPan?:(dx:number,dy:number,gesture:'hand'|'touch')=>void;
}) {
  const active = useRef<Interaction|null>(null);
  const touches = useRef(new Map<number,Contact>());
  const multiTouch = useRef(false);
  const [pending,setPending] = useState<PadStroke>([]);
  const [erasing,setErasing] = useState<PadStrokes>();
  const point = (event: PointerEvent<SVGSVGElement>) => paperPoint(event.clientX,event.clientY,event.currentTarget.getBoundingClientRect());

  function reset() {
    if (active.current?.type==='pen') onStrokeEnd?.();
    active.current=null;
    setPending([]);
    setErasing(undefined);
  }

  function erase(interaction:Extract<Interaction,{type:'eraser'}>,at:PadPoint) {
    interaction.history=erasePadStroke(interaction.history,at);
    setErasing(interaction.history.strokes);
  }

  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button!==0 || (mode==='hand'&&!onPan)) return;
    if (onPan && event.pointerType==='touch') {
      touches.current.set(event.pointerId,contact(event));
      event.currentTarget.setPointerCapture?.(event.pointerId);
      if (touches.current.size>1) {
        multiTouch.current=true;
        if (active.current && touches.current.has(active.current.pointer)) reset();
      }
      if (multiTouch.current) return;
    }
    if (active.current) return;
    const at=point(event);
    if (!at) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (mode==='hand') {
      active.current={pointer:event.pointerId,type:'hand',at:contact(event)};
    } else if (mode==='eraser') {
      const interaction={pointer:event.pointerId,type:'eraser' as const,history};
      active.current=interaction;
      erase(interaction,at);
    } else {
      active.current={pointer:event.pointerId,type:'pen',stroke:[at]};
      onStroke?.();
      setPending([at]);
    }
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    const previous=touches.current.get(event.pointerId);
    const at=contact(event);
    if (previous) {
      const size=touches.current.size;
      touches.current.set(event.pointerId,at);
      if (multiTouch.current) {
        // One pointer event updates one contact. Its delta divided by the count
        // is the change of the gesture's centroid.
        if (size>=3 && !active.current) onPan?.((at.x-previous.x)/size,(at.y-previous.y)/size,'touch');
        return;
      }
    }
    const interaction=active.current;
    if (!interaction||interaction.pointer!==event.pointerId) return;
    if (interaction.type==='hand') {
      onPan?.(at.x-interaction.at.x,at.y-interaction.at.y,'hand');
      interaction.at=at;
      return;
    }
    const paper=point(event);
    if (!paper) return;
    if (interaction.type==='eraser') {
      erase(interaction,paper);
    } else {
      interaction.stroke=appendPadPoint(interaction.stroke,paper);
      setPending(interaction.stroke);
    }
  }

  function end(event: PointerEvent<SVGSVGElement>,commit:boolean) {
    touches.current.delete(event.pointerId);
    if (!touches.current.size) multiTouch.current=false;
    const interaction=active.current;
    if (!interaction||interaction.pointer!==event.pointerId) return;
    if (commit && interaction.type==='pen') {
      const at=point(event);
      onChange(finishPadStroke(history,at?appendPadPoint(interaction.stroke,at):interaction.stroke));
    } else if (commit && interaction.type==='eraser') {
      const at=point(event);
      if (at) erase(interaction,at);
      onChange(replacePadStrokes(history,interaction.history.strokes));
    }
    reset();
  }

  return <svg viewBox={`0 0 ${PAD_PAPER.width} ${PAD_PAPER.height}`} preserveAspectRatio="none" role="img" aria-label={label}
    data-ink-canvas="" data-mode={mode} className={`v7-ink-canvas ${className}`}
    onPointerDown={start} onPointerMove={move} onPointerUp={event=>end(event,true)}
    onPointerCancel={event=>end(event,false)} onLostPointerCapture={event=>end(event,false)}>
    <g fill="none" stroke={accent?'var(--v7-role-selection-fg)':'currentColor'} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {(erasing??history.strokes).map((stroke,index)=><path key={index} d={padStrokePath(stroke)}/>)}
      {!!pending.length&&<path d={padStrokePath(pending)} opacity={0.7}/>}
    </g>
  </svg>;
}
