import {readFile} from 'node:fs/promises';
import {expect, test, type BrowserContext, type Page} from '@playwright/test';

const owner = '00000000-0000-4000-8000-000000000001';
const otherOwner = '00000000-0000-4000-8000-000000000009';
const projectId = '00000000-0000-4000-8000-000000000002';
const checkpointId = '00000000-0000-4000-8000-000000000003';
const authKey = 'sb-yemqnhnztlbyxmjxidis-auth-token';
const session = (id: string, seconds = 3600, sessionId = '00000000-0000-4000-8000-000000000012') => {
  const expires = Math.floor(Date.now() / 1000) + seconds;
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return {
    access_token: [encode({alg:'HS256',typ:'JWT'}), encode({sub:id,role:'authenticated',session_id:sessionId,exp:expires}), 'local-fixture'].join('.'),
    refresh_token: 'isolated-pad-fixture', token_type:'bearer', expires_in:3600, expires_at:expires,
    user:{id, email:'pad@example.invalid', aud:'authenticated', role:'authenticated',
      app_metadata:{}, user_metadata:{}, created_at:'2026-10-01T00:00:00Z'},
  };
};

async function openCheckpoint(page: Page, context: BrowserContext, released = true) {
  const auth = session(owner);
  await page.addInitScript(({key, auth}) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(auth));
  }, {key:authKey, auth});
  const settings = {time_zone:'UTC', rollover_hour:4, preferred_chat:'claude', default_style:'socratic', mix_decks:true,
    new_per_day:20, reviews_per_day:200, desired_retention:.9, flags:{}, connector_secret:''};
  const project = {id:projectId, user_id:owner, slug:'analysis', title:'Analysis', status:'active', system:false};
  const checkpoint = {id:checkpointId, user_id:owner, project_id:projectId, code:'CP4', title:'Compactness',
    steps:[], current_step:0, status:'pending', objective:'Prove compactness.', position:1};
  const state = {verified: 0, disconnected: false, deleted: false, released};
  const payloads: string[] = [];
  const external: string[] = [];
  // Every external request is fulfilled here. No real Supabase, provider or account is touched.
  await context.route('https://**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (state.disconnected) {external.push(req.method() + ' ' + url.pathname); return route.abort();}
    if (req.postData()) payloads.push(req.postData()!);
    const single = req.headers()['accept']?.includes('application/vnd.pgrst.object+json');
    let data: unknown;
    if (url.pathname === '/auth/v1/user') data = auth.user;
    else if (url.pathname === '/rest/v1/rpc/lemma_plan_released') data = state.released;
    else if (url.pathname === '/rest/v1/settings' || url.pathname === '/rest/v1/rpc/bootstrap') data = settings;
    else if (url.pathname === '/rest/v1/rpc/begin_owner_export') data = 'fixture-snapshot';
    else if (url.pathname === '/rest/v1/rpc/end_owner_export') data = null;
    else if (url.pathname === '/rest/v1/rpc/owner_export_page') data = {rows: req.postDataJSON().p_table ? [project] : [{table_name:'projects'}], nextCursor:null};
    else if (url.pathname === '/functions/v1/account-delete') data = {deleted:state.deleted};
    else if (url.pathname === '/auth/v1/logout') data = {};
    else if (url.pathname === '/rest/v1/projects') data = single ? project : [project];
    else if (url.pathname === '/rest/v1/checkpoints') {
      if (single && url.searchParams.get('user_id') === 'eq.' + owner
        && url.searchParams.get('project_id') === 'eq.' + projectId && url.searchParams.get('code') === 'eq.CP4') state.verified++;
      data = single ? checkpoint : [checkpoint];
    } else if (url.pathname.startsWith('/rest/v1/')) data = [];
    else return route.abort();
    return route.fulfill({json:data, headers:{'content-range':'0-0/1'}});
  });
  await page.goto('./?demo=0&flags=v7Shell,padLocal#/p/analysis/cp/CP4');
  if (released) await page.getByRole('button', {name:'Open Local Pad'}).click();
  return {state, external, payloads};
}

