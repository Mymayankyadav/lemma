import {it,expect} from 'vitest';
import {examBlock} from '../../../supabase/functions/_shared/exam/block';
import {ownerAgenda,type HostData} from '../../../supabase/functions/_shared/agenda/host';
import {buildQueue} from '../../../supabase/functions/_shared/adaptive/queue';
import {agendaQueue} from '../../../supabase/functions/mcp/agenda';
import {nextStep} from '../../../src/features/home/v7/nextStepModel';
import {sitting,now} from '../mcp/exam-fixture';

const stamp=(mins:number)=>new Date(Date.parse(now)+mins*60000).toISOString();
const s=sitting({study_minutes:90,activation_study_minutes:90,starts_at:stamp(120),ledger:{},
  blueprint:[{key:'diag',title:'Eigenvectors',marks:20}]});
const input={sitting:s,evidence:[],attempts:[]};
function host():HostData {
  return {asOf:now,watermark:'same',rows:{examInputs:[input],settings:{},concepts:[],projects:[{id:s.project_id,slug:'linear',last_study_on:'2026-11-22'}],
    sessions:[],checkpoints:[],cpConcepts:[]},calendar:{asOf:now,watermark:'same',status:'ok',horizonEnd:stamp(60),
    availability:[{id:'free',revision:1,startsAt:now,endsAt:stamp(30)}],fixed:[{id:'appointment',revision:1,startsAt:stamp(10),endsAt:stamp(40)}]}};
}
it('spends only the legal slot and gives Today and MCP the same rationale and fallback',()=>{
  const h=host(), read=ownerAgenda('owner',h,true,()=>0);
  expect(read.decision.outcome).toMatchObject({kind:'action',taskId:s.project_id+'/exam:'+s.id});
  const block=read.decision.exam!;
  expect(block.slotMinutes).toBeLessThanOrEqual(10);
  expect(block.next.minutes).toBeLessThanOrEqual(block.slotMinutes);
  expect(block.remainingMinutes).toBe(90);
  expect(agendaQueue(read)).toContain(block.fallback);
  const shown=nextStep(read,{now:Date.parse(now),localMinute:600,projects:[{id:s.project_id,slug:'linear'}],tasks:[]} as never);
  expect(shown.why).toBe(read.decision.reason);expect(shown.href).toContain('exam='+s.id);
  h.calendar!.fixed[0].startsAt=now;
  expect(ownerAgenda('owner',h,true,()=>0).decision.exam).toBeUndefined();
});
it('restores the ordinary course deadline and queue verbatim after a pause',()=>{
  const h=host(),snapshot=JSON.stringify(h.rows!.projects);
  const base={today:'2026-11-25',mode:'post_deadline',capacity:15,used:2,configured:true,projects:[],cps:[],reviews:[],reviewBudgetMinutes:0,reviewShare:0,nextStudyDays:[]} as const;
  const b=examBlock(input,now,13)!;
  expect(buildQueue({...base,examBlocks:[b]} as never).items[0]).toMatchObject({type:'exam',ref:s.id});
  for(const status of ['paused','finished'] as const){
    expect(examBlock({...input,sitting:{...s,status}},now,13)).toBeUndefined();
    h.rows!.examInputs=[{...input,sitting:{...s,status}}];const paused=ownerAgenda('owner',h,true,()=>0);
    delete h.rows!.examInputs;expect(ownerAgenda('owner',h,true,()=>0)).toEqual(paused);
  }
  expect(JSON.stringify(h.rows!.projects)).toBe(snapshot);expect(buildQueue({...base,examBlocks:[]} as never)).toEqual(buildQueue(base as never));
  expect(examBlock({...input,sitting:{...s,last_study_at:stamp(-1)}},now,10)).toBeUndefined();
});
