/**
 * Narrow local contracts for the D3 modules used by the Atlas.
 * Runtime APIs remain the official d3-force, d3-polygon, d3-selection and d3-zoom.
 */
declare module 'd3-force' {
 export interface SimulationNode { x?:number; y?:number; fx?:number|null; fy?:number|null }
 export interface ForceLink<T> { id(accessor:(node:T)=>string):ForceLink<T>; distance(n:number):ForceLink<T>; strength(n:number):ForceLink<T> }
 export interface ForceScalar { strength(n:number):ForceScalar }
 export interface Simulation { force(name:string,handler:unknown):Simulation; tick():Simulation; stop():Simulation }
 export function forceSimulation<T extends SimulationNode>(nodes:T[]):Simulation;
 export function forceLink<T extends SimulationNode>(links:Array<{source:string;target:string}>):ForceLink<T>;
 export function forceManyBody():ForceScalar;
 export function forceCollide(radius:number):unknown;
 export function forceX<T extends SimulationNode>(target:(node:T)=>number):ForceScalar;
 export function forceY<T extends SimulationNode>(target:(node:T)=>number):ForceScalar;
}
declare module 'd3-polygon' {
 export function polygonHull(points:readonly [number,number][]):[number,number][]|null;
}
declare module 'd3-zoom' {
 export interface ZoomTransform{x:number;y:number;k:number}
 export interface ZoomBehavior{
   scaleExtent(range:[number,number]):ZoomBehavior;
   filter(fn:(event:Event)=>boolean):ZoomBehavior;
   on(name:string,callback:(event:{transform:ZoomTransform;sourceEvent?:Event})=>void):ZoomBehavior;
   transform(selection:unknown,transform:ZoomTransform):void;
   scaleBy(selection:unknown,scale:number):void;
 }
 export function zoom<T extends Element,Datum=unknown>():ZoomBehavior;
 export const zoomIdentity:ZoomTransform & {translate(x:number,y:number):typeof zoomIdentity;scale(k:number):typeof zoomIdentity};
}
declare module 'd3-selection' {
 export interface Selection {
   call(behavior:unknown,...args:unknown[]):Selection;
   on(name:string,fn:null|((event:Event)=>void)):Selection;
 }
 export function select(element:Element):Selection;
}
