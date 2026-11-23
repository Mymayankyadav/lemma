import {describe, expect, it, vi} from 'vitest';
import {createHash, randomUUID} from 'node:crypto';
import type {Context} from '../../../supabase/functions/mcp/db';
// tutor-profile builds its zod schemas at load; a chainable stand-in is enough here, as the turn reads are mocked.
vi.mock('../../../supabase/functions/mcp/deps.ts', () => {
  const chain: any = new Proxy(function () {}, {get: (_, key) => key === 'safeParse' ? (data: unknown) => ({success: true, data}) : chain, apply: () => chain});
  return {z: chain, McpServer: class {}, createMcpHandler: () => null, createClient: () => null};
});
import {QUESTIONNAIRE_NOTE, tutorConnector} from '../../../supabase/functions/mcp/tutor-connector';

// N228 (Owner): the tutor attaches a quick questionnaire to its reply and reads the learner's answers to judge them.
const secret = '1'.repeat(48), owner = '11111111-1111-4111-8111-111111111111';
const turnId = randomUUID(), grant = randomUUID(), handoff = turnId + '.' + grant;
const questions = [
  {id: 'q1', kind: 'short', prompt: 'When is a surjection a quotient map?'},
  {id: 'q2', kind: 'mcq', prompt: 'Is every continuous surjection a quotient map?', options: ['Yes', 'No']},
  {id: 'q3', kind: 'msq', prompt: 'Which are always quotient maps?', options: ['Open surjections', 'Closed surjections']},
];
function connector(result: {data?: unknown; error?: {code: string}} = {data: {status: 'created'}}) {
  const rpc = vi.fn().mockResolvedValue({data: result.data ?? null, error: result.error ?? null});
  const c = {userId: owner, db: {rpc, from: () => {throw Error('no table reads');}}} as unknown as Context;
  return {tutor: tutorConnector(c, secret), rpc};
}
const create = (patch: Record<string, unknown>, operationId = randomUUID()) => ({command: {
  schemaVersion: 1 as const, resource: 'tutor_questionnaires', operation: 'create', operationId, target: {id: handoff}, patch}});

describe('tutor questionnaires over MCP', () => {
  it('attaches a questionnaire to the handoff\'s turn, its ID being the operation ID', async () => {
    const {tutor, rpc} = connector();
    const operationId = randomUUID();
    await tutor.attachQuestionnaire(create({title: 'Quick check', purpose: 'diagnose', questions}, operationId));
    expect(rpc).toHaveBeenCalledWith('tutor_questionnaire_connector', {
      p_owner: owner, p_connector_hash: createHash('sha256').update(secret).digest('hex'), p_grant_operation_id: grant,
      p_command: {operation: 'create', questionnaireId: operationId, title: 'Quick check', purpose: 'diagnose', questions, turnId},
    });
  });
  it('refuses malformed questionnaires before they reach Lemma', async () => {
    const {tutor, rpc} = connector();
    for (const patch of [
      {title: 'x', questions: []},
      {title: 'x', questions: [{id: 'q1', kind: 'mcq', prompt: 'One option', options: ['Only']}]},
      {title: 'x', questions: [{id: 'q1', kind: 'short', prompt: 'A'}, {id: 'q1', kind: 'short', prompt: 'B'}]},
      {title: 'x', questions: [{id: 'q1', kind: 'short', prompt: 'A', options: ['a', 'b']}]},
      {title: 'x', purpose: 'grade', questions},
      {title: 'x', questions, learner: 'other'},
    ]) await expect(tutor.attachQuestionnaire(create(patch))).rejects.toThrow(/Invalid questionnaire/);
    await expect(tutor.attachQuestionnaire({command: {...create({title: 'x', questions}).command, operation: 'update'}})).rejects.toThrow(/create/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('explains why Lemma refused it', async () => {
    for (const [code, message] of [['40001', /Reply to the turn/], ['23505', /fresh operationId/], ['42501', /unavailable/]] as const) {
      const {tutor} = connector({error: {code}});
      await expect(tutor.attachQuestionnaire(create({title: 'x', questions}))).rejects.toThrow(message);
    }
  });
  it('reads the thread\'s questionnaires with the learner\'s answers', async () => {
    const listed = {questionnaires: [{id: randomUUID(), state: 'started', answers: {q2: 1}}]};
    const {tutor, rpc} = connector({data: listed});
    expect(JSON.parse(await tutor.questionnaires(handoff))).toEqual(listed);
    expect(rpc.mock.calls[0][1].p_command).toEqual({operation: 'list', turnId});
  });
  it('tells the tutor what the option is for, every handoff', async () => {
    for (const phrase of ['tutor_questionnaires', 'diagnose', 'check', 'practice', 'reflect', 'exit', 'unseen, started or complete', 'save_progress'])
      expect(QUESTIONNAIRE_NOTE).toContain(phrase);
    const {tutor} = connector({data: {turnId, status: 'pending', version: 1, snapshot: {question: '17'}}});
    expect(JSON.parse(await tutor.read(handoff)).instructions).toContain(QUESTIONNAIRE_NOTE);
  });
});
