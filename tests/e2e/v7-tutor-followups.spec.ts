import {expect, test, type Page} from '@playwright/test';
import type {SavedTutorTurn, TutorThreadView} from '../../src/data/tutor/manual-api';
import {blockTutorDraftWrites, liveTutorFixtureResponse, prepareLiveTutor} from './helpers/live-tutor';

// N228 (Owner: "allow posting of messages even when tutor is not"): the learner keeps posting while a turn waits.
const url = '/lemma/?demo=0&flags=v7Shell,v6Shell,-tutorScratch#/p/logic/cp/CP1/tutor';
const turnId = '88888888-8888-4888-8888-888888888881';

async function waitingTurn(page: Page) {
  const {owner, cpId, threadId, payload} = await prepareLiveTutor(page);
  const turn: SavedTutorTurn = {id: turnId, threadId, sequence: 1, version: 1, status: 'awaiting-tutor',
    snapshot: {question: 'Is every continuous surjection a quotient map?', selectedContext: []}};
  const thread: TutorThreadView = {head: {threadId, lastSequence: 1, pendingTurnId: turnId}, turns: [turn], recoveredDrafts: [], canSubmit: true, canConnect: false};
  const server = {followups: [] as {id: string; turnId: string; body: string; createdAt: string; seen: boolean}[], adds: [] as Record<string, unknown>[], refuse: '', loseResponse: false, thread};
  await page.route('**/rest/v1/**', route => {
    const request = route.request(), resource = new URL(request.url()).pathname.split('/rest/v1/')[1];
    if (!resource.startsWith('rpc/tutor_')) return route.fulfill({json: liveTutorFixtureResponse(payload, resource, request.headers().accept)});
    const args = request.postDataJSON();
    if (resource === 'rpc/tutor_thread_state') return route.fulfill({json: thread});
    if (resource === 'rpc/tutor_questionnaire_state') return route.fulfill({json: []});
    if (resource === 'rpc/tutor_followup_state') return route.fulfill({json: server.followups});
    if (resource === 'rpc/tutor_followup_add') {
      expect([args.p_owner, args.p_slug, args.p_checkpoint, args.p_turn]).toEqual([owner, 'logic', cpId, turnId]);
      server.adds.push(args);
      if (server.refuse) return route.fulfill({status: 400, json: {code: server.refuse, message: 'refused'}});
      const existing = server.followups.find(item => item.id === args.p_message);
      const followup = existing ?? {id: args.p_message, turnId, body: String(args.p_body).trim(), createdAt: new Date().toISOString(), seen: false};
      if (!existing) server.followups.push(followup);
      if (server.loseResponse) {
        server.loseResponse = false;
        return route.abort('timedout');
      }
      return route.fulfill({json: {status: 'saved', followup}});
    }
    return route.fulfill({json: []});
  });
  await page.goto(url);
  return server;
}
const tutor = (page: Page) => page.getByRole('main', {name: 'Checkpoint tutor'});
const answer = (page: Page) => tutor(page).getByRole('textbox', {name: 'Your answer', exact: true});
const send = (page: Page) => tutor(page).getByRole('button', {name: 'Send', exact: true});

test('a slow send shows a provisional message and restores the draft after rejection',async({page})=>{
  const server=await waitingTurn(page);
  await expect(tutor(page).getByText(/Waiting for/)).toBeVisible();
  let respond!:()=>void;
  const held=new Promise<void>(resolve=>{respond=resolve});
  await page.route('**/rpc/tutor_followup_add',async route=>{await held;await route.fallback()});
  const text='Can we check this implication?';
  server.refuse='40001';
  await answer(page).fill(text);
  await send(page).click();
  const preview=tutor(page).locator('[aria-label="Outgoing message"]');
  try{
    await expect(preview).toContainText(text);
    await expect(preview).toContainText('Sending…');
    await expect(send(page)).toBeDisabled();
  }finally{respond()}
  await expect(tutor(page).getByText(/The tutor has just replied/)).toBeVisible();
  await expect(preview).toHaveCount(0);
  await expect(answer(page)).toHaveText(text);
  expect(server.adds).toHaveLength(1);
});

