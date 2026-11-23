import {memo,useEffect,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {
  PAD_INK_LIMIT,PAD_PAPER,erasePadStroke,matrixPoint,paperDelta,paperPoint,padStrokePath,replacePadStrokes,simplifyPadStroke,
  type PadMatrix,
  type PadInkHistory,type PadPoint,type PadStroke,type PadStrokes,
} from './ink';
import './ink.css';

type Contact = {x:number;y:number};
type Interaction =
  | {pointer:number;type:'pen';rect:DOMRect;turned:PadMatrix|null;stroke:PadPoint[];done:PadStroke[]}
  | {pointer:number;type:'eraser';rect:DOMRect;turned:PadMatrix|null;history:PadInkHistory}
  | {pointer:number;type:'hand';at:Contact};
const contact = (event: PointerEvent<SVGSVGElement>):Contact => ({x:event.clientX,y:event.clientY});

/** A stroke this long is simplified; one still this dense after that carries on as a new stroke (never cut off). */
const SIMPLIFY_AT = PAD_INK_LIMIT.points - 16;
/** A touch this soon after the pen is a resting palm, not writing. */
const PALM_MS = 800;

/**
 * The paper's inverse screen matrix when it is turned (a quarter turn in full screen, landscape), or null when it sits
 * upright, where the bounding box maps a touch exactly.
 */
function turnedInverse(svg:SVGSVGElement):PadMatrix|null {
  const screen=svg.getScreenCTM?.();
  if (!screen||(Math.abs(screen.b)<1e-6&&Math.abs(screen.c)<1e-6)) return null;
  return screen.inverse();
}

/** Each stroke's path is worked out once, not on every render. */
const paths = new WeakMap<PadStroke,string>();
const strokePath = (stroke:PadStroke) => {
  let d = paths.get(stroke);
  if (d===undefined) {d=padStrokePath(stroke);paths.set(stroke,d);}
  return d;
};
const Strokes = memo(function Strokes({strokes}:{strokes:PadStrokes}) {
  return <>{strokes.map((stroke,index)=><path key={index} d={strokePath(stroke)}/>)}</>;
});

/**
 * N228 (Owner: "drawing in both the scratch pads is laggy and unreliable"). Drawing no longer renders React per move:
 * the stroke being drawn is one path whose `d` is set once per frame from every coalesced pointer event, so a move costs
 * the same however much is already on the paper. And it is not lost: a long stroke is simplified and, if it must,
 * continues as another stroke (it used to stop silently at 256 points); a resting palm or a second finger below the
 * pan count no longer cancels it; a cancelled pointer keeps what was drawn; and a full paper says so up front.
 */
export function InkCanvas({history,onChange,mode='pen',width=3,accent=false,label,className='',
  onStroke,onStrokeEnd,onPan,onFull,panTouches=3}: {
  history:PadInkHistory;onChange:(history:PadInkHistory)=>void;mode?:'pen'|'eraser'|'hand';
  width?:number;accent?:boolean;label:string;className?:string;onStroke?:()=>void;onStrokeEnd?:()=>void;
  /** `fingers` is how many touch the paper in a touch pan (N227: two scroll the paper, three the chat). */
  onPan?:(dx:number,dy:number,gesture:'hand'|'touch',fingers?:number)=>void;
  /** The paper holds as many strokes as it can; the stroke just drawn (or started) was not kept. */
  onFull?:()=>void;
  /** How many fingers pan instead of drawing (N221: the equation paper pans with two). */
  panTouches?:number;
}) {
  const active = useRef<Interaction|null>(null);
  const touches = useRef(new Map<number,Contact>());
  const multiTouch = useRef(false);
  /** The paper's screen matrix while it is turned (landscape), to carry a screen pan into the paper's own axes. */
  const screen = useRef<PadMatrix|null>(null);
  const lastPen = useRef(-Infinity);
  const live = useRef<SVGPathElement>(null);
  const frame = useRef(0);
  const liveD = useRef('');
  const [erasing,setErasing] = useState<PadStrokes>();
  /** The live path exists only while a pen stroke is being drawn. */
  const [drawing,setDrawing] = useState(false);
  const latest = useRef({history,onChange,onFull,onStrokeEnd});
  latest.current={history,onChange,onFull,onStrokeEnd};

  useEffect(()=>()=>{if (frame.current) cancelAnimationFrame(frame.current);},[]);
  useLayoutEffect(()=>{if (drawing) live.current?.setAttribute('d',liveD.current);},[drawing]);

  function paintLive(d:string,now=false) {
    liveD.current=d;
    if (now) {
      if (frame.current) {cancelAnimationFrame(frame.current);frame.current=0;}
      live.current?.setAttribute('d',d);
    } else if (!frame.current) {
      frame.current=requestAnimationFrame(()=>{frame.current=0;live.current?.setAttribute('d',liveD.current);});
    }
  }
  const penPath = (interaction:Extract<Interaction,{type:'pen'}>) =>
    [...interaction.done,interaction.stroke].map(padStrokePath).join('');

  function reset() {
    if (active.current?.type==='pen') latest.current.onStrokeEnd?.();
    active.current=null;
    paintLive('',true);
    setDrawing(false);
    setErasing(undefined);
  }

  function erase(interaction:Extract<Interaction,{type:'eraser'}>,at:PadPoint) {
    interaction.history=erasePadStroke(interaction.history,at);
    setErasing(interaction.history.strokes);
  }

  /** The points of a pointer event, all of those the browser coalesced since the last one. */
  function points(event:PointerEvent<SVGSVGElement>,rect:DOMRect,turned:PadMatrix|null) {
    const raw=event.nativeEvent.getCoalescedEvents?.();
    const list=raw&&raw.length?raw:[event.nativeEvent];
    const out:PadPoint[]=[];
    for (const item of list) {
      const at=turned?matrixPoint(turned,item.clientX,item.clientY):paperPoint(item.clientX,item.clientY,rect);
      if (at) out.push(at);
    }
    return out;
  }

  function addPoints(interaction:Extract<Interaction,{type:'pen'}>,added:readonly PadPoint[]) {
    for (const at of added) {
      const last=interaction.stroke.at(-1);
      if (last?.x===at.x&&last.y===at.y) continue;
      interaction.stroke.push(at);
      if (interaction.stroke.length>=SIMPLIFY_AT) {
        const simpler=simplifyPadStroke(interaction.stroke);
        if (simpler.length>=SIMPLIFY_AT*0.75) {
          interaction.done.push(simpler);
          interaction.stroke=[simpler[simpler.length-1]];
        } else interaction.stroke=[...simpler];
      }
    }
  }

  const local = (dx:number,dy:number):[number,number] => screen.current?paperDelta(screen.current,dx,dy):[dx,dy];

  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button!==0 || (mode==='hand'&&!onPan)) return;
    if (event.pointerType==='pen') lastPen.current=performance.now();
    if (onPan && event.pointerType==='touch') {
      // A palm resting beside the pen is neither a stroke nor a pan.
      if (performance.now()-lastPen.current<PALM_MS) return;
      touches.current.set(event.pointerId,contact(event));
      event.currentTarget.setPointerCapture?.(event.pointerId);
      if (touches.current.size>=panTouches) {
        multiTouch.current=true;
        if (active.current && touches.current.has(active.current.pointer)) reset();
      }
      if (multiTouch.current) return;
    }
    if (active.current) return;
    const rect=event.currentTarget.getBoundingClientRect();
    const turned=turnedInverse(event.currentTarget);
    screen.current=turned?event.currentTarget.getScreenCTM():null;
    const at=turned?matrixPoint(turned,event.clientX,event.clientY):paperPoint(event.clientX,event.clientY,rect);
    if (!at) return;
    if (mode!=='hand' && mode!=='eraser' && latest.current.history.strokes.length>=PAD_INK_LIMIT.strokes) {
      latest.current.onFull?.();
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (mode==='hand') {
      active.current={pointer:event.pointerId,type:'hand',at:contact(event)};
    } else if (mode==='eraser') {
      const interaction={pointer:event.pointerId,type:'eraser' as const,rect,turned,history:latest.current.history};
      active.current=interaction;
      erase(interaction,at);
    } else {
      const interaction={pointer:event.pointerId,type:'pen' as const,rect,turned,stroke:[at],done:[]};
      active.current=interaction;
      onStroke?.();
      paintLive(penPath(interaction),true);
      setDrawing(true);
    }
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType==='pen') lastPen.current=performance.now();
    const previous=touches.current.get(event.pointerId);
    const at=contact(event);
    if (previous) {
      const size=touches.current.size;
      touches.current.set(event.pointerId,at);
      if (multiTouch.current) {
        // One pointer event updates one contact. Its delta divided by the count
        // is the change of the gesture's centroid.
        if (size>=panTouches && !active.current) {
          const [dx,dy]=local((at.x-previous.x)/size,(at.y-previous.y)/size);
          onPan?.(dx,dy,'touch',size);
        }
        return;
      }
    }
    const interaction=active.current;
    if (!interaction||interaction.pointer!==event.pointerId) return;
    if (interaction.type==='hand') {
      const [dx,dy]=local(at.x-interaction.at.x,at.y-interaction.at.y);
      onPan?.(dx,dy,'hand');
      interaction.at=at;
      return;
    }
    const added=points(event,interaction.rect,interaction.turned);
    if (!added.length) return;
    if (interaction.type==='eraser') {
      for (const paper of added) erase(interaction,paper);
    } else {
      addPoints(interaction,added);
      paintLive(penPath(interaction));
    }
  }

  /** `final` is a real pointerup: its own position is the stroke's last point (a cancel's is not). */
  function end(event: PointerEvent<SVGSVGElement>,final:boolean) {
    touches.current.delete(event.pointerId);
    if (!touches.current.size) multiTouch.current=false;
    const interaction=active.current;
    if (!interaction||interaction.pointer!==event.pointerId) return;
    const {history:current,onChange:change,onFull:full}=latest.current;
    if (interaction.type==='pen') {
      if (final) addPoints(interaction,points(event,interaction.rect,interaction.turned));
      const segments=[...interaction.done,simplifyPadStroke(interaction.stroke)];
      const room=PAD_INK_LIMIT.strokes-current.strokes.length;
      if (segments.length>room) full?.();
      if (room>0) change(replacePadStrokes(current,[...current.strokes,...segments.slice(0,room)]));
    } else if (interaction.type==='eraser') {
      if (final) {
        const at=interaction.turned?matrixPoint(interaction.turned,event.clientX,event.clientY):paperPoint(event.clientX,event.clientY,interaction.rect);
        if (at) erase(interaction,at);
      }
      change(replacePadStrokes(current,interaction.history.strokes));
    }
    reset();
  }

  return <svg viewBox={`0 0 ${PAD_PAPER.width} ${PAD_PAPER.height}`} preserveAspectRatio="none" role="img" aria-label={label}
    data-ink-canvas="" data-mode={mode} className={`v7-ink-canvas ${className}`}
    onPointerDown={start} onPointerMove={move} onPointerUp={event=>end(event,true)}
    onPointerCancel={event=>end(event,false)} onLostPointerCapture={event=>end(event,false)}>
    <g fill="none" stroke={accent?'var(--v7-role-selection-fg)':'currentColor'} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Strokes strokes={erasing??history.strokes}/>
      {drawing&&<path ref={live} data-live-stroke="" d={liveD.current}/>}
    </g>
  </svg>;
}
