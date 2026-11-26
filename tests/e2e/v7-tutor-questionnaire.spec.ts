import {expect, test, type Page} from '@playwright/test';
import type {SavedTutorTurn, TutorThreadView} from '../../src/data/tutor/manual-api';
import type {QuestionnaireAnswers, TutorQuestionnaire} from '../../supabase/functions/_shared/tutor-questionnaire';
import {blockTutorDraftWrites, liveTutorFixtureResponse, prepareLiveTutor} from './helpers/live-tutor';

// N228 (Owner): "Add the quick questionnaire that can contain short answer type MCQ or msq type questions, these tutor can
// attach along with chat head show the option of open questionnaire in the reply row and use icon color to show if
// questionnaire is complete, student had started it but not completed and student has not seen, maintain data so that it
// can filled later on and nothing is lost."
const url = '/lemma/?demo=0&flags=v7Shell,v6Shell,-tutorScratch#/p/logic/cp/CP1/tutor';
const questionnaireId = '77777777-7777-4777-8777-777777777777';
const turnId = '88888888-8888-4888-8888-888888888881';

async function liveQuestionnaire(page: Page, withMath = false) {
  const {owner, cpId, threadId, payload} = await prepareLiveTutor(page);
  const turn: SavedTutorTurn = {id: turnId, threadId, sequence: 1, version: 2, status: 'completed',
    snapshot: {question: 'The converse reverses the hypothesis and conclusion.', selectedContext: []},
    finalReply: {turnId, messageId: 'reply', body: 'Close. A quick check is attached below.',
      nextQuestion: withMath ? 'Which number divides $6$, $4$ and $0$?' : undefined,
      provenance: {kind: 'connector', reportedHost: 'claude', hostVerified: false}, citations: [], suggestions: []}};
  const thread: TutorThreadView = {head: {threadId, lastSequence: 1, pendingTurnId: null}, turns: [turn], recoveredDrafts: [], canSubmit: true, canConnect: true};
  const server = {
    questionnaire: {id: questionnaireId, turnId, title: 'Quick check', purpose: 'diagnose', state: 'unseen', answers: {}, version: 0,
      questions: [
        {id: 'q1', kind: 'short', prompt: 'In your own words, when is a surjection a quotient map?'},
        {id: 'q2', kind: 'mcq', prompt: withMath ? 'Let $D=\\operatorname{diag}(3,12)$. Which group is $\\mathbb{Z}^2/D\\mathbb{Z}^2$?' : 'Is every continuous surjection a quotient map?',
          options: withMath ? ['$\\mathbb{Z}/36\\mathbb{Z}$', '$\\mathbb{Z}/3\\mathbb{Z} \\oplus \\mathbb{Z}/12\\mathbb{Z}$'] : ['Yes', 'No']},
        {id: 'q3', kind: 'msq', prompt: withMath ? 'Which Jordan block sizes are possible if $N^3=0$?' : 'Which of these are always quotient maps?',
          options: withMath ? ['$3,1$', '$2,1,1$', '$4$'] : ['Open surjections', 'Closed surjections', 'Constant maps']},
      ]} as TutorQuestionnaire,
    saves: [] as {expected: number; answers: QuestionnaireAnswers | null; submit: boolean}[],
    failing: false,
  };
  await page.route('**/rest/v1/**', route => {
    const request = route.request(), resource = new URL(request.url()).pathname.split('/rest/v1/')[1];
    if (!resource.startsWith('rpc/tutor_')) return route.fulfill({json: liveTutorFixtureResponse(payload, resource, request.headers().accept)});
    const args = request.postDataJSON();
    if (resource === 'rpc/tutor_thread_state') return route.fulfill({json: thread});
    if (resource === 'rpc/tutor_questionnaire_state') {
      expect([args.p_owner, args.p_slug, args.p_checkpoint]).toEqual([owner, 'logic', cpId]);
      return route.fulfill({json: [server.questionnaire]});
    }
    if (resource === 'rpc/tutor_questionnaire_save') {
      expect([args.p_owner, args.p_questionnaire]).toEqual([owner, questionnaireId]);
      if (server.failing) return route.fulfill({status: 503, json: {message: 'offline'}});
      server.saves.push({expected: args.p_expected_version, answers: args.p_answers, submit: args.p_submit});
      const q = server.questionnaire;
      if (q.state === 'complete') return route.fulfill({json: {status: 'submitted', questionnaire: q}});
      if (args.p_expected_version !== q.version) return route.fulfill({json: {status: 'conflict', questionnaire: q}});
      server.questionnaire = {...q, answers: args.p_answers ?? q.answers, version: q.version + 1,
        state: args.p_submit ? 'complete' : 'started', submittedAt: args.p_submit ? new Date().toISOString() : null};
      return route.fulfill({json: {status: args.p_submit ? 'submitted' : 'saved', questionnaire: server.questionnaire}});
    }
    return route.fulfill({json: []});
  });
  await page.goto(url);
  return server;
}