test('an owner-verified checkpoint Pad can cold-open offline and stays private after the device changes accounts', async ({page, context}) => {
  test.setTimeout(90_000);
  const {state, external} = await openCheckpoint(page, context);
  const notes = page.getByRole('textbox', {name:'Pad notes'});
  await notes.fill('A device-private proof.');
  await page.getByRole('button', {name:'Save draft'}).click();
  await expect(page.getByText('Saved on this device.', {exact:true})).toBeVisible();
  expect(state.verified).toBeGreaterThan(0);
  await page.getByRole('link', {name:'Open this Pad on its own'}).click();
  await expect(page.getByRole('main', {name:'Device Pad'})).toBeVisible();
  await expect(notes).toHaveValue('A device-private proof.');
  await page.evaluate(async () => {await navigator.serviceWorker.ready;});
  // An installed PWA controls the next document after the initial online visit.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(notes).toHaveValue('A device-private proof.');

  state.disconnected = true;
  await context.setOffline(true);
  // A cold local editor has no reason to refresh an expired access token.
  await page.evaluate(({key, auth}) => localStorage.setItem(key, JSON.stringify(auth)),
    {key:authKey, auth:session(owner, -3600)});
  await page.reload();
  await expect(notes).toHaveValue('A device-private proof.');
  await notes.fill('Saved while disconnected.');
  await page.getByRole('button', {name:'Save draft'}).click();
  await expect(page.getByText('Saved on this device.', {exact:true})).toBeVisible();
  await page.reload();
  await expect(notes).toHaveValue('Saved while disconnected.');
  await page.evaluate(({key, auth}) => localStorage.setItem(key, JSON.stringify(auth)),
    {key:authKey, auth:session(owner, 3600, '00000000-0000-4000-8000-000000000019')});
  await page.reload();
  await expect(page.getByText('Open Local Pad from a checkpoint while signed in to use it here.')).toBeVisible();
  await page.evaluate(({key, auth}) => localStorage.setItem(key, JSON.stringify(auth)),
    {key:authKey, auth:session(otherOwner)});
  await page.reload();
  await expect(notes).toHaveCount(0);
  await expect(page.getByText('Open Local Pad from a checkpoint while signed in to use it here.')).toBeVisible();
  expect(external).toEqual([]);
});

test('the shared server release must be open for a new live Pad', async ({page, context}) => {
  const {state} = await openCheckpoint(page, context, false);
  await expect(page.getByRole('heading', {name:'Compactness'})).toBeVisible();
  expect(state.verified).toBeGreaterThan(0);
  await expect(page.getByRole('button', {name:'Open Local Pad'})).toHaveCount(0);
});

test('a confirmed release rollback removes the offline receipt and preserves saved revisions', async ({page, context}) => {
  const {state} = await openCheckpoint(page, context);
  await page.getByRole('textbox', {name:'Pad notes'}).fill('Keep this saved revision');
  await page.getByRole('button', {name:'Save draft'}).click();
  await expect(page.getByText('Saved on this device.', {exact:true})).toBeVisible();
  const receipt = 'lemma.device-pad.v1:' + owner + ':release';
  expect(await page.evaluate(key => localStorage.getItem(key), receipt)).toBeTruthy();
  state.released = false;
  await page.reload();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), receipt)).toBeNull();
  await expect(page.getByRole('button', {name:'Open Local Pad'})).toHaveCount(0);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map(db => db.name))).toContain('lemma-pad-drafts:' + owner);
});

test('account backup includes both saved Pad revisions locally and only confirmed deletion removes this owner’s data', async ({page, context}) => {
  test.setTimeout(90_000);
  const {state, payloads} = await openCheckpoint(page, context);
  const notes = page.getByRole('textbox', {name:'Pad notes'});
  for (const revision of ['First private Pad revision', 'Final private Pad revision']) {
    await notes.fill(revision);
    await page.getByRole('button', {name:'Save draft'}).click();
    await expect(page.getByText('Saved on this device.', {exact:true})).toBeVisible();
  }
  const otherMarker = 'lemma.device-pad.v1:' + otherOwner + ':last';
  await page.evaluate(async ({otherOwner, otherMarker}) => {
    localStorage.setItem(otherMarker, 'another-account');
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('lemma-pad-drafts:' + otherOwner, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('drafts').put({private:'another owner'}, 'other');
      open.onsuccess = () => {open.result.close(); resolve();};
      open.onerror = () => reject(open.error);
    });
    location.hash = '/settings?section=data';
  }, {otherOwner, otherMarker});
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', {name:'Download a backup', exact:true}).click();
  const path = await (await downloaded).path();
  const backup = JSON.parse(await readFile(path!, 'utf8'));
  expect(backup.devicePad.checkpoints).toHaveLength(1);
  expect(backup.devicePad.checkpoints[0]).toMatchObject({checkpointId,
    current:{format:'lemma-pad', version:1, notes:{text:'Final private Pad revision'}},
    previous:{format:'lemma-pad', version:1, notes:{text:'First private Pad revision'}}});
  expect(backup.tables.projects).toHaveLength(1);
  await page.getByRole('button', {name:'Delete…'}).click();
  const dialog = page.getByRole('dialog', {name:'Delete your account?'});
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('textbox').fill('DELETE MY ACCOUNT');
  await dialog.getByRole('button', {name:'Delete account permanently'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not verify complete account deletion');
  const dbNames = () => page.evaluate(async () => (await indexedDB.databases()).map(db => db.name));
  expect(await dbNames()).toContain('lemma-pad-drafts:' + owner);
  expect(await page.evaluate(key => localStorage.getItem(key), 'lemma.device-pad.v1:' + owner + ':last')).toBe(checkpointId);
  state.deleted = true;
  await dialog.getByRole('button', {name:'Delete account permanently'}).click();
  await expect.poll(dbNames).not.toContain('lemma-pad-drafts:' + owner);
  expect(await dbNames()).toContain('lemma-pad-drafts:' + otherOwner);
  expect(await page.evaluate(key => localStorage.getItem(key), 'lemma.device-pad.v1:' + owner + ':last')).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), otherMarker)).toBe('another-account');
  expect(payloads.join('\n')).not.toContain('private Pad revision');
});
