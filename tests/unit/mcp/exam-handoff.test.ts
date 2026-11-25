import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {EXAM_HANDOFF_NOTE} from '../../../supabase/functions/mcp/rules';
import {QUESTIONNAIRE_NOTE, tutorConnector} from '../../../supabase/functions/mcp/tutor-connector';
import {examFixture, now, other, owner, sitting} from './exam-fixture';

vi.mock('../../../supabase/functions/mcp/deps.ts', () => {
  const chain:unknown = new Proxy(() => chain,{get:(_,key)=>key==='safeParse'
    ? (data:unknown)=>({success:true,data}) : chain});
  return {z:chain,createClient:vi.fn()};
});

beforeEach(() => {vi.useFakeTimers(); vi.setSystemTime(new Date(now));});
afterEach(() => vi.useRealTimers());

const turnId='33333333-3333-4333-8333-333333333333';
const handoff=turnId+'.44444444-4444-4444-8444-444444444444';
const turn={turnId,status:'pending',version:1,snapshot:{question:'Which eigenvectors span the space?'}};
function fixture({failure,paused=false,finished=false,foreign=false,denied=false,examStatus,examQuestionnaireCursor}:{
  failure?:string;paused?:boolean;finished?:boolean;foreign?:boolean;denied?:boolean;examStatus?:'paused'|'finished';examQuestionnaireCursor?:string;
} = {}) {
  const setup=examFixture({
    exam_sittings:[sitting({status:examStatus??(paused?'paused':'active')})],
    tutor_turns:[{id:turnId,user_id:foreign?other:owner,tutor_threads:{project_id:'linear'}}],
  },{
    fail:failure,
    rpc:(name)=>name==='tutor_followup_connector'
      ? {data:{unseen:0,followups:[]},error:null}
      : denied ? {data:null,error:{message:'Grant is invalid'}}
      : {data:{...turn,status:finished?'completed':'pending',
        ...(examStatus?{examSittingId:'sitting',examProjectId:'linear',sittingStatus:examStatus,
          examQuestionnaireAnswers:[{questionId:'q1',answer:'2',deliveryRef:'questionnaire-id:q1'}]}:{}),
        examQuestionnaireCursor},error:null},
  });
  return {...setup,tutor:tutorConnector(setup.context,'a'.repeat(48))};
}

describe('pending tutor exam handoff', () => {
  it('includes the exam and instructions in both the text and MCP content shape', async () => {
    const {tutor,reads,rpcCalls}=fixture();
    const result=JSON.parse(await tutor.read(handoff));
    expect(result.snapshot).toEqual(turn.snapshot);
    expect(result.exam).toEqual({
      sittingId:'sitting',title:'Linear algebra final',startsLocal:expect.stringContaining('09:30'),
      timeLeft:'in 1 d 18 h',phase:'screen',cardMode:'later',planner:'get(what=exam, id=sitting)',
    });
    expect(result.instructions).toContain(QUESTIONNAIRE_NOTE);
    expect(result.instructions.endsWith(EXAM_HANDOFF_NOTE)).toBe(true);
    expect(rpcCalls[0]).toMatchObject(['tutor_connector_command',{p_owner:owner,p_command:{operation:'get',turnId}}]);
    expect(reads.find(read=>read.table==='tutor_turns')?.filters).toEqual(expect.arrayContaining([
      ['eq','user_id',owner],['eq','id',turnId],
    ]));
    expect(reads.find(read=>read.table==='exam_sittings')?.filters).toEqual(expect.arrayContaining([
      ['eq','user_id',owner],['eq','project_id','linear'],['eq','status','active'],
    ]));
    const [content]=await tutor.content(handoff);
    if(content.type!=='text') throw Error('Expected a text handoff');
    expect(JSON.parse(content.text)).toMatchObject({exam:result.exam,instructions:result.instructions});
  });

  it.each([{failure:'tutor_turns'},{failure:'exam_sittings'},{paused:true},{foreign:true}])(
    'keeps the normal handoff when an active exam is unavailable (%o)', async options => {
      const {tutor}=fixture(options);
      const result=JSON.parse(await tutor.read(handoff));
      expect(result.snapshot).toEqual(turn.snapshot);
      expect(result).not.toHaveProperty('exam');
      expect(result.instructions).toContain(QUESTIONNAIRE_NOTE);
      expect(result.instructions).not.toContain(EXAM_HANDOFF_NOTE);
    },
  );

  it.each([
    ['paused',/ordinary-study style.*original deliveryRef/],
    ['finished',/answers as saved.*unscored unless the learner reopens/],
  ] as const)('preserves a late submission and gives a %s mode-change notice', async (examStatus,notice) => {
    const {tutor,reads}=fixture({examStatus});
    const result=JSON.parse(await tutor.read(handoff));
    expect(result.exam.status).toBe(examStatus);
    expect(result.instructions).toContain('The sitting is '+examStatus);
    expect(result.instructions).toMatch(notice);
    expect(result.examQuestionnaireAnswers).toEqual([{questionId:'q1',answer:'2',deliveryRef:'questionnaire-id:q1'}]);
    expect(reads.some(read=>read.table==='tutor_turns')).toBe(false);
  });

  it('forwards the backlog cursor through the same grant and explains the next page', async () => {
    const cursor='55555555-5555-4555-8555-555555555555:q1';
    const {tutor,rpcCalls}=fixture({examStatus:'paused',examQuestionnaireCursor:cursor});
    const [content]=await tutor.content(handoff,cursor);
    if(content.type!=='text') throw Error('Expected a text handoff');
    expect(JSON.parse(content.text)).toMatchObject({examQuestionnaireCursor:cursor,
      instructions:expect.stringContaining('cursor=<examQuestionnaireCursor>')});
    expect(rpcCalls[0]).toMatchObject(['tutor_connector_command',{p_owner:owner,
      p_grant_operation_id:handoff.split('.')[1],p_command:{operation:'get',turnId,cursor}}]);
  });

  it('skips lookup on completed turns and denied grants', async () => {
    const completed=fixture({finished:true});
    expect(JSON.parse(await completed.tutor.read(handoff))).toEqual({...turn,status:'completed'});
    expect(completed.reads).toHaveLength(0);
    const denied=fixture({denied:true});
    await expect(denied.tutor.read(handoff)).rejects.toThrow(/unavailable/i);
    expect(denied.reads).toHaveLength(0);
  });
});