const tutor = (page: Page) => page.getByRole('main', {name: 'Checkpoint tutor'});
const opener = (page: Page) => tutor(page).getByRole('group', {name: 'Reply actions'}).getByRole('button', {name: /^Open questionnaire: Quick check/});
const sheet = (page: Page) => page.getByRole('dialog', {name: 'Quick check'});
const closeSheet = (page: Page) => sheet(page).getByRole('button', {name: 'Close', exact: true}).click();

test('tutor-set math renders in the question banner and in selectable quiz answers', async ({page}) => {
  await liveQuestionnaire(page, true);
  await expect(page.locator('.tutor-pinned .katex')).toHaveCount(3);
  await opener(page).click();
  const form = sheet(page);
  await expect(form.locator('.v7-radio-row .katex')).toHaveCount(2);
  await expect(form.locator('.v7-check-choice .katex')).toHaveCount(3);
  await form.locator('.v7-radio-row .katex').nth(1).click();
  const choice = form.locator('.v7-check-choice').first();
  await choice.scrollIntoViewIfNeeded();
  const formula = (await choice.locator('.katex').boundingBox())!;
  await page.mouse.click(formula.x + formula.width / 2, formula.y + formula.height / 2);
  await expect(form.getByRole('radio').nth(1)).toBeChecked();
  await expect(form.getByRole('checkbox').first()).toBeChecked();
});

