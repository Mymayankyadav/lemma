import { useId } from "react";
import { emblemStrokes, emblemKind, type EmblemKind } from "./emblem";
import "./emblem.css";

/** Glyphs have their own hand-drawn paths. Tile and hero use the same seeded construction. */
export function Emblem({ subject, seed, kind = emblemKind(subject), size = 96, animate = true, focus = false, broken = false }: {
  subject: string; seed: string; kind?: EmblemKind; size?: number; animate?: boolean; focus?: boolean; broken?: boolean;
}) {
  const id = useId(), hero = size >= 160;
  const strokes = emblemStrokes(subject, seed, kind);
  // Sample the entire construction for tiles; slicing removed the far side of lattices and circles.
  const count = hero ? strokes.length : Math.min(24, strokes.length);
  const detail = Array.from({ length: count }, (_, i) => strokes[count === 1 ? 0 : Math.round(i * (strokes.length - 1) / (count - 1))]);
  return <svg aria-hidden="true" width={size} height={size} style={{ width: size, height: size }} viewBox="0 0 200 200" fill="none"
    className={`v7-emblem${hero ? " v7-emblem-hero" : ""}${animate && !broken ? " v7-emblem-draw" : ""}${broken ? " v7-emblem-broken" : ""}${focus ? " v7-emblem-focus" : ""}`}>
    <defs><clipPath id={`${id}-clip`}><circle cx="100" cy="100" r="98" /></clipPath></defs>
    <g clipPath={`url(#${id}-clip)`} className="v7-emblem-ink" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {detail.map((stroke, i) => <path key={i} d={stroke.d} strokeWidth={hero ? Math.min(.9, Math.max(.65, stroke.width)) : 200 / size}
        opacity={1} pathLength={1} />)}
    </g>
  </svg>;
}
