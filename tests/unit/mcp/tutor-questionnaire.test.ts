import {describe, expect, it, vi} from 'vitest';
import {createHash, randomUUID} from 'node:crypto';
import type {Context} from '../../../supabase/functions/mcp/db';
// tutor-profile builds its zod schemas at load; a chainable stand-in is enough here, as the turn reads are mocked.
vi.mock('../../../supabase/functions/mcp/deps.ts', () => {
  const chain: any = new Proxy(function () {}, {get: (_, key) => key === 'safeParse' ? (data: unknown) => ({success: true, data}) : chain, apply: () => chain});
  return {z: chain, McpServer: class {}, createMcpHandler: () => null, createClient: () => null};
});
import {FOLLOWUP_NOTE, QUESTIONNAIRE_NOTE, tutorConnector} from '../../../supabase/functions/mcp/tutor-connector';

// N228 (Owner): the tutor attaches a quick questionnaire to its reply and reads the learner's answers to judge them.
const secret = '1'.repeat(48), owner = '11111111-1111-4111-8111-111111111111';
const turnId = randomUUID(), grant = randomUUID(), handoff = turnId + '.' + grant;
const questions = [
  {id: 'q1', kind: 'short', prompt: 'When is a surjection a quotient map?'},
  {id: 'q2', kind: 'mcq', prompt: 'Is every continuous surjection a quotient map?', options: ['Yes', 'No']},
  {id: 'q3', kind: 'msq', prompt: 'Which are always quotient maps?', options: ['Open surjections', 'Closed surjections']},
];
function connector(result: {data?: unknown; error?: {code: string; message?: string}} = {data: {status: 'created'}}) {
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

// N228 (Owner: "allow posting of messages even when tutor is not").
describe('follow-up messages on a waiting turn', () => {
  const replyInput = {command: {schemaVersion: 1 as const, resource: 'tutor_turns', operation: 'reply', operationId: randomUUID(), target: {id: handoff},
    expectedVersion: 3, patch: {claimId: randomUUID(), generation: 1, messageId: randomUUID(), body: 'Here is the reply.'}}};
  function routed(followups: {unseen: number; followups: {id: string; body: string; createdAt: string}[]}) {
    const rpc = vi.fn(async (fn: string, args: {p_command: Record<string, unknown>}) => {
      if (fn === 'tutor_followup_connector') return {data: followups, error: null};
      return {data: args.p_command.operation === 'get' ? {turnId, status: 'pending', version: 1, snapshot: {question: '17'}} : {status: 'completed'}, error: null};
    });
    return {tutor: tutorConnector({userId: owner, db: {rpc, from: () => {throw Error('no table reads');}}} as unknown as Context, secret), rpc};
  }
  it('arrive with the turn, oldest first, and are marked seen', async () => {
    const {tutor, rpc} = routed({unseen: 2, followups: [{id: 'a', body: 'Also part (b).', createdAt: '2026-11-23T10:00:00Z'}, {id: 'b', body: 'And I am stuck.', createdAt: '2026-11-23T10:01:00Z'}]});
    const turn = JSON.parse(await tutor.read(handoff));
    expect(turn.learnerFollowUps).toEqual([{text: 'Also part (b).', postedAt: '2026-11-23T10:00:00Z'}, {text: 'And I am stuck.', postedAt: '2026-11-23T10:01:00Z'}]);
    expect(turn.instructions).toContain(FOLLOWUP_NOTE);
    const call = rpc.mock.calls.find(([fn]) => fn === 'tutor_followup_connector')!;
    expect(call[1].p_command).toEqual({operation: 'followups', turnId, markSeen: true});
    const [summary] = await tutor.content(handoff);
    expect(summary.type === 'text' && JSON.parse(summary.text).learnerFollowUps).toEqual(turn.learnerFollowUps);
  });
  it('leave the turn as it was when there are none, and never hide the turn if they cannot be read', async () => {
    const quiet = routed({unseen: 0, followups: []});
    expect(JSON.parse(await quiet.tutor.read(handoff))).not.toHaveProperty('learnerFollowUps');
    const failing = {rpc: vi.fn(async (fn: string) => fn === 'tutor_followup_connector' ? {data: null, error: {code: 'XX'}} : {data: {turnId, status: 'pending', version: 1, snapshot: {question: '17'}}, error: null})};
    const tutor = tutorConnector({userId: owner, db: {...failing, from: () => {throw Error('no');}}} as unknown as Context, secret);
    expect(JSON.parse(await tutor.read(handoff)).snapshot.question).toBe('17');
  });
  it('reports an unread-message refusal from the reply transaction', async () => {
    const message = 'The learner posted 1 more message while you were writing. Read the follow-ups with get(what=tutor_followups, id=<handoff ID>).';
    const unread = connector({error: {code: 'P2281', message}});
    await expect(unread.tutor.write(replyInput)).rejects.toThrow(message);
    expect(unread.rpc.mock.calls.map(([name]) => name)).toEqual(['tutor_connector_command']);
    const clear = routed({unseen: 0, followups: []});
    await expect(clear.tutor.write(replyInput)).resolves.toMatchObject({status: 'completed'});
    expect(clear.rpc.mock.calls.map(([name]) => name)).toEqual(['tutor_connector_command']);
  });
  it('fails the reply if the database cannot check the follow-ups', async () => {
    const failing = connector({error: {code: 'XX000'}});
    await expect(failing.tutor.write(replyInput)).rejects.toThrow(/unavailable/);
    expect(failing.rpc.mock.calls.map(([name]) => name)).toEqual(['tutor_connector_command']);
  });
  it('does not mark unseen follow-ups when reading only an attachment or when attachments fail', async () => {
    const {tutor, rpc} = connector({data: {turnId, status: 'pending', hasAttachments: true}});
    await expect(tutor.attachment(handoff + '.' + randomUUID())).rejects.toThrow('no table reads');
    await expect(tutor.content(handoff)).rejects.toThrow('no table reads');
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['tutor_connector_command', 'tutor_connector_command']);
  });
});
