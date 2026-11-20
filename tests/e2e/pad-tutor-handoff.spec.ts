import {expect, test, type Locator} from '@playwright/test';
import type {TutorThreadView} from '../../src/data/tutor/manual-api';

async function select(notes: Locator, excerpt: string) {
  await notes.evaluate((element, text) => {
    const field = element as HTMLTextAreaElement, start = field.value.indexOf(text);
    if (start < 0) throw new Error('Missing selected excerpt');
    field.focus(); field.setSelectionRange(start, start + text.length);
    field.dispatchEvent(new Event('select', {bubbles: true}));
  }, excerpt);
}

test('saved Pad selection reaches the canonical tutor only through preview, Add and Save', async ({page}) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto('./?demo=1&flags=v7Shell,padLocal,tutorManualDemo#/pad?path=real-analysis&checkpoint=CP4');
  await expect(page.getByRole('button', {name: 'Open manual tutor'})).toHaveCount(1);
  const notes = page.getByRole('textbox', {name: 'Pad notes'});
  const excerpt = '  Selected proof step\n∀ x ∈ ℝ  ';
  await notes.fill('Private beginning |' + excerpt + '| private ending');
  await select(notes, excerpt);
  await page.getByRole('button', {name: 'Send selection to tutor'}).click();
  const dialog = page.getByRole('dialog', {name: 'Manual tutor'});
  await expect(dialog.getByRole('region', {name: 'Local excerpt preview'}).locator('p')).toHaveText(excerpt, {useInnerText: false});
  await dialog.getByLabel('Question', {exact: true}).fill('Help me finish this step.');
  await expect(dialog.getByRole('button', {name: 'Save question', exact: true})).toBeDisabled();
  await expect(dialog.getByRole('region', {name: 'Attached local excerpt'})).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Add local excerpt'}).click();
  await dialog.getByRole('button', {name: 'Close', exact: true}).click();
  await notes.fill('Later private changes stay in the Pad.');
  await page.getByRole('button', {name: 'Open manual tutor'}).click();
  await dialog.getByRole('button', {name: 'Save question', exact: true}).click();
  await expect(dialog.getByLabel('Text for your tutor')).toHaveValue(
    'Help me finish this step.\n\nLocal excerpt (learner-provided; not a citation):\n' + excerpt,
  );
  await dialog.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(notes).toHaveValue('Later private changes stay in the Pad.');
});

test('full Pad checkpoint navigation preserves unsaved notes and ink until an explicit save or discard', async ({page}) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto('./?demo=1&flags=v7Shell,padLocal,tutorManualDemo#/pad?path=real-analysis&checkpoint=CP4');
  const notes = page.getByRole('textbox', {name: 'Pad notes'}), drawing = page.getByRole('img', {name: 'Pad drawing'});
  await notes.fill('Keep my unsaved proof.');
  await drawing.scrollIntoViewIfNeeded();
  const box = await drawing.boundingBox();
  if (!box) throw new Error('Pad drawing is not visible');
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 60, {steps: 3}); await page.mouse.up();
  await expect(drawing.locator('path')).toHaveCount(1);
  const stroke = await drawing.locator('path').getAttribute('d');
  await page.getByLabel('Checkpoint', {exact: true}).selectOption('CP2');
  const leave = page.getByRole('dialog', {name: 'Save your Pad before leaving?'});
  await leave.getByRole('button', {name: 'Keep editing'}).click();
  await expect(notes).toHaveValue('Keep my unsaved proof.');
  await expect(drawing.locator('path')).toHaveAttribute('d', stroke!);
  await page.getByLabel('Checkpoint', {exact: true}).selectOption('CP2');
  await leave.getByRole('button', {name: 'Save and leave'}).click();
  await expect(notes).toHaveValue('');
  await page.getByLabel('Checkpoint', {exact: true}).selectOption('CP4');
  await expect(notes).toHaveValue('Keep my unsaved proof.');
  await expect(drawing.locator('path')).toHaveAttribute('d', stroke!);
  await notes.fill('Discard just this newer edit.');
  await page.getByLabel('Checkpoint', {exact: true}).selectOption('CP2');
  await leave.getByRole('button', {name: 'Discard and leave'}).click();
  await expect(notes).toHaveValue('');
  await page.getByLabel('Checkpoint', {exact: true}).selectOption('CP4');
  await expect(notes).toHaveValue('Keep my unsaved proof.');
});

