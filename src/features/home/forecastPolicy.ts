import type {DataMode} from '../../data/mode'

/** Live forecasts are a bounded owner-scoped RPC; render them eagerly so
 * rapid navigation cannot leave a delayed Today request entering Insights.
 * Large demo stores instead scan local card data, so defer only those scans
 * until their below-the-fold forecast enters the viewport. */
export function shouldDeferForecast(projectCount:number,mode:DataMode):boolean{
 return mode==='demo'&&projectCount>4
}
