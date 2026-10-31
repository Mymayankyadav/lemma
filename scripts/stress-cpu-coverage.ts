/** AUDIT #540: fail-closed 4x full-document first-render evidence for all
 * S/X x Graph day/night x 360/390 x 18 visual routes (144 matrix cells).
 * The existing 1x hash-transition layout baseline is NOT CPU evidence.
 */
import {QA3_ROUTES} from './qa3-report';

export const CPU_CASES=(['stress','extreme'] as const).flatMap(profile=>
 (['graph','graph-night'] as const).flatMap(theme=>
  ([360,390] as const).map(width=>({profile,theme,width}))));
export type CpuCase=(typeof CPU_CASES)[number];
export type CpuRouteSample={
 route:string;actualRoute:string;profile:string;theme:string;width:number;
 cpuThrottle:number;durationMs:number;navigationType:string;ready:boolean;
 nodes:number;screenshot:string;
};
export function cpuCaseKey(c:Pick<CpuCase,'profile'|'theme'|'width'>):string{
 return c.profile+'/'+c.theme+'/'+c.width;
}
export function auditCpuMatrix(samples:readonly CpuRouteSample[],c:CpuCase):string[]{
 const errors:string[]=[],seen=new Set<string>(),expected=new Set<string>(QA3_ROUTES);
 const key=cpuCaseKey(c);
 for(const row of samples){
  if(row.profile!==c.profile||row.theme!==c.theme||row.width!==c.width){
   errors.push('mismatched 4x matrix metadata for '+row.route);
   continue;
  }
  if(!expected.has(row.route)){
   errors.push('unknown 4x route '+key+' '+row.route);
   continue;
  }
  if(seen.has(row.route))errors.push('duplicate 4x route '+key+' '+row.route);
  seen.add(row.route);
  const valid=row.actualRoute===row.route&&row.cpuThrottle===4&&
   row.navigationType==='document'&&row.ready===true&&
   Number.isFinite(row.durationMs)&&row.durationMs>=0&&
   Number.isFinite(row.nodes)&&row.nodes>0&&
   typeof row.screenshot==='string'&&row.screenshot.length>0;
  if(!valid){
   errors.push('missing 4x cold first-render evidence for '+key+' '+row.route);
   continue;
  }
  if(row.durationMs>=1500)errors.push(row.route+' ['+key+']: 4x CPU first render >= 1.5s');
  if(row.nodes>=1500)errors.push(row.route+' ['+key+']: 1500 DOM nodes');
 }
 for(const route of QA3_ROUTES){
  if(!seen.has(route))errors.push('missing 4x cold first-render evidence for '+key+' '+route);
 }
 return errors;
}
export function auditCpuCoverage(samples:readonly CpuRouteSample[]):string[]{
 const errors:string[]=[];
 for(const row of samples){
  if(!CPU_CASES.some(c=>row.profile===c.profile&&row.theme===c.theme&&row.width===c.width))
   errors.push('unknown 4x matrix for '+row.route);
 }
 for(const c of CPU_CASES)
  errors.push(...auditCpuMatrix(samples.filter(row=>
   row.profile===c.profile&&row.theme===c.theme&&row.width===c.width),c));
 return errors;
}
