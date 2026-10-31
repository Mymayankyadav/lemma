export interface ChartSize{width?:number;height?:number;title?:string;className?:string}
export interface Point{label:string;value:number|null}
export const bounded=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
export const formatPercent=(value:number)=>`${Math.round(value*100)}%`;
