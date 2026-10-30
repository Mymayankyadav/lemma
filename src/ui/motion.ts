import type { Variants, Transition } from 'motion/react';
import {isCalm} from './useCalm';
/** UI-1 motion primitives. All movements collapse to a short fade for reduced motion. */
export const easeOut = [0.16, 1, 0.3, 1] as const;
export const easeInOut = [0.65, 0, 0.35, 1] as const;
export const easeIn = [0.4, 0, 0.6, 1] as const;
export const durations = { fast: 0.14, base: 0.22, slow: 0.36, enter: 0.6, reveal: 0.5, deal: 0.55, grade: 0.42 } as const;
export const springs = { gesture: {type:'spring',stiffness:380,damping:32}, sheet: {type:'spring',stiffness:300,damping:30}, snappy: {type:'spring',stiffness:500,damping:40}, pop: {type:'spring',stiffness:420,damping:18} } as const;
export const fade: Variants = { hidden:{opacity:0}, visible:{opacity:1,transition:{duration:0.15}},exit:{opacity:0,transition:{duration:0.15}} };
export const rise: Variants = {hidden:{opacity:0,y:12},visible:{opacity:1,y:0,transition:{duration:durations.enter,ease:easeOut}},exit:{opacity:0,y:-8,transition:{duration:durations.base}}};
export const stagger: Variants = {hidden:{},visible:{transition:{staggerChildren:0.1}}};
export const deal: Variants = {hidden:{opacity:0,y:34,scale:0.94,rotate:-1.5},visible:{opacity:1,y:0,scale:1,rotate:0,transition:{duration:durations.deal,ease:easeOut}}};
export const unfold: Variants = {hidden:{opacity:0,rotateX:-62,filter:'blur(2px)'},visible:{opacity:1,rotateX:0,filter:'blur(0px)',transition:{duration:durations.reveal,ease:easeOut}}};
export const flyLeft: Variants = {exit:{opacity:0,x:-160,rotate:-8,transition:{duration:durations.grade,ease:easeIn}}};
export const flyRight: Variants = {exit:{opacity:0,x:160,rotate:8,transition:{duration:durations.grade,ease:easeIn}}};
export const flyUp: Variants = {exit:{opacity:0,y:-160,transition:{duration:durations.grade,ease:easeIn}}};
export const sheet: Variants = {hidden:{y:'100%'},visible:{y:0,transition:springs.sheet},exit:{y:'100%',transition:{duration:durations.base}}};
export const pop: Variants = {hidden:{opacity:0,scale:0.8},visible:{opacity:1,scale:1,transition:springs.pop}};
export const reduced: Variants = fade;
export function variantFor(variants:Variants, reduce:boolean):Variants { return reduce || isCalm() ? fade : variants; }
export const tabTransition:Transition={duration:0.2,ease:easeOut};

/* UI-5a timing contract. Feature tasks use these for their Euclid-specific gestures. */
export const euclidTiming={
 construction:1.4,climber:.7,revealRule:.3,revealAnswer:.25,
 approvalPen:.28,tab:.2,drill:.28,deal:.48,halo:2.4,drift:38,
} as const;
export const euclidTransitions={
 tab:{duration:euclidTiming.tab,ease:easeInOut},
 drill:{duration:euclidTiming.drill,ease:easeOut},
 climber:{duration:euclidTiming.climber,ease:easeInOut},
 revealRule:{duration:euclidTiming.revealRule,ease:easeInOut},
 revealAnswer:{duration:euclidTiming.revealAnswer,ease:easeOut},
 approvalPen:{duration:euclidTiming.approvalPen,ease:easeInOut},
} as const;
