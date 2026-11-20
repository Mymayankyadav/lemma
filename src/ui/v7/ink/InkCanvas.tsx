import {useRef,useState,type PointerEvent} from 'react';
import {appendPadPoint,erasePadStroke,finishPadStroke,PAD_PAPER,padStrokePath,paperPoint,type PadInkHistory,type PadStroke} from './ink';
import './ink.css';

export function InkCanvas({history,onChange,mode='pen',width=3,accent=false,label,className='',onStroke}: {
  history:PadInkHistory;onChange:(history:PadInkHistory)=>void;mode?:'pen'|'eraser'|'hand';
  width?:number;accent?:boolean;label:string;className?:string;onStroke?:()=>void;
}) {
  const active = useRef<{pointer:number;stroke:PadStroke}|null>(null);
  const [pending,setPending] = useState<PadStroke>([]);
  const point = (event: PointerEvent<SVGSVGElement>) => paperPoint(event.clientX,event.clientY,event.currentTarget.getBoundingClientRect());
  function reset() {
    active.current=null;
    setPending([]);
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (mode==='hand'||event.button!==0||active.current) return;
    const at=point(event);
    if (!at) return;
    if (mode==='eraser') {
      onChange(erasePadStroke(history,at));
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    active.current={pointer:event.pointerId,stroke:[at]};
    onStroke?.();
    setPending([at]);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const drawing=active.current, at=point(event);
    if (!drawing||drawing.pointer!==event.pointerId||!at) return;
    drawing.stroke=appendPadPoint(drawing.stroke,at);
    setPending(drawing.stroke);
  }
  function end(event: PointerEvent<SVGSVGElement>) {
    const drawing=active.current, at=point(event);
    if (!drawing||drawing.pointer!==event.pointerId) return;
    onChange(finishPadStroke(history,at?appendPadPoint(drawing.stroke,at):drawing.stroke));
    reset();
  }
  return <svg viewBox={`0 0 ${PAD_PAPER.width} ${PAD_PAPER.height}`} preserveAspectRatio="none" role="img" aria-label={label}
    data-ink-canvas="" data-mode={mode} className={`v7-ink-canvas ${className}`}
    onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={reset} onLostPointerCapture={reset}>
    <g fill="none" stroke={accent?'var(--v7-role-selection-fg)':'currentColor'} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {history.strokes.map((stroke,index)=><path key={index} d={padStrokePath(stroke)}/>)}
      {!!pending.length&&<path d={padStrokePath(pending)} opacity={0.7}/>}
    </g>
  </svg>;
}
