import {memo,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState,type PointerEvent,type Ref} from 'react';
import {
  PAD_INK_LIMIT,PAD_PAPER,erasePadStroke,matrixPoint,paperDelta,paperPoint,padStrokePath,replacePadStrokes,simplifyPadStroke,
  type PadMatrix,
  type PadInkHistory,type PadPoint,type PadStroke,type PadStrokes,
} from './ink';
import {eraseStrokesPartial} from './pixelEraser';
import './ink.css';

type Contact = {x:number;y:number};
type TipContact = {at:Contact;time:number;moved:boolean};
export type InkCanvasHandle = {
  flushPendingDot:()=>PadInkHistory;
  discardPendingDot:()=>void;
};
type PendingDot = {at:Contact;time:number;stroke:PadStroke};
const movedBeyond = (a:Contact,b:Contact,px:number) => (a.x-b.x)**2+(a.y-b.y)**2>px**2;
const TIP_TAP_MS=180;
const DOUBLE_TAP_MS=300;
const TIP_SLOP=4;
const DOUBLE_TAP_SLOP=20;
type Interaction = {input:string} & (
  | {pointer:number;type:'pen';rect:DOMRect;turned:PadMatrix|null;stroke:PadPoint[];done:PadStroke[];prefix:string;tip?:TipContact}
  | {pointer:number;type:'eraser';rect:DOMRect;turned:PadMatrix|null;history:PadInkHistory;last:PadPoint;pixel:boolean;temporary:boolean;queued:PadPoint[];frame:number}
  | {pointer:number;type:'hand';at:Contact});
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
  onStroke,onStrokeEnd,onPan,onFull,panTouches=3,pencilOnly=false,pencilTipEraser=false,eraserKind='stroke',apiRef,onPendingDot}: {
  history:PadInkHistory;onChange:(history:PadInkHistory)=>void;mode?:'pen'|'eraser'|'hand';
  width?:number;accent?:boolean;label:string;className?:string;onStroke?:()=>void;onStrokeEnd?:()=>void;
  /** `fingers` is how many touch the paper in a touch pan (N227: two scroll the paper, three the chat). */
  onPan?:(dx:number,dy:number,gesture:'hand'|'touch',fingers?:number)=>void;
  /** The paper holds as many strokes as it can; the stroke just drawn (or started) was not kept. */
  onFull?:()=>void;
  /** How many fingers pan instead of drawing (N221: the equation paper pans with two). */
  panTouches?:number;
  /** Only a pen may modify ink; touch navigation stays available. */
  pencilOnly?:boolean;
  /** Two nearby tip taps on the paper arm an eraser for one pen stroke. */
  pencilTipEraser?:boolean;
  eraserKind?:'stroke'|'pixel';
  apiRef?:Ref<InkCanvasHandle>;
  onPendingDot?:(pending:boolean)=>void;
}) {
  const active = useRef<Interaction|null>(null);
  const touches = useRef(new Map<number,Contact>());
  const movedTouches = useRef(new Set<number>());
  // Rejected palms stay rejected until they lift, even after the pen cooldown.
  const palms = useRef(new Set<number>());
  const multiTouch = useRef(false);
  /** The paper's screen matrix while it is turned (landscape), to carry a screen pan into the paper's own axes. */
  const screen = useRef<PadMatrix|null>(null);
  const lastPen = useRef(-Infinity);
  const live = useRef<SVGPathElement>(null);
  const frame = useRef(0);
  const liveD = useRef('');
  const pendingDot=useRef<PendingDot|null>(null);
  const dotTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [dotPreview,setDotPreview]=useState<PadStroke>();
  const [tipEraser,setTipEraser]=useState(false);
  const armed=useRef(false);
  const [erasing,setErasing] = useState<PadStrokes>();
  /** The live path exists only while a pen stroke is being drawn. */
  const [drawing,setDrawing] = useState(false);
  const latest = useRef({history,onChange,onFull,onStrokeEnd,onPendingDot});
  latest.current={history,onChange,onFull,onStrokeEnd,onPendingDot};

  useLayoutEffect(()=>()=> {
    if (frame.current) cancelAnimationFrame(frame.current);
    const interaction=active.current;
    if (interaction?.type==='eraser'&&interaction.frame) cancelAnimationFrame(interaction.frame);
    // Canvas moves between inline and modal DOMs. Save a visible isolated dot before it disappears.
    flushDot(false);
  // This is the canvas lifetime, not the lifetime of a render's closures.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useImperativeHandle(apiRef,()=>({flushPendingDot:()=>flushDot(),discardPendingDot:()=>{takeDot();}}));
  useEffect(()=>{
    if (mode!=='pen'||!pencilTipEraser) {
      flushDot();
      if (armed.current) setTipArmed(false);
    }
  // Mode transitions may close the gesture, never restart its timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode,pencilTipEraser]);
  useLayoutEffect(()=>{if (drawing) live.current?.setAttribute('d',liveD.current);},[drawing]);

  function paintLive(d:string) {
    liveD.current=d;
    if (frame.current) {cancelAnimationFrame(frame.current);frame.current=0;}
    live.current?.setAttribute('d',d);
  }
  function schedulePen(interaction:Extract<Interaction,{type:'pen'}>) {
    if (frame.current) return;
    frame.current=requestAnimationFrame(()=>{
      frame.current=0;
      liveD.current=penPath(interaction);
      live.current?.setAttribute('d',liveD.current);
    });
  }
  const penPath = (interaction:Extract<Interaction,{type:'pen'}>) =>
    interaction.prefix+padStrokePath(interaction.stroke);

  function setTipArmed(value:boolean) {
    armed.current=value;
    setTipEraser(value);
  }

  function takeDot(visible=true) {
    clearTimeout(dotTimer.current);
    const dot=pendingDot.current;
    pendingDot.current=null;
    if (dot) {if (visible) setDotPreview(undefined); latest.current.onPendingDot?.(false);}
    return dot;
  }

  function flushDot(visible=true):PadInkHistory {
    const dot=takeDot(visible);
    const {history:current,onChange:change,onFull:full}=latest.current;
    if (!dot) return current;
    if (current.strokes.length>=PAD_INK_LIMIT.strokes) {if (visible) full?.();return current;}
    const next=replacePadStrokes(current,[...current.strokes,dot.stroke]);
    // A subsequent pointer event in the same React batch must see the dot.
    latest.current.history=next;
    change(next);
    return next;
  }

  function queueDot(dot:PendingDot) {
    pendingDot.current=dot;
    setDotPreview(dot.stroke);
    latest.current.onPendingDot?.(true);
    dotTimer.current=setTimeout(()=>flushDot(),DOUBLE_TAP_MS);
  }

  function reset() {
    if (active.current?.type==='pen') latest.current.onStrokeEnd?.();
    const interaction=active.current;
    if (interaction?.type==='eraser'&&interaction.frame) cancelAnimationFrame(interaction.frame);
    active.current=null;
    paintLive('');
    setDrawing(false);
    setErasing(undefined);
  }

  function erase(interaction:Extract<Interaction,{type:'eraser'}>,samples:readonly PadPoint[]) {
    const before=interaction.history.strokes;
    for (const at of samples) {
      if (interaction.pixel) {
        const strokes=eraseStrokesPartial(interaction.history.strokes,interaction.last,at,16);
        if (strokes!==interaction.history.strokes) interaction.history={...interaction.history,strokes};
      } else interaction.history=erasePadStroke(interaction.history,at);
      interaction.last=at;
    }
    if (interaction.history.strokes!==before) setErasing(interaction.history.strokes);
  }

  function queueErase(interaction:Extract<Interaction,{type:'eraser'}>,samples:readonly PadPoint[]) {
    interaction.queued.push(...samples);
    if (interaction.frame) return;
    interaction.frame=requestAnimationFrame(()=>{
      interaction.frame=0;
      const samples=interaction.queued;
      interaction.queued=[];
      erase(interaction,samples);
    });
  }

  /** The points of a pointer event, all of those the browser coalesced since the last one. */
  function points(event:PointerEvent<SVGSVGElement>,rect:DOMRect,turned:PadMatrix|null,raw=event.nativeEvent.getCoalescedEvents?.()) {
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
          interaction.prefix+=padStrokePath(simpler);
          interaction.stroke=[simpler[simpler.length-1]];
        } else interaction.stroke=[...simpler];
      }
    }
  }

  const local = (dx:number,dy:number):[number,number] => screen.current?paperDelta(screen.current,dx,dy):[dx,dy];

  function beginTouchPan(svg: SVGSVGElement) {
    multiTouch.current = true;
    const matrix = svg.getScreenCTM?.();
    screen.current = matrix && (Math.abs(matrix.b)>1e-6 || Math.abs(matrix.c)>1e-6) ? matrix : null;
    if (active.current && touches.current.has(active.current.pointer)) reset();
  }

  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button!==0 || (mode==='hand'&&!onPan)) return;
    // A new down begins a new contact lifetime; the browser may reuse an ID
    // whose prior up happened outside this surface.
    palms.current.delete(event.pointerId);
    if (event.pointerType==='pen') {
      lastPen.current=performance.now();
      // Pencil wins even when a palm touched first. Discard only the unfinished
      // touch preview, including an eraser preview; committed history is untouched.
      for (const id of touches.current.keys()) palms.current.add(id);
      if (active.current?.input==='touch') {
        palms.current.add(active.current.pointer);
        reset();
      }
      touches.current.clear();
      movedTouches.current.clear();
      multiTouch.current=false;
    }
    if (event.pointerType==='touch' && (active.current?.input==='pen' || performance.now()-lastPen.current<PALM_MS)) {
      palms.current.add(event.pointerId);
      return;
    }
    if (onPan && event.pointerType==='touch') {
      touches.current.set(event.pointerId,contact(event));
      event.currentTarget.setPointerCapture?.(event.pointerId);
      if (touches.current.size>=Math.max(panTouches,3)) beginTouchPan(event.currentTarget);
      if (multiTouch.current || touches.current.size>=panTouches) return;
    }
    if (active.current || (pencilOnly && mode!=='hand' && event.pointerType!=='pen')) return;
    const rect=event.currentTarget.getBoundingClientRect();
    const turned=turnedInverse(event.currentTarget);
    screen.current=turned?event.currentTarget.getScreenCTM():null;
    const at=turned?matrixPoint(turned,event.clientX,event.clientY):paperPoint(event.clientX,event.clientY,rect);
    if (!at) return;
    const useTip=mode==='pen'&&pencilTipEraser&&event.pointerType==='pen';
    const eraseWithTip=useTip&&armed.current;
    const tap=useTip&&!eraseWithTip?{at:contact(event),time:performance.now(),moved:false}:undefined;
    if (pendingDot.current) {
      const first=pendingDot.current;
      if (tap&&tap.time-first.time<=DOUBLE_TAP_MS&&!movedBeyond(tap.at,first.at,DOUBLE_TAP_SLOP)) {
        // A qualifying second contact can finish just after the first timer deadline.
        clearTimeout(dotTimer.current);
      } else flushDot();
    }
    // Allow the shortcut on full paper too, so Pencil can erase to make room.
    if (mode==='pen'&&!useTip&&latest.current.history.strokes.length>=PAD_INK_LIMIT.strokes) {
      latest.current.onFull?.();
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (mode==='hand') {
      active.current={input:event.pointerType,pointer:event.pointerId,type:'hand',at:contact(event)};
    } else if (mode==='eraser'||eraseWithTip) {
      const interaction={input:event.pointerType,pointer:event.pointerId,type:'eraser' as const,rect,turned,
        history:latest.current.history,last:at,pixel:eraserKind==='pixel',temporary:eraseWithTip,queued:[],frame:0};
      active.current=interaction;
      erase(interaction,[at]);
    } else {
      const interaction={input:event.pointerType,pointer:event.pointerId,type:'pen' as const,rect,turned,stroke:[at],done:[],prefix:'',tip:tap};
      active.current=interaction;
      onStroke?.();
      paintLive(penPath(interaction));
      setDrawing(true);
    }
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    if (palms.current.has(event.pointerId)) return;
    // Hover is not contact and must not keep postponing intentional finger navigation.
    if (event.pointerType==='pen'&&active.current?.pointer===event.pointerId) lastPen.current=performance.now();
    const previous=touches.current.get(event.pointerId);
    const at=contact(event);
    if (previous) {
      const size=touches.current.size;
      touches.current.set(event.pointerId,at);
      if (!multiTouch.current && size===2 && panTouches===2 && (at.x!==previous.x || at.y!==previous.y)) {
        // Two moving contacts pan; a stationary second finger leaves the first free to draw.
        movedTouches.current.add(event.pointerId);
        if (movedTouches.current.size===2) beginTouchPan(event.currentTarget);
      }
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
    if (pencilOnly&&interaction.type!=='hand'&&interaction.input!=='pen') {reset();return;}
    if (interaction.type==='hand') {
      const [dx,dy]=local(at.x-interaction.at.x,at.y-interaction.at.y);
      onPan?.(dx,dy,'hand');
      interaction.at=at;
      return;
    }
    const tip=interaction.type==='pen'?interaction.tip:undefined;
    const raw=event.nativeEvent.getCoalescedEvents?.()??[];
    if (tip&&!tip.moved) {
      tip.moved=movedBeyond(at,tip.at,TIP_SLOP)||Boolean(raw?.some(p=>movedBeyond({x:p.clientX,y:p.clientY},tip.at,TIP_SLOP)));
      if (tip.moved) flushDot();
    }
    const added=points(event,interaction.rect,interaction.turned,raw);
    if (!added.length) return;
    if (interaction.type==='eraser') {
      queueErase(interaction,added);
    } else {
      addPoints(interaction,added);
      schedulePen(interaction);
    }
  }

  /** `final` is a real pointerup: its own position is the stroke's last point (a cancel's is not). */
  function end(event: PointerEvent<SVGSVGElement>,final:boolean) {
    if (event.pointerType==='pen') lastPen.current=performance.now();
    palms.current.delete(event.pointerId);
    touches.current.delete(event.pointerId);
    if (touches.current.size<2) movedTouches.current.clear();
    if (!touches.current.size) multiTouch.current=false;
    const interaction=active.current;
    if (!interaction||interaction.pointer!==event.pointerId) return;
    if (pencilOnly&&interaction.type!=='hand'&&interaction.input!=='pen') {reset();return;}
    if (interaction.type==='pen'&&interaction.tip) {
      const tip=interaction.tip;
      if (final) addPoints(interaction,points(event,interaction.rect,interaction.turned));
      const at=contact(event);
      if (final&&!tip.moved&&!movedBeyond(at,tip.at,TIP_SLOP)&&performance.now()-tip.time<=TIP_TAP_MS) {
        if (pendingDot.current) {
          takeDot();
          setTipArmed(true);
        } else queueDot({at,time:performance.now(),stroke:simplifyPadStroke(interaction.stroke)});
        reset();
        return;
      }
      // An interrupted second contact is not a tap. Keep a preceding intentional dot.
      flushDot();
    }
    const {history:current,onChange:change,onFull:full}=latest.current;
    if (interaction.type==='pen') {
      if (final&&!interaction.tip) addPoints(interaction,points(event,interaction.rect,interaction.turned));
      const segments=[...interaction.done,simplifyPadStroke(interaction.stroke)];
      const room=PAD_INK_LIMIT.strokes-current.strokes.length;
      if (segments.length>room) full?.();
      if (room>0) change(replacePadStrokes(current,[...current.strokes,...segments.slice(0,room)]));
    } else if (interaction.type==='eraser') {
      if (interaction.temporary) setTipArmed(false);
      // A new pixel or momentary eraser cancelled by the OS only changes the preview.
      // The original manual whole-stroke eraser preserves its existing cancel behavior.
      if (final || (!interaction.pixel&&!interaction.temporary)) {
        if (final) interaction.queued.push(...points(event,interaction.rect,interaction.turned));
        if (interaction.queued.length) erase(interaction,interaction.queued);
        const next=replacePadStrokes(current,interaction.history.strokes);
        if (next!==current) change(next);
      }
    }
    reset();
  }

  return <svg viewBox={`0 0 ${PAD_PAPER.width} ${PAD_PAPER.height}`} preserveAspectRatio="none" role="img" aria-label={label}
    aria-description={tipEraser?'Eraser armed for one Pencil stroke':undefined}
    data-ink-canvas="" data-mode={tipEraser?'eraser':mode} data-pencil-eraser={tipEraser?'':undefined} className={`v7-ink-canvas ${className}`}
    onPointerDown={start} onPointerMove={move} onPointerUp={event=>end(event,true)}
    onPointerCancel={event=>end(event,false)} onLostPointerCapture={event=>end(event,false)}>
    <g fill="none" stroke={accent?'var(--v7-role-selection-fg)':'currentColor'} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Strokes strokes={erasing??history.strokes}/>
      {dotPreview&&<path data-live-stroke="" d={strokePath(dotPreview)}/>}
      {drawing&&<path ref={live} data-live-stroke="" d={liveD.current}/>}
    </g>
  </svg>;
}
