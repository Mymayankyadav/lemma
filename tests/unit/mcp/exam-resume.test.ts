import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {packet} from '../../../supabase/functions/mcp/packet';
import {EXAM_RULES, INSTRUCTIONS} from '../../../supabase/functions/mcp/rules';
import {examFixture, examProject, now, owner, sitting} from './exam-fixture';

vi.mock('../../../supabase/functions/mcp/deps.ts', () => ({createClient:vi.fn()}));

beforeEach(() => {vi.useFakeTimers(); vi.setSystemTime(new Date(now));});
afterEach(() => vi.useRealTimers());

const settings = (v2:boolean, extras:Record<string,unknown> = {}) => ({
  user_id:owner, master_prompt:'Owner asks for exact reasoning.', time_zone:'Asia/Kolkata',
  flags:{time_block:v2}, ...extras,
});
const args={project:'linear-algebra'};
const examRulesNote='Owner asks for exact reasoning.';

describe('resume exam mode', () => {
  it.each([false,true])('puts EXAM immediately after OWNER and keeps ordinary study (v2=%s)', async v2 => {
    const {context}=examFixture({settings:[settings(v2,{tutor_rules:'Ordinary rule. '.repeat(500)})]});
    const output=await packet(context,args);
    const lines=output.split('\n');
    expect(lines[0]).toMatch(/^OWNER /);
    expect(lines[1]).toBe(examRulesNote);
    expect(lines[2]).toMatch(/^EXAM Linear algebra final · active/);
    expect(output).toContain('PLANNER get(what=exam, project=linear-algebra)');
    expect(output).toMatch(/\nNEXT \S/);
    expect(output).toContain('EXAM RULES\n'+EXAM_RULES);
    expect(await packet(examFixture({settings:[settings(v2)]}).context,args)).toContain('NOW all checkpoints done');
    expect(context.next).toMatch(/follow EXAM/);
    const examEnd=output.indexOf(EXAM_RULES)+EXAM_RULES.length;
    expect(output.slice(output.indexOf('\nEXAM ')+1,examEnd).length).toBeLessThanOrEqual(1500);
    expect(output.length).toBeGreaterThan(v2 ? 4300 : 2340);
    expect(output.slice(examEnd+1).length).toBeLessThanOrEqual(v2 ? 4300 : 2400);
  });

  it('omits exam rules on brief resume but retains the exam and next action', async () => {
    const {context}=examFixture();
    const output=await packet(context,{...args,brief:true});
    expect(output).toMatch(/\nEXAM Linear algebra final · active/);
    expect(output).toMatch(/\nNEXT \S/);
    expect(output).not.toContain('EXAM RULES');
  });

  it.each(['planned','paused'] as const)('uses one line for a future %s exam', async status => {
    const {context,reads}=examFixture({exam_sittings:[sitting({status})]});
    const output=await packet(context,args);
    expect(output).toContain(`EXAM Linear algebra final · ${status} ·`);
    expect(output).toContain('activate exam_sittings to resume prep');
    expect(output).not.toContain('EXAM RULES');
    expect(reads.some(read=>read.table==='exam_attempts')).toBe(false);
  });

  it.each(['active','paused'] as const)('asks what happened if a %s exam already started', async status => {
    const {context,reads}=examFixture({exam_sittings:[sitting({status,starts_at:'2026-11-25T08:00:00.000Z'})]});
    const output=await packet(context,args);
    expect(output).toContain('2 h 0 min ago');
    expect(output).toMatch(/ask whether it took place/i);
    expect(output).toContain('happened true/false');
    expect(output).not.toContain('EXAM RULES');
    expect(reads.some(read=>read.table==='exam_attempts')).toBe(false);
  });

  it('offers open ideas from a recent finish while the regular course continues', async () => {
    const card_ideas=[{id:'i1',user_id:owner,sitting_id:'sitting',status:'saved'},
      {id:'i2',user_id:owner,sitting_id:'sitting',status:'drafted'},
      {id:'i3',user_id:owner,sitting_id:'sitting',status:'dismissed'}];
    const recent=sitting({status:'finished',finished_at:'2026-11-24T08:00:00.000Z'});
    const output=await packet(examFixture({exam_sittings:[recent],card_ideas}).context,args);
    expect(output).toContain('CARD IDEAS 2 open from Linear algebra final');
    expect(output).toContain('after the first course task');
    expect(output).toContain('NOW all checkpoints done');
    expect(await packet(examFixture({exam_sittings:[recent]}).context,args)).not.toContain('CARD IDEAS');
    const old=sitting({status:'finished',finished_at:'2026-11-01T08:00:00.000Z'});
    expect(await packet(examFixture({exam_sittings:[old],card_ideas}).context,args)).not.toContain('CARD IDEAS');
  });

  it('lists only active exams and annotates an ordinary deadline-passed flag', async () => {
    const activeProject={...examProject,deadline_at:'2026-11-20T08:00:00.000Z',last_study_on:'2026-11-20',time_confirmed:true};
    const waitingProject={...examProject,id:'topology',slug:'topology'};
    const fixture=examFixture({settings:[settings(true)],projects:[activeProject,waitingProject],
      exam_sittings:[sitting({},activeProject),sitting({status:'paused',title:'Topology final'},waitingProject)]});
    const list=await packet(fixture.context,{});
    expect(list).toMatch(/\nEXAM active: linear-algebra .*Linear algebra final/);
    expect(list).not.toContain('Topology final');
    const output=await packet(fixture.context,args);
    expect(output).toMatch(/- linear-algebra: deadline passed.*\(exam prep active: follow EXAM\)/);
  });

  it('keeps resume dormant without a sitting and skips system projects', async () => {
    const dormant=examFixture({exam_sittings:[]});
    expect(await packet(dormant.context,args)).not.toMatch(/\nEXAM|CARD IDEAS/);
    expect(dormant.reads.filter(read=>read.table==='exam_sittings')).toHaveLength(1);
    expect(dormant.reads.some(read=>['exam_attempts','card_ideas'].includes(read.table))).toBe(false);
    const project={...examProject,system:true};
    const system=examFixture({projects:[project],exam_sittings:[sitting({},project)]});
    system.context.selftestProjectIds=new Set([project.id]);
    expect(await packet(system.context,args)).not.toMatch(/\nEXAM|CARD IDEAS/);
    expect(system.reads.some(read=>read.table==='exam_sittings')).toBe(false);
  });

  it('advertises the exam planner without exhausting the instruction and rules budgets', () => {
    const instruction=INSTRUCTIONS.slice(INSTRUCTIONS.indexOf('Exam mode:'));
    expect(instruction).toContain('get(what=exam, project=<slug>)');
    expect(instruction).toContain('EXAM RULES');
    expect(instruction.length).toBeLessThan(300);
    expect(EXAM_RULES.length).toBeLessThan(1250);
  });
});
