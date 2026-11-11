/** Narrow local declarations for the d3-force API used by the v7 Atlas layout (the repo ships no @types/d3-force). */
declare module 'd3-force' {
 export interface SimulationNodeDatum {index?:number; x?:number; y?:number; vx?:number; vy?:number; fx?:number|null; fy?:number|null}
 export interface SimulationLinkDatum<N> {source:number|string|N; target:number|string|N; index?:number}
 export interface Force<N> {(alpha:number):void; initialize?(nodes:N[],random:()=>number):void}
 export interface Simulation<N extends SimulationNodeDatum> {
  stop():this; tick(iterations?:number):this; force(name:string,force:Force<N>|null):this;
  randomSource(source:()=>number):this; alpha(value:number):this; alphaMin(value:number):this;
  alphaDecay(value:number):this; velocityDecay(value:number):this; nodes():N[];
 }
 export function forceSimulation<N extends SimulationNodeDatum>(nodes?:N[]):Simulation<N>;
 export interface LinkForce<N,L> extends Force<N> {
  distance(value:number|((link:L)=>number)):this; strength(value:number|((link:L)=>number)):this; iterations(count:number):this;
 }
 export function forceLink<N extends SimulationNodeDatum,L extends SimulationLinkDatum<N>>(links?:L[]):LinkForce<N,L>;
 export interface ManyBodyForce<N> extends Force<N> {strength(value:number|((node:N)=>number)):this; distanceMax(value:number):this; theta(value:number):this}
 export function forceManyBody<N extends SimulationNodeDatum>():ManyBodyForce<N>;
 export interface PositionForce<N> extends Force<N> {strength(value:number|((node:N)=>number)):this}
 export function forceX<N extends SimulationNodeDatum>(x?:number|((node:N)=>number)):PositionForce<N>;
 export function forceY<N extends SimulationNodeDatum>(y?:number|((node:N)=>number)):PositionForce<N>;
 export interface CollideForce<N> extends Force<N> {radius(value:number|((node:N)=>number)):this; strength(value:number):this; iterations(count:number):this}
 export function forceCollide<N extends SimulationNodeDatum>(radius?:number|((node:N)=>number)):CollideForce<N>;
}
