import {expect, test} from '@playwright/test'
import {at} from './v7-scenes'

test('Planning offers New by default, saves Legacy, and can undo the change', async ({page}) => {
  const planning = at('/settings?section=planning')
  await page.goto(planning)
  await expect(page.getByRole('heading', {name: 'Planning', exact: true})).toBeVisible()
  await expect(page.getByRole('button', {name: /Scheduling algorithm/})).toHaveCount(0)

  await page.goto(planning.replace('flags=', 'flags=atlasAgendaV1,'))
  const choice = page.getByRole('button', {name: /Scheduling algorithm/})
  await expect(choice).toContainText('New')
  await choice.click()
  await expect(page.getByRole('radio', {name: /^New/})).toBeChecked()
  await page.getByRole('radio', {name: /^Legacy/}).click()
  await expect(choice).toContainText('Legacy')
  await page.getByRole('button', {name: 'Undo', exact: true}).click()
  await expect(choice).toContainText('New')
})

test('live Planning persists each owner choice through reload and leaves existing study untouched', async ({page}) => {
  // Exercise the real auth gate, adapter and Settings UI against an isolated HTTP service.
  // The fixture uses synthetic identities and never reaches a hosted account or database.
  const first = '11111111-1111-4111-8111-111111111111'
  const second = '22222222-2222-4222-8222-222222222222'
  const preferences = new Map<string, string | null>([[first, null], [second, null]])
  const writes: {owner: string; patch: Record<string, unknown>}[] = []
  const unexpected: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({first}) => {
    const id = localStorage.getItem('n196-fixture-owner') ?? first
    const user = {id, email: `${id}@example.invalid`, aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z'}
    const exp = Math.floor(Date.now() / 1000) + 3600
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const token = [encode({alg: 'HS256', typ: 'JWT'}), encode({sub: id, aud: 'authenticated', role: 'authenticated', exp}), 'fixture-signature'].join('.')
    localStorage.setItem('sb-yemqnhnztlbyxmjxidis-auth-token', JSON.stringify({
      access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600,
      expires_at: exp, user,
    }))
  }, {first})
  const ownerOf = (headers: Record<string, string>) => {
    const token = headers.authorization?.replace(/^Bearer /, '') ?? ''
    try {return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub as string}
    catch {return ''}
  }
  const timeZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const settings = (owner: string) => ({
    user_id: owner, scheduling_algorithm: preferences.get(owner), desired_retention: 0.9,
    new_per_day: 20, reviews_per_day: 200, learn_steps: '1m 10m', relearn_steps: '10m',
    rollover_hour: 4, max_interval_days: 36500, fuzz: true, load_balance: true,
    learn_ahead_minutes: 20, fsrs_weights: null, fsrs_tuned_at: null, macros: '',
    default_style: 'socratic', tutor_rules: null, mix_decks: true, preferred_chat: 'chatgpt',
    connector_secret: '', connector_last_seen_at: null, connector_last_client: null, time_zone: timeZone,
  })
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body: ''}))
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({body: ''}))
  await page.route('**/auth/v1/**', route => {
    const owner = ownerOf(route.request().headers())
    expect(preferences.has(owner)).toBe(true)
    return route.fulfill({contentType: 'application/json', body: JSON.stringify({id: owner,
      email: `${owner}@example.invalid`, aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z'})})
  })
  await page.route('**/rest/v1/**', route => {
    const request = route.request(), url = new URL(request.url()), owner = ownerOf(request.headers())
    const resource = url.pathname.replace(/^\/rest\/v1\//, '')
    expect(preferences.has(owner)).toBe(true)
    let payload: unknown = []
    if (resource === 'rpc/lemma_plan_released') payload = true
    else if (resource === 'rpc/bootstrap') payload = settings(owner)
    else if (resource === 'rpc/home_summary') payload = {resume: null, due: 0, pendingProposals: 0, projects: []}
    else if (resource === 'rpc/changes_since') payload = {changes: [], nextCursor: request.postDataJSON().p_cursor, reset: false}
    else if (resource === 'rpc/register_app_device') payload = null
    else if (resource === 'settings') {
      expect(url.searchParams.get('user_id')).toBe(`eq.${owner}`)
      if (request.method() === 'PATCH') {
        const patch = request.postDataJSON() as Record<string, unknown>
        writes.push({owner, patch})
        expect(Object.keys(patch)).toEqual(['scheduling_algorithm'])
        expect(['new', 'legacy']).toContain(patch.scheduling_algorithm)
        preferences.set(owner, patch.scheduling_algorithm as string)
      }
      payload = settings(owner)
    } else if (request.method() !== 'GET') {
      unexpected.push(`${request.method()} ${resource}`)
      return route.fulfill({status: 400, contentType: 'application/json', body: JSON.stringify({message: 'Unexpected write'})})
    }
    return route.fulfill({contentType: 'application/json', body: JSON.stringify(payload)})
  })
  const planning = at('/settings?section=planning').replace('demo=1', 'demo=0').replace('flags=', 'flags=atlasAgendaV1,')
  const choice = page.getByRole('button', {name: /Scheduling algorithm/})
  const choose = async (name: 'New' | 'Legacy') => {
    await choice.click()
    const radio = page.getByRole('radio', {name: new RegExp(`^${name}`)})
    await radio.focus()
    await page.keyboard.press('Space')
    await expect(choice).toContainText(name)
  }
  await page.goto(planning)
  await expect(choice).toContainText('New')
  await choose('Legacy')
  await page.reload()
  await expect(choice).toContainText('Legacy')
  await page.evaluate(owner => localStorage.setItem('n196-fixture-owner', owner), second)
  await page.reload()
  await expect(choice).toContainText('New')
  expect(preferences.get(first)).toBe('legacy')
  await choose('Legacy')
  await choose('New')
  await page.reload()
  await expect(choice).toContainText('New')
  await page.evaluate(owner => localStorage.setItem('n196-fixture-owner', owner), first)
  await page.reload()
  await expect(choice).toContainText('Legacy')
  await choose('New')
  expect(writes).toEqual([
    {owner: first, patch: {scheduling_algorithm: 'legacy'}},
    {owner: second, patch: {scheduling_algorithm: 'legacy'}},
    {owner: second, patch: {scheduling_algorithm: 'new'}},
    {owner: first, patch: {scheduling_algorithm: 'new'}},
  ])
  expect(unexpected).toEqual([])
  expect(errors).toEqual([])
})
