// Browser types for the pure Edge Function engine. Its runtime accepts numeric grades and mutable weights.
declare module '*fsrs.js' {
 const fsrs: Omit<typeof import('../../lib/fsrs/fsrs').default,'DEFAULT_W'|'step'> & {
  DEFAULT_W:number[];
  step(w:readonly number[],memory:{s:number;d:number}|null,days:number,rating:number):{s:number;d:number};
 };
 export default fsrs;
}