test('messages can be posted while the tutor has not replied, each kept with the waiting question', async ({page}) => {
  await page.setViewportSize({width: 393, height: 873});
  const server = await waitingTurn(page);
  await expect(tutor(page).getByText(/Waiting for/)).toBeVisible();
  await expect(tutor(page).getByText('Is every continuous surjection a quotient map?')).toBeVisible();
  await expect(answer(page)).toHaveAttribute('data-placeholder', /Add to your question/).catch(() => undefined);
  await answer(page).fill('Also, I think the answer to (a) is about open sets.');
  await expect(send(page)).toBeEnabled();
  await send(page).click();
  await expect(tutor(page).getByText('Also, I think the answer to (a) is about open sets.')).toBeVisible();
  await expect(answer(page)).toHaveText('');
  expect(server.adds).toHaveLength(1);
  expect(server.adds[0].p_body).toBe('Also, I think the answer to (a) is about open sets.');
  expect(String(server.adds[0].p_message)).toMatch(/^[0-9a-f-]{36}$/);
  // And another: it joins the same turn, after the first.
  await answer(page).fill('And I am stuck on (b).');
  await send(page).click();
  await expect(tutor(page).locator('[data-followup]')).toHaveText([/open sets/, /stuck on \(b\)/]);
  expect(new Set(server.adds.map(add => add.p_message)).size).toBe(2);
  // They are still there after a reload.
  await page.reload();
  await expect(tutor(page).locator('[data-followup]')).toHaveCount(2);
});

test('a message the server refuses stays in the box with a plain reason', async ({page}) => {
  await page.setViewportSize({width: 393, height: 873});
  const server = await waitingTurn(page);
  server.refuse = '40001';
  await answer(page).fill('One more thing.');
  await send(page).click();
  await expect(tutor(page).getByText(/The tutor has just replied/)).toBeVisible();
  await expect(answer(page)).toContainText('One more thing.');
  await expect(tutor(page).locator('[data-followup]')).toHaveCount(0);
});

test('a committed follow-up with a lost response can be retried after reload and reply', async ({page}) => {
  const server = await waitingTurn(page);
  server.loseResponse = true;
  const body = 'I also have a question about injectivity.';
  await answer(page).fill(body);
  await send(page).click();
  await expect(tutor(page).getByText(/Could not confirm your message/)).toBeVisible();
  await expect(answer(page)).toHaveText(body);
  expect(server.followups).toHaveLength(1);

  server.thread.head = {...server.thread.head, pendingTurnId: null};
  server.thread.turns = [{...server.thread.turns[0], status: 'completed', version: 2, finalReply: {
    turnId, messageId: 'reply', body: 'Here are answers to both questions.',
    provenance: {kind: 'connector', reportedHost: 'claude', hostVerified: false}, citations: [], suggestions: [],
  }}];
  await page.reload();
  await expect(tutor(page).getByRole('article', {name: 'Tutor reply'}).getByText('Here are answers to both questions.')).toBeVisible();
  await expect(answer(page)).toHaveText(body);
  await send(page).click();
  await expect(answer(page)).toHaveText('');
  expect(server.adds.map(add => add.p_message)).toEqual([server.followups[0].id, server.followups[0].id]);
  await expect(tutor(page).locator('[data-followup]')).toHaveText([body]);
});

test('the composer requires a saved retry ID before a follow-up can reach the server', async ({page}) => {
  const server = await waitingTurn(page);
  const restoreWrites = await blockTutorDraftWrites(page, ':followup');
  server.loseResponse = true;
  const body = 'One more question about the converse.';
  await answer(page).fill(body);

  const warning = tutor(page).getByRole('alert').filter({hasText: /could not save the follow-up for retry/});
  await send(page).click();
  await expect(warning).toBeVisible();
  await expect(answer(page)).toHaveText(body);
  expect(server.adds).toHaveLength(0);

  // The failed write left an in-memory ID. Another click still requires persistence.
  await send(page).click();
  await expect(send(page)).toBeEnabled();
  await expect(warning).toBeVisible();
  expect(server.adds).toHaveLength(0);

  await restoreWrites();
  await send(page).click();
  await expect(tutor(page).getByText(/Could not confirm your message/)).toBeVisible();
  await expect(warning).toHaveCount(0);
  expect(server.followups).toHaveLength(1);

  await page.reload();
  await expect(answer(page)).toHaveText(body);
  await send(page).click();
  await expect(answer(page)).toHaveText('');
  expect(server.adds.map(add => add.p_message)).toEqual([server.followups[0].id, server.followups[0].id]);
  await expect(tutor(page).locator('[data-followup]')).toHaveText([body]);
});