test('a quick questionnaire opens from the reply row, its colour tracks its state, and every answer is kept', async ({page}) => {
  await page.setViewportSize({width: 393, height: 873});
  const server = await liveQuestionnaire(page);
  // Not seen yet: the selection colour, and the label says so.
  await expect(opener(page)).toHaveAccessibleName('Open questionnaire: Quick check · not opened');
  await expect(opener(page)).toHaveAttribute('data-questionnaire', 'unseen');
  // The icon's colour is the state's role colour.
  const iconColour = () => opener(page).evaluate(node => getComputedStyle(node).color);
  const roleColour = (token: string) => page.evaluate(name => {
    const probe = document.createElement('span');
    probe.style.color = 'var(' + name + ')';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
  expect(await iconColour()).toBe(await roleColour('--v7-role-selection-fg'));

  await opener(page).click();
  await expect(sheet(page)).toBeVisible();
  await expect.poll(() => server.saves[0]).toEqual({expected: 0, answers: null, submit: false});
  await expect(sheet(page).getByRole('button', {name: 'Submit answers'})).toBeDisabled();
  await sheet(page).getByRole('textbox', {name: 'Answer to question 1'}).fill('When a set is open exactly when its preimage is open.');
  await sheet(page).getByRole('radio', {name: 'No'}).check();
  await expect.poll(() => server.questionnaire.answers).toEqual({q1: 'When a set is open exactly when its preimage is open.', q2: 1});
  await expect(sheet(page).getByRole('status')).toContainText('Saved');
  await closeSheet(page);
  await expect(opener(page)).toHaveAttribute('data-questionnaire', 'started');
  await expect(opener(page)).toHaveAccessibleName('Open questionnaire: Quick check · in progress');
  expect(await iconColour()).toBe(await roleColour('--v7-role-status-warning'));

  // Filled later: a reload brings the saved answers back.
  await page.reload();
  await opener(page).click();
  await expect(sheet(page).getByRole('textbox', {name: 'Answer to question 1'})).toHaveValue('When a set is open exactly when its preimage is open.');
  await expect(sheet(page).getByRole('radio', {name: 'No'})).toBeChecked();

  // Offline: the answer stays on the device, and reaches Lemma once it can.
  server.failing = true;
  await sheet(page).getByRole('checkbox', {name: 'Open surjections'}).check();
  await expect(sheet(page).getByRole('status')).toContainText('kept on this device');
  await page.reload();
  await opener(page).click();
  await expect(sheet(page).getByRole('checkbox', {name: 'Open surjections'})).toBeChecked();
  server.failing = false;
  await closeSheet(page);
  await expect.poll(() => server.questionnaire.answers).toMatchObject({q3: [0]});

  // Answered on another device meanwhile: both sets of answers are kept.
  server.questionnaire = {...server.questionnaire, version: server.questionnaire.version + 1,
    answers: {...server.questionnaire.answers, q1: 'Edited on my tablet.'}};
  await opener(page).click();
  await sheet(page).getByRole('checkbox', {name: 'Closed surjections'}).check();
  await expect.poll(() => server.questionnaire.answers).toEqual({q1: 'Edited on my tablet.', q2: 1, q3: [0, 1]});
  await expect(sheet(page).getByRole('textbox', {name: 'Answer to question 1'})).toHaveValue('Edited on my tablet.');

  // Every question answered: Submit sends it to the tutor, and it is shown as complete.
  await sheet(page).getByRole('button', {name: 'Submit answers'}).click();
  await expect(sheet(page).getByRole('status')).toContainText('Submitted');
  await expect(sheet(page).getByRole('radio', {name: 'Yes'})).toBeDisabled();
  expect(server.saves.at(-1)?.submit).toBe(true);
  await closeSheet(page);
  await expect(opener(page)).toHaveAttribute('data-questionnaire', 'complete');
  await expect(opener(page)).toHaveAccessibleName('Open questionnaire: Quick check · complete');
  expect(await iconColour()).toBe(await roleColour('--v7-role-status-success'));
});

test('offline edits and a cleared answer survive a reload after a newer save on another device', async ({page}) => {
  const server = await liveQuestionnaire(page);
  await opener(page).click();
  const first = sheet(page).getByRole('textbox', {name: 'Answer to question 1'});
  const openMaps = sheet(page).getByRole('checkbox', {name: 'Open surjections'});
  await first.fill('A previous answer.');
  await sheet(page).getByRole('radio', {name: 'No'}).check();
  await expect(sheet(page).getByRole('status')).toContainText('Saved');
  await expect.poll(() => server.questionnaire.answers).toEqual({q1: 'A previous answer.', q2: 1});

  server.failing = true;
  await first.fill('');
  await openMaps.check();
  await expect(sheet(page).getByRole('status')).toContainText('kept on this device');
  server.questionnaire = {...server.questionnaire, version: server.questionnaire.version + 1,
    answers: {...server.questionnaire.answers, q2: 0}};

  await page.reload();
  await opener(page).click();
  await expect(first).toHaveValue('');
  await expect(openMaps).toBeChecked();
  await expect(sheet(page).getByRole('radio', {name: 'Yes'})).toBeChecked();
  server.failing = false;
  await closeSheet(page);
  await expect.poll(() => server.questionnaire.answers).toEqual({q2: 0, q3: [0]});
  await page.reload();
  await opener(page).click();
  await expect(first).toHaveValue('');
  await expect(openMaps).toBeChecked();
});

test('a failed device backup stays visible when the questionnaire save fails', async ({page}) => {
  const server = await liveQuestionnaire(page);
  await opener(page).click();
  await expect.poll(() => server.questionnaire.state).toBe('started');
  const restoreWrites = await blockTutorDraftWrites(page, ':questionnaire:' + questionnaireId);
  server.failing = true;

  const answer = sheet(page).getByRole('textbox', {name: 'Answer to question 1'});
  const status = sheet(page).getByRole('status');
  const warning = sheet(page).getByRole('alert');
  const text = 'I would check the open sets and their preimages.';
  await answer.fill(text);
  await expect(warning).toContainText('Device backup failed');
  await expect(status).toHaveText('Your answers were not saved yet.');
  await expect(warning).toContainText('Keep this questionnaire open');
  await expect(answer).toHaveValue(text);
  expect(server.questionnaire.answers).toEqual({});

  // The same answer can reach the server while device storage is still full.
  server.failing = false;
  await sheet(page).getByRole('button', {name: 'Retry save'}).click();
  await expect(status).toContainText('Saved.');
  await expect(warning).toHaveCount(0);
  expect(server.questionnaire.answers).toEqual({q1: text});
  await restoreWrites();
  await page.reload();
  await opener(page).click();
  await expect(answer).toHaveValue(text);
});
