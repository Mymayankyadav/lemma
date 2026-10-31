/** AUDIT #540: independent fail-closed cold-render evidence for every visual route.
 * The ST-0 8-case layout matrix uses 1x hash transitions after Today; it cannot
 * certify a route-specific 4x first render. This gate accepts only full document
 * navigations in the worst-case extreme/Graph-night/360px profile.
 */
import {QA3_ROUTES} from './qa3-report';

export type CpuRouteSample = {
 route:string; actualRoute:string; profile:string; theme:string; width:number;
 cpuThrottle:number; durationMs:number; navigationType:string; ready:boolean;
 nodes:number; screenshot:string;
};

export function auditCpuCoverage(samples:readonly CpuRouteSample[]):string[] {
 const errors:string[]=[];
 const seen=new Set<string>();
 const expected=new Set<string>(QA3_ROUTES);
 for(const row of samples) {
  if(!expected.has(row.route)) {
   errors.push('unknown 4x route '+row.route);
   continue;
  }
  if(seen.has(row.route)) errors.push('duplicate 4x route '+row.route);
  seen.add(row.route);
  const valid=row.actualRoute===row.route && row.profile==='extreme' &&
   row.theme==='graph-night' && row.width===360 &&
   row.cpuThrottle===4 && row.navigationType==='document' &&
   row.ready===true && Number.isFinite(row.durationMs) && row.durationMs>=0 &&
   Number.isFinite(row.nodes) && row.nodes>0 &&
   typeof row.screenshot==='string' && row.screenshot.length>0;
  if(!valid) {
   errors.push('missing 4x cold first-render evidence for '+row.route);
   continue;
  }
  if(row.durationMs>=1500) errors.push(row.route+': 4x CPU first render >= 1.5s');
  if(row.nodes>=1500) errors.push(row.route+': 1500 DOM nodes');
 }
 for(const route of QA3_ROUTES) {
  if(!seen.has(route)) errors.push('missing 4x cold first-render evidence for '+route);
 }
 return errors;
}
