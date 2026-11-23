import {expect, test, type Page} from '@playwright/test';
import type {SavedTutorTurn, TutorThreadView} from '../../src/data/tutor/manual-api';
import {liveTutorFixtureResponse, prepareLiveTutor} from './helpers/live-tutor';

// N228 (Owner: "allow posting of messages even when tutor is not"): the learner keeps posting while a turn waits.
const url = '/lemma/?demo=0&flags=v7Shell,v6Shell,-tutorScratch#/p/logic/cp/CP1/tutor';
const turnId = '88888888-8888-4888-8888-888888888881';

async function waitingTurn(page: Page) {
  const {owner, cpId, threadId, payload} = await prepareLiveTutor(page);
  const turn: SavedTutorTurn = {id: turnId, threadId, sequence: 1, version: 1, status: 'awaiting-tutor',
    snapshot: {question: 'Is every continuous surjection a quotient map?', selectedContext: []}};
  const thread: TutorThreadView = {head: {threadId, lastSequence: 1, pendingTurnId: turnId}, turns: [turn], recoveredDrafts: [], canSubmit: true, canConnect: false};
  const server = {followups: [] as {id: string; turnId: string; body: string; createdAt: string; seen: boolean}[], adds: [] as Record<string, unknown>[], refuse: ''};
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
      const followup = {id: args.p_message, turnId, body: String(args.p_body).trim(), createdAt: new Date().toISOString(), seen: false};
      server.followups.push(followup);
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