test('the live full Pad sends no tutor command before Save and includes only the selected excerpt', async ({page}) => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const projectId = '22222222-2222-4222-8222-222222222222';
  const checkpointId = '33333333-3333-4333-8333-333333333333';
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const user = {id: owner, email: 'pad@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}};
  const token = [encode({alg: 'HS256', typ: 'JWT'}), encode({sub: owner, role: 'authenticated', exp: expires}), 'fixture'].join('.');
  await page.addInitScript(({user, token, expires}) => localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token', JSON.stringify({
    user, access_token: token, refresh_token: 'local-fixture', token_type: 'bearer', expires_at: expires, expires_in: 3600,
  })), {user, token, expires});
  const project = {id: projectId, user_id: owner, slug: 'analysis', title: 'Analysis', status: 'active', system: false};
  const checkpoint = {id: checkpointId, user_id: owner, project_id: projectId, code: 'CP4', title: 'Compactness',
    steps: [], current_step: 0, status: 'pending', objective: 'Prove compactness.', position: 1};
  const settings = {time_zone: 'UTC', rollover_hour: 4, default_style: 'socratic', new_per_day: 20, reviews_per_day: 200, desired_retention: .9, flags: {}};
  let thread: TutorThreadView = {head: {threadId: null, pendingTurnId: null, lastSequence: 0}, turns: [], recoveredDrafts: [], canSubmit: true, canConnect: false};
  const writes: Record<string, unknown>[] = [];
  await page.route('https://**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    let data: unknown;
    if (url.pathname === '/auth/v1/user') data = user;
    else if (url.pathname === '/rest/v1/rpc/lemma_plan_released') data = true;
    else if (url.pathname === '/rest/v1/settings' || url.pathname === '/rest/v1/rpc/bootstrap') data = settings;
    else if (url.pathname === '/rest/v1/projects') data = [project];
    else if (url.pathname === '/rest/v1/checkpoints') data = [checkpoint];
    else if (url.pathname === '/rest/v1/rpc/tutor_thread_state') data = thread;
    else if (url.pathname === '/rest/v1/rpc/tutor_owner_command') {
      const args = request.postDataJSON(), command = args.p_command;
      writes.push(args);
      const turn = {id: command.operationId, threadId: 'thread', sequence: 1, version: 1, status: 'awaiting-tutor' as const,
        snapshot: {question: command.question, selectedContext: [], localExcerpt: {kind: 'local-excerpt' as const, text: command.localExcerpt}}};
      thread = {...thread, head: {threadId: 'thread', pendingTurnId: turn.id, lastSequence: 1}, turns: [turn]};
      data = {status: 'submitted', operationId: command.operationId};
    } else if (url.pathname.startsWith('/rest/v1/')) data = [];
    else return route.abort();
    if (request.headers()['accept']?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] ?? null;
    return route.fulfill({json: data, headers: {'content-range': '0-0/1'}});
  });
  await page.goto('./?demo=0&flags=v7Shell,padLocal,tutorThreads#/pad?path=analysis&checkpoint=CP4');
  const notes = page.getByRole('textbox', {name: 'Pad notes'}), excerpt = '  x = y\nso f(x) = f(y)  ';
  await notes.fill('Private before |' + excerpt + '| private after');
  expect(writes).toEqual([]);
  await select(notes, excerpt); await page.getByRole('button', {name: 'Send selection to tutor'}).click();
  const dialog = page.getByRole('dialog', {name: 'Checkpoint tutor'});
  await expect(dialog.getByRole('region', {name: 'Local excerpt preview'})).toBeVisible();
  await dialog.getByLabel('Question', {exact: true}).fill('Is this substitution valid?');
  expect(writes).toEqual([]);
  await dialog.getByRole('button', {name: 'Add local excerpt'}).click();
  expect(writes).toEqual([]);
  await dialog.getByRole('button', {name: 'Save question', exact: true}).click();
  await expect(dialog.getByLabel('Text for your tutor')).toHaveValue('Is this substitution valid?\n\nLocal excerpt (learner-provided; not a citation):\n' + excerpt);
  expect(writes).toEqual([{p_owner: owner, p_slug: 'analysis', p_checkpoint: checkpointId,
    p_command: {operation: 'start', operationId: expect.any(String), expectedVersion: 0, question: 'Is this substitution valid?', localExcerpt: excerpt}}]);
});
