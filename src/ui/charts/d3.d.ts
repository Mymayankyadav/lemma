/** Narrow local type declarations for the D3 modules used by Lemma's charts. */
declare module 'd3-scale' {
 export interface LinearScale { (value:number):number; domain(values:readonly number[]):LinearScale; range(values:readonly number[]):LinearScale; nice():LinearScale }
 export function scaleLinear():LinearScale;
 export interface BandScale { (value:string):number|undefined; domain(values:readonly string[]):BandScale; range(values:readonly number[]):BandScale; padding(value:number):BandScale; bandwidth():number; step():number }
 export function scaleBand():BandScale;
}
declare module 'd3-shape' {
 export interface LineGenerator<T> { (data:readonly T[]):string|null; x(fn:(datum:T,index:number)=>number):LineGenerator<T>; y(fn:(datum:T,index:number)=>number):LineGenerator<T>; defined(fn:(datum:T)=>boolean):LineGenerator<T>; curve(value:unknown):LineGenerator<T> }
 export interface AreaGenerator<T> { (data:readonly T[]):string|null; x(fn:(datum:T,index:number)=>number):AreaGenerator<T>; y0(value:number|((datum:T,index:number)=>number)):AreaGenerator<T>; y1(fn:(datum:T,index:number)=>number):AreaGenerator<T>; defined(fn:(datum:T)=>boolean):AreaGenerator<T>; curve(value:unknown):AreaGenerator<T> }
 export function line<T>():LineGenerator<T>;
 export function area<T>():AreaGenerator<T>;
 export const curveMonotoneX:unknown;
}
