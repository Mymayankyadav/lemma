import { useId } from "react";
import { emblemStrokes, emblemKind, emblemTier, type EmblemKind, type EmblemTier } from "./emblem";
import "./emblem.css";

/**
 * Emblem system v2: the tier follows the rendered size (hero ≥ 160, tile ≥ 40, glyph below) unless given. Strokes keep
 * their pixel width at every size (`vector-effect: non-scaling-stroke`); the focal stroke is full strength, the context
 * at 40–60%. Drawing order is preserved so `animate` draws the construction in (final frame under reduced motion).
 */
export function Emblem({ subject, seed, kind = emblemKind(subject), size = 96, tier = emblemTier(size), animate = true, focus = false, broken = false }: {
  subject: string; seed: string; kind?: EmblemKind; size?: number; tier?: EmblemTier; animate?: boolean; focus?: boolean; broken?: boolean;
}) {
  const id = useId(), hero = tier === "hero", glyph = tier === "glyph";
  const strokes = emblemStrokes(subject, seed, kind, tier);
  return <svg aria-hidden="true" width={size} height={size} style={glyph ? undefined : { width: size, height: size }} viewBox={glyph ? "-12 -12 224 224" : "0 0 200 200"} fill="none"
    data-tier={tier} data-strokes={strokes.length}
    className={`v7-emblem v7-emblem-${tier}${hero ? " v7-emblem-hero" : ""}${animate && !broken ? " v7-emblem-draw" : ""}${broken ? " v7-emblem-broken" : ""}${focus ? " v7-emblem-focus" : ""}`}>
    {!glyph && <defs><clipPath id={`${id}-clip`}><circle cx="100" cy="100" r="98" /></clipPath></defs>}
    <g clipPath={glyph ? undefined : `url(#${id}-clip)`} className="v7-emblem-ink" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {strokes.map((stroke, i) => <path key={i} d={stroke.d} strokeWidth={stroke.width} opacity={stroke.opacity} vectorEffect="non-scaling-stroke"
        className={stroke.focal ? "v7-emblem-focal" : undefined} pathLength={animate || broken ? 1 : undefined} />)}
    </g>
  </svg>;
}
