import {stressViolations,type StressMeasurement} from './stress-limits';

/** Explicit temporary exceptions to the ST-0 baseline, never to QA-3 release.
 * Every exception names an open audit/task issue; delete it after Auditor
 * verifies the corresponding fix on merged main. An unknown violation fails CI.
 */
export type PendingStressGate={issue:number;failure:string;routes:readonly string[]};
export const unfinishedStressGates:readonly PendingStressGate[]=[
 {issue:506,failure:'text below 12px',routes:['/','/insights','/kit']}, // chart labels; global tokens fixed in #508
 {issue:485,failure:'maths below 16px',routes:['/atlas']}, // Atlas breadcrumb
 {issue:510,failure:'tap target below 44px',routes:['/p/real-analysis']}, // Sources controls
 {issue:489,failure:'marks closer than 8px',routes:[
  '/','/projects','/p/real-analysis','/p/real-analysis/cp/CP4',
  '/proposals/proposal-6','/review','/review/run','/review/done',
  '/cards','/cards/31','/atlas','/insights','/kit'
 ]}, // count marks in charts, timeline, cards and Atlas
 {issue:433,failure:'1500 DOM nodes',routes:['/cards','/cards/31','/review','/review/run']}, // ST-4
 {issue:433,failure:'4x CPU first render >= 1.5s',routes:['/']}, // ST-4 extreme fixture
];

/** Fail on any untracked hard-budget breach, and fail closed for QA-3 release.
 * The baseline may defer only exact named failures/route pairs while related
 * audit issues are open. A release can never inherit baseline exemptions.
 */
export function enforceStressBudgets(
 measurements:readonly StressMeasurement[],
 {pending=unfinishedStressGates,release=false}:{
  pending?:readonly PendingStressGate[];release?:boolean
 }={}
):void{
 for(const gate of pending){
  if(!Number.isSafeInteger(gate.issue)||gate.issue<=0||
     !gate.failure.trim()||!gate.routes.length||
     gate.routes.some(route=>route==='*'||!route.startsWith('/')))
   throw Error('invalid pending stress gate: '+JSON.stringify(gate));
 }
 const errors:string[]=[];
 for(const m of measurements){
  for(const failure of stressViolations(m)){
   const exception=pending.find(gate=>gate.failure===failure&&
    gate.routes.includes(m.route));
   if(exception&&!release)continue;
   errors.push(m.route+': '+failure+(exception?' (pending audit #'+exception.issue+')':''));
  }
 }
 // QA-3 cannot certify release while an unresolved exception is still
 // declared, even if a particular fixture no longer reproduces it.
 if(release&&pending.length){
  errors.push('unverified audit exceptions remain: '+pending.map(g=>'#'+g.issue).join(', '));
 }
 if(errors.length)throw Error('stress budget failed:\n'+errors.join('\n'));
}
