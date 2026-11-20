// The walkthrough inventory. Each scene is one screen or one flow; `p.shot(label)` takes the frame(s) for the current state.
// Order here is the reading order of the audit. A scene runs once per profile (`full`, `empty`) unless `profiles` says otherwise.
// Selectors are by role and visible name (what a person sees), so a renamed button shows up as a capture warning, not a silent gap.
import {DATE} from './lib.mjs'

export const GROUPS = {
  first: '1 · First run and edges',
  today: '2 · Today',
  capture: '3 · Capture (the + button): add a task, block, card, thought',
  tasks: '4 · Tasks',
  calendar: '5 · Calendar',
  paths: '6 · Paths, checkpoints and sessions',
  cards: '7 · Cards',
  review: '8 · Review',
  inbox: '9 · Inbox (tutor proposals)',
  atlas: '10 · Atlas',
  progress: '11 · Progress, time log and week',
  focus: '12 · Focus, practice and closing the day',
  settings: '13 · Settings',
  tutor: '14 · Tutor chat and Pad',
  stress: '15 · Edge conditions: time of day, offline, large text',
}

const page = (id, group, title, route, extra = {}) => ({
  id, group, title, ...extra,
  run: async (p) => { await p.go(route); await p.shot('top', extra.shot) },
})

export const scenes = [
  // ------------------------------------------------------------------ 1 · first run and edges
  page('sign-in', 'first', 'Sign in', '/sign-in', {check: 'first screen a signed-out person sees'}),
  {id: 'welcome', group: 'first', title: 'Welcome: three skippable first-run steps', check: 'connect tutor, then the next steps', run: async (p) => {
    await p.go('/welcome'); await p.shot('step 1')
    for (let i = 2; i <= 4; i++) { if (!(await p.has('Next', {timeout: 600}))) break; await p.tap('Next'); await p.shot('step ' + i) }
  }},
  page('not-found', 'first', 'Not found (unknown address)', '/nope-nothing-here', {check: 'the 404 page and its way home'}),

  // ------------------------------------------------------------------ 2 · today
  {id: 'today', group: 'today', title: 'Today', check: 'hero card, plan card, ruler, needs-you, continue, path cards', run: async (p) => { await p.go('/'); await p.shot('top', {maxFrames: 6}) }},
  {id: 'today-search', group: 'today', title: 'Search sheet', run: async (p) => {
    await p.go('/'); await p.tap('Search'); await p.shot('opened')
    await p.type('compact'); await p.wait(500); await p.shot('typed "compact"')
    await p.press('Control+A'); await p.type('zzzzqq'); await p.wait(500); await p.shot('no results')
  }},
  {id: 'today-weekday-minutes', group: 'today', title: 'Set weekday study minutes', run: async (p) => {
    await p.go('/'); await p.tap('Set weekday minutes'); await p.shot('opened')
  }},
  {id: 'today-quick-focus', group: 'today', title: 'Quick focus sheet', run: async (p) => {
    await p.go('/'); await p.tap('Quick focus'); await p.shot('opened')
  }},
  {id: 'today-decision', group: 'today', title: 'Plan card: decision details', run: async (p) => {
    await p.go('/'); await p.tap(/Decision details/, {role: undefined}); await p.shot('expanded', {maxFrames: 3})
  }},
  {id: 'today-complete-task', group: 'today', title: 'Complete a task from Today', profiles: ['full'], run: async (p) => {
    await p.go('/'); await p.shot('before', {scroll: false})
    await p.tap(/^Complete /); await p.wait(500); await p.shot('after completing (toast, ∎)', {scroll: false})
  }},

  // ------------------------------------------------------------------ 3 · capture
  {id: 'capture-sheet', group: 'capture', title: 'Capture sheet: empty, type picker', run: async (p) => {
    await p.go('/'); await p.tap('Capture'); await p.shot('opened (nothing typed)', {scroll: false})
    await p.close(); await p.wait(300)
  }},
  {id: 'capture-task', group: 'capture', title: 'Add a task by typing a sentence', check: 'recognised tokens, footer says what will be created, toast, task appears', run: async (p) => {
    await p.go('/'); await p.tap('Capture')
    await p.fill('What do you want to add?', p.isEmpty ? 'Read chapter 4 tomorrow 4pm 90m' : 'Rudin ch 4 tomorrow 4pm 90m #real')
    await p.shot('typed: a date+time+length is read as a Time block', {scroll: false})
    await p.tap('Task', {role: 'radio'}).catch(() => p.tap('Task')); await p.shot('type switched to Task: same tokens, different footer', {scroll: false})
    await p.tap(/^Add task$/); await p.wait(600); await p.shot('added: toast with Undo', {scroll: false})
    await p.nav('/tasks'); await p.wait(500); await p.shot('the new task in Tasks')
  }},
  {id: 'capture-task-plain', group: 'capture', title: 'Add a task: plain sentence with a due day', run: async (p) => {
    await p.go('/'); await p.tap('Capture'); await p.fill('What do you want to add?', 'Prove the Heine-Borel theorem by Friday')
    await p.shot('typed: recognised as a task', {scroll: false})
    await p.tap(/^Add task$/); await p.wait(600); await p.shot('added', {scroll: false})
    await p.press('Control+Z').catch(() => {})
  }},
  {id: 'capture-task-more', group: 'capture', title: 'Capture → More options (full task form)', run: async (p) => {
    await p.go('/'); await p.tap('Capture'); await p.fill('What do you want to add?', 'Prove the finite subcover lemma Friday 2h')
    await p.tap('More options'); await p.wait(500); await p.shot('full task form prefilled')
  }},
  {id: 'capture-block', group: 'capture', title: 'Add a time block', run: async (p) => {
    await p.go('/'); await p.tap('Capture'); await p.tap('Time block')
    await p.fill('What do you want to add?', 'Study analysis tomorrow 4pm 60m')
    await p.shot('typed as a time block', {scroll: false})
    await p.tap(/^Add (time )?block/); await p.wait(600); await p.shot('added', {scroll: false})
    await p.nav('/calendar?view=day&date=2026-11-10'); await p.wait(600); await p.shot('the block on tomorrow')
  }},
  {id: 'capture-card', group: 'capture', title: 'Add a card (front :: back)', check: 'empty account goes through the first-card form', run: async (p) => {
    await p.go('/'); await p.tap('Capture'); await p.tap('Card')
    await p.fill('What do you want to add?', 'What is a clopen set? :: A set that is both open and closed.')
    await p.shot('typed as a card', {scroll: false})
    await p.tap(/^Add card$/); await p.wait(700); await p.shot('after Add card', {scroll: false, maxFrames: 3})
    if (p.isEmpty) await p.try('first card', async () => { await p.fill('Path name', 'Topology'); await p.shot('first-card form filled', {scroll: false}); await p.tap('Save card'); await p.wait(1200); await p.shot('first card saved', {maxFrames: 3}) })
  }},
  {id: 'capture-card-invalid', group: 'capture', title: 'Card without a back: disabled reason', run: async (p) => {
    await p.go('/'); await p.tap('Capture'); await p.tap('Card'); await p.fill('What do you want to add?', 'Only a front, no back')
    await p.shot('Add card unavailable, reason shown', {scroll: false})
  }},
  {id: 'capture-thought', group: 'capture', title: 'Park a thought', run: async (p) => {
    await p.go('/'); await p.tap('Capture'); await p.tap('Thought')
    await p.fill('What do you want to add?', 'Is the Lindelöf property preserved by closed subspaces?')
    await p.shot('typed as a thought', {scroll: false})
    await p.tap(/^(Add|Park) thought$/); await p.wait(600); await p.shot('parked: toast', {scroll: false})
  }},
  {id: 'capture-from-calendar', group: 'capture', title: 'Capture opened from another screen (Calendar)', run: async (p) => {
    await p.go('/calendar'); await p.tap('Capture'); await p.shot('over Calendar', {scroll: false})
  }},

  // ------------------------------------------------------------------ 4 · tasks
  {id: 'tasks-list', group: 'tasks', title: 'Tasks: To do / Doing / Done', run: async (p) => {
    await p.go('/tasks'); await p.shot('To do', {maxFrames: 3})
    await p.tap('Doing'); await p.shot('Doing', {scroll: false})
    await p.tap('Done'); await p.shot('Done', {scroll: false})
  }},
  {id: 'tasks-filters', group: 'tasks', title: 'Tasks: filters (path, overdue, high priority)', profiles: ['full'], run: async (p) => {
    await p.go('/tasks'); await p.tap('All paths'); await p.shot('path filter sheet', {scroll: false})
    await p.close(); await p.wait(300)
    await p.try('overdue', async () => { await p.tap(/^Overdue/); await p.shot('Overdue only', {scroll: false}) })
    await p.try('high', async () => { await p.tap('High priority'); await p.shot('High priority', {scroll: false}) })
  }},
  {id: 'tasks-new', group: 'tasks', title: 'New task form: fill every field', check: 'form labels, validation, date picker, save', run: async (p) => {
    await p.go('/tasks?new=1'); await p.shot('blank form')
    await p.tap('Save task'); await p.wait(400); await p.shot('Save with no title: validation', {scroll: false})
    await p.field(0).fill('Prove the Heine–Borel theorem')
    await p.tap('High'); await p.tap('Date'); await p.wait(400)
    await p.shot('title, High priority, Date chosen')
    await p.try('estimate', async () => { await p.fillPlaceholder('e.g. 25', '90') })
    await p.try('date & time', async () => { await p.tap('Date & time'); await p.shot('Date & time chosen', {maxFrames: 2}) })
    await p.try('path', async () => { await p.tap(/^Path:/); await p.shot('path picker', {scroll: false}); await p.close() })
    await p.try('save', async () => { await p.tap('Save task'); await p.wait(700); await p.shot('saved: back on the list', {scroll: false}) })
  }},
  {id: 'tasks-edit', group: 'tasks', title: 'Task: Edit, Schedule from the actions menu', profiles: ['full'], run: async (p) => {
    await p.go('/tasks'); await p.tap(/^More actions for /); await p.tap('Edit', {role: 'menuitem'}); await p.wait(500); await p.shot('Edit task sheet', {maxFrames: 2}); await p.close()
    await p.tap(/^More actions for /); await p.tap('Schedule', {role: 'menuitem'}); await p.wait(600); await p.shot('Schedule', {maxFrames: 2})
  }},
  {id: 'tasks-delete', group: 'tasks', title: 'Task: delete and undo', profiles: ['full'], run: async (p) => {
    await p.go('/tasks'); await p.tap(/^More actions for /); await p.tap('Delete task', {role: 'menuitem'}); await p.wait(500); await p.shot('confirm or toast', {scroll: false})
  }},
  {id: 'tasks-actions', group: 'tasks', title: 'Task: more actions, edit and complete', profiles: ['full'], run: async (p) => {
    await p.go('/tasks'); await p.tap(/^More actions for /); await p.shot('actions menu', {scroll: false})
    await p.close(); await p.wait(300)
    await p.tap(/^Complete /); await p.wait(600); await p.shot('after Complete: toast', {scroll: false})
  }},
  {id: 'tasks-plan', group: 'tasks', title: 'Plan these (tasks into the calendar)', profiles: ['full'], run: async (p) => {
    await p.go('/tasks'); await p.tap('Plan these'); await p.wait(700); await p.shot('planner', {maxFrames: 3})
  }},

  // ------------------------------------------------------------------ 5 · calendar
  {id: 'calendar-day', group: 'calendar', title: 'Calendar: Day', run: async (p) => { await p.go(`/calendar?view=day&date=${DATE}`); await p.shot('day', {maxFrames: 4}) }},
  {id: 'calendar-week', group: 'calendar', title: 'Calendar: Week', run: async (p) => { await p.go(`/calendar?view=week&date=${DATE}`); await p.shot('week', {maxFrames: 3}) }},
  {id: 'calendar-month', group: 'calendar', title: 'Calendar: Month', run: async (p) => { await p.go(`/calendar?view=month&date=${DATE}`); await p.shot('month', {maxFrames: 3}) }},
  {id: 'calendar-agenda', group: 'calendar', title: 'Calendar: Agenda', run: async (p) => { await p.go(`/calendar?view=agenda&date=${DATE}`); await p.shot('agenda', {maxFrames: 3}) }},
  {id: 'calendar-quick-add', group: 'calendar', title: 'Calendar: quick add', run: async (p) => { await p.go(`/calendar?view=day&date=${DATE}&quick=1`); await p.shot('quick add') }},
  {id: 'calendar-new-block', group: 'calendar', title: 'Calendar: new block form', check: 'every field, validation, save', run: async (p) => {
    await p.go(`/calendar?view=day&date=${DATE}&new=block`); await p.shot('blank block form')
    await p.try('title', async () => { await p.page.locator('[role=dialog] input[type=text], .v7-sheet input[type=text]').first().fill('Rudin chapter 4 problems') })
    await p.try('save', async () => { await p.tap(/^(Save|Add) (time )?block/); await p.wait(700); await p.shot('saved', {scroll: false}) })
  }},
  {id: 'calendar-planner', group: 'calendar', title: 'Calendar: planner (Adjust / Add all)', run: async (p) => { await p.go(`/calendar?view=day&date=${DATE}&plan=1`); await p.shot('planner', {maxFrames: 3}) }},
  {id: 'calendar-block-details', group: 'calendar', title: 'Calendar: open a block', profiles: ['full'], run: async (p) => {
    await p.go(`/calendar?view=day&date=${DATE}`); await p.tap(/Planned study|Solve analysis/); await p.wait(500); await p.shot('block sheet', {maxFrames: 3})
  }},
  {id: 'calendar-triage', group: 'calendar', title: 'Calendar: triage overdue', profiles: ['full'], run: async (p) => {
    await p.go(`/calendar?view=day&date=${DATE}&overdue=1`); await p.shot('triage', {maxFrames: 3})
  }},

  // ------------------------------------------------------------------ 6 · paths
  {id: 'paths-list', group: 'paths', title: 'Paths list and its tabs', run: async (p) => {
    await p.go('/projects'); await p.shot('Active', {maxFrames: 3})
    for (const t of ['Paused', 'Done', 'Archived']) await p.try(t, async () => { await p.tap(t, {role: 'button'}); await p.shot(t, {scroll: false}) })
  }},
  {id: 'paths-more', group: 'paths', title: 'Path: more menu', profiles: ['full'], run: async (p) => {
    await p.go('/projects'); await p.tap(/^More for /); await p.shot('menu', {scroll: false})
  }},
  {id: 'paths-search', group: 'paths', title: 'Paths: search', profiles: ['full'], run: async (p) => {
    await p.go('/projects'); await p.fillPlaceholder('Search paths and checkpoints', 'compact'); await p.wait(500); await p.shot('results', {scroll: false})
    await p.fillPlaceholder('Search paths and checkpoints', 'zzzzqq'); await p.wait(500); await p.shot('no results', {scroll: false})
  }},
  {id: 'path-new', group: 'paths', title: 'New path form', check: 'name, sources, create, and the brand-new empty path afterwards', run: async (p) => {
    await p.go('/projects/new'); await p.shot('blank (Create path disabled until a name)')
    await p.fillPlaceholder('e.g. Abstract Algebra', 'Measure Theory'); await p.shot('name typed', {scroll: false})
    await p.tap('Create path'); await p.wait(1500); await p.shot('after Create path: the new, empty path', {maxFrames: 4})
  }},
  {id: 'path-new-tutor', group: 'paths', title: 'New path → Continue with tutor', check: 'the tutor chat opened for the path just created: does it carry the new path name?', run: async (p) => {
    await p.go('/projects/new'); await p.fillPlaceholder('e.g. Abstract Algebra', 'Measure Theory'); await p.tap('Create path'); await p.wait(1500)
    await p.shot('new empty path, before tapping', {scroll: false})
    await p.tap('Continue with tutor'); await p.wait(1200); await p.shot('after Continue with tutor', {maxFrames: 3})
    await p.try('begin', async () => { await p.tap('Begin session'); await p.wait(800); await p.shot('Begin session', {maxFrames: 2}) })
    await p.try('write', async () => { await p.tap('Write a question'); await p.wait(600); await p.shot('Write a question (keyboard)', {scroll: false}) })
  }},
  {id: 'path-map', group: 'paths', title: 'Path page (Map tab)', profiles: ['full'], run: async (p) => {
    await p.go('/p/real-analysis'); await p.shot('Map', {maxFrames: 5})
  }},
  {id: 'path-tabs', group: 'paths', title: 'Path page tabs: Sessions, Sources, Cards', profiles: ['full'], run: async (p) => {
    await p.go('/p/real-analysis')
    for (const t of [/^Sessions/, /^Sources/, /^Cards/]) await p.try(String(t), async () => { await p.tap(t, {role: 'button'}); await p.shot(String(t), {maxFrames: 3}) })
  }},
  {id: 'checkpoint', group: 'paths', title: 'Checkpoint page (current)', profiles: ['full'], run: async (p) => { await p.go('/p/real-analysis/cp/CP4'); await p.shot('CP4', {maxFrames: 4}) }},
  {id: 'checkpoint-future', group: 'paths', title: 'Checkpoint page (locked, future)', profiles: ['full'], run: async (p) => { await p.go('/p/real-analysis/cp/CP8'); await p.shot('CP8', {maxFrames: 3}) }},
  {id: 'checkpoint-actions', group: 'paths', title: 'Checkpoint: more actions', profiles: ['full'], run: async (p) => {
    await p.go('/p/real-analysis/cp/CP4'); await p.tap('More checkpoint actions'); await p.shot('menu', {scroll: false})
  }},
  {id: 'session', group: 'paths', title: 'Tutor session page', profiles: ['full'], run: async (p) => { await p.go('/s/real-analysis/7'); await p.shot('session', {maxFrames: 4}) }},
  {id: 'path-missing', group: 'paths', title: 'Path or checkpoint that does not exist', run: async (p) => {
    await p.go('/p/no-such-path'); await p.shot('unknown path')
    await p.go('/p/real-analysis/cp/CP99'); await p.shot('unknown checkpoint')
  }},

  // ------------------------------------------------------------------ 7 · cards
  {id: 'cards-list', group: 'cards', title: 'Cards browser', run: async (p) => { await p.go('/cards'); await p.shot('list', {maxFrames: 4}) }},
  {id: 'cards-filters', group: 'cards', title: 'Cards: filters and search', profiles: ['full'], run: async (p) => {
    await p.go('/cards')
    for (const f of ['Path', 'State']) await p.try(f, async () => { await p.tap(f, {role: 'button'}); await p.shot(f + ' filter', {scroll: false}); await p.close() })
    await p.fillPlaceholder('Search cards', 'zzzzqq'); await p.wait(600); await p.shot('search with no results', {scroll: false})
  }},
  {id: 'card-detail', group: 'cards', title: 'Card detail', profiles: ['full'], run: async (p) => { await p.go('/cards/1'); await p.shot('card 1', {maxFrames: 4}) }},
  {id: 'card-editor', group: 'cards', title: 'Card editor (new card)', run: async (p) => {
    await p.go('/cards?new=1'); await p.shot('blank editor', {maxFrames: 3})
  }},
  {id: 'card-edit', group: 'cards', title: 'Edit an existing card', profiles: ['full'], run: async (p) => {
    await p.go('/cards/1'); await p.tap('Edit card'); await p.shot('edit sheet', {maxFrames: 3})
  }},
  {id: 'card-missing', group: 'cards', title: 'Card that does not exist', run: async (p) => { await p.go('/cards/99999'); await p.shot('missing card') }},

  // ------------------------------------------------------------------ 8 · review
  {id: 'review-hub', group: 'review', title: 'Review hub', run: async (p) => { await p.go('/review'); await p.shot('hub', {maxFrames: 3}) }},
  {id: 'review-customise', group: 'review', title: 'Review: customise the round', profiles: ['full'], run: async (p) => {
    await p.go('/review'); await p.tap('Customise this round'); await p.shot('customise', {maxFrames: 3})
  }},
  {id: 'review-table', group: 'review', title: 'Review: forecast as a table', profiles: ['full'], run: async (p) => {
    await p.go('/review'); await p.tap('Show as table'); await p.shot('table', {scroll: false})
  }},
  {id: 'review-run', group: 'review', title: 'Review round: question, answer, rating', profiles: ['full'], check: 'one full card cycle', run: async (p) => {
    await p.go('/review'); await p.tap(/^Start review/); await p.wait(900); await p.shot('question', {scroll: false})
    await p.try('sure', async () => { await p.tap('Unsure'); await p.shot('confidence chosen', {scroll: false}) })
    await p.try('scratch', async () => { await p.tap('Scratch paper'); await p.wait(500); await p.shot('scratch paper', {scroll: false}); await p.close() })
    await p.try('reveal', async () => { await p.tap('Show answer'); await p.wait(600); await p.shot('answer revealed', {maxFrames: 3}) })
    await p.try('rate', async () => { await p.tap(/^Good/); await p.wait(700); await p.shot('after rating: next card', {scroll: false}) })
    await p.try('undo', async () => { await p.tap(/^Undo/); await p.wait(500); await p.shot('after undo', {scroll: false}) })
  }},
  {id: 'review-complete', group: 'review', title: 'Review: finish the whole round → done screen', profiles: ['full'], check: 'the end of a round and the empty Review hub afterwards', run: async (p) => {
    await p.go('/review'); await p.tap(/^Start review/); await p.wait(900)
    for (let i = 0; i < 60; i++) {
      if (/#\/review\/(done|$)|#\/review\?/.test(p.page.url()) && !(await p.has('Show answer', {timeout: 300}))) break
      if (!(await p.has('Show answer', {timeout: 1200}))) break
      await p.tap('Show answer', {settle: 150}); await p.tap(/^Good/, {settle: 250})
    }
    await p.wait(800); await p.shot('after the last card', {maxFrames: 3})
    await p.nav('/review'); await p.wait(700); await p.shot('Review hub with nothing due', {maxFrames: 2})
    await p.nav('/'); await p.wait(700); await p.shot('Today afterwards', {maxFrames: 2})
  }},
  {id: 'review-idle', group: 'review', title: 'Review run with nothing in progress', run: async (p) => { await p.go('/review/run'); await p.shot('no round') }},
  {id: 'review-done', group: 'review', title: 'Review done', run: async (p) => { await p.go('/review/done'); await p.shot('done') }},

  // ------------------------------------------------------------------ 9 · inbox
  {id: 'inbox-cards', group: 'inbox', title: 'Inbox: card proposals', run: async (p) => { await p.go('/proposals'); await p.shot('Cards tab', {maxFrames: 4}) }},
  {id: 'inbox-list', group: 'inbox', title: 'Inbox: list view', profiles: ['full'], run: async (p) => { await p.go('/proposals?view=list'); await p.shot('list view', {maxFrames: 3}) }},
  {id: 'inbox-plans', group: 'inbox', title: 'Inbox: plan proposals', run: async (p) => { await p.go('/proposals?tab=plan'); await p.shot('Plans tab', {maxFrames: 3}) }},
  {id: 'inbox-approve', group: 'inbox', title: 'Inbox: approve, edit and reject a card', profiles: ['full'], run: async (p) => {
    await p.go('/proposals'); await p.tap('Edit', {role: 'menuitem'}); await p.wait(500); await p.shot('Edit proposal', {maxFrames: 3}); await p.close()
    await p.tap('Approve', {role: 'button'}); await p.wait(600); await p.shot('after Approve: toast', {scroll: false})
    await p.tap('Reject', {role: 'button'}); await p.wait(600); await p.shot('after Reject', {scroll: false})
  }},
  {id: 'inbox-zero', group: 'inbox', title: 'Inbox: decide everything → empty Inbox', profiles: ['full'], check: 'the "all caught up" state and the badge disappearing', run: async (p) => {
    await p.go('/proposals')
    for (let i = 0; i < 14; i++) {
      if (await p.has('Approve', {role: 'button', timeout: 700})) await p.tap('Approve', {role: 'button', settle: 350})
      else if (await p.has('Approve link', {timeout: 400})) await p.tap('Approve link', {settle: 350})
      else break
    }
    await p.nav('/proposals?tab=plan'); await p.wait(500)
    await p.try('plan', async () => { await p.tap('Approve', {role: 'button'}); await p.wait(600) })
    await p.nav('/proposals'); await p.wait(700); await p.shot('empty Inbox', {scroll: false})
    await p.nav('/'); await p.wait(700); await p.shot('Today: no more "needs you"', {maxFrames: 2})
  }},
  {id: 'inbox-plan-detail', group: 'inbox', title: 'Plan proposal: compare whole plan', profiles: ['full'], run: async (p) => {
    await p.go('/proposals/proposal-6'); await p.shot('plan proposal', {maxFrames: 5})
  }},

  // ------------------------------------------------------------------ 10 · atlas
  {id: 'atlas-map', group: 'atlas', title: 'Atlas: map', run: async (p) => {
    await p.go('/atlas'); await p.wait(1500); await p.shot('map', {scroll: false})
  }},
  {id: 'atlas-list', group: 'atlas', title: 'Atlas: list', run: async (p) => {
    await p.go('/atlas'); await p.tap('List'); await p.wait(600); await p.shot('list', {maxFrames: 3})
  }},
  {id: 'atlas-search', group: 'atlas', title: 'Atlas: search and legend', run: async (p) => {
    await p.go('/atlas'); await p.wait(1000)
    await p.try('search', async () => { await p.tap('Search concepts'); await p.shot('search', {scroll: false}); await p.type('comp'); await p.wait(500); await p.shot('search "comp"', {scroll: false}); await p.close() })
    await p.try('legend', async () => { await p.tap('Legend'); await p.shot('legend', {scroll: false}) })
  }},
  {id: 'atlas-tabs', group: 'atlas', title: 'Atlas: Themes and Bridges', profiles: ['full'], run: async (p) => {
    await p.go('/atlas'); await p.wait(1000)
    for (const t of ['Themes', 'Bridges']) await p.try(t, async () => { await p.tap(t); await p.wait(700); await p.shot(t, {maxFrames: 3}) })
  }},
  {id: 'atlas-select', group: 'atlas', title: 'Atlas: select a concept, open its details', profiles: ['full'], run: async (p) => {
    await p.go('/atlas'); await p.wait(1500)
    await p.tapAt(178, 322); await p.shot('tapped the Compactness area of the map', {scroll: false})
    await p.nav('/atlas'); await p.wait(500); await p.tap('List'); await p.wait(500)
    await p.try('row', async () => { await p.tap(/^Compactness/, {role: 'button'}); await p.wait(700); await p.shot('concept details', {maxFrames: 4}) })
  }},

  // ------------------------------------------------------------------ 11 · progress
  {id: 'insights', group: 'progress', title: 'Progress: overview', run: async (p) => { await p.go('/insights'); await p.shot('overview', {maxFrames: 5}) }},
  {id: 'insights-ranges', group: 'progress', title: 'Progress: 30 and 90 days, table view', run: async (p) => {
    await p.go('/insights')
    await p.try('30', async () => { await p.tap('30 days'); await p.shot('30 days', {maxFrames: 2}) })
    await p.try('90', async () => { await p.tap('90 days'); await p.shot('90 days', {scroll: false}) })
    await p.try('table', async () => { await p.tap('Show as table', {nth: 0}); await p.shot('chart as table', {scroll: false}) })
  }},
  {id: 'insights-learning', group: 'progress', title: 'Progress: Learning tab', run: async (p) => { await p.go('/insights?tab=learning'); await p.shot('learning', {maxFrames: 4}) }},
  {id: 'insights-time', group: 'progress', title: 'Progress: Time tab', run: async (p) => { await p.go('/insights?tab=time'); await p.shot('time', {maxFrames: 3}) }},
  {id: 'time-log', group: 'progress', title: 'Time log (week)', run: async (p) => { await p.go('/log'); await p.shot('week', {maxFrames: 3}) }},
  {id: 'time-log-add', group: 'progress', title: 'Time log: add time manually', run: async (p) => {
    await p.go('/log'); await p.tap('Add time'); await p.wait(500); await p.shot('add time form', {maxFrames: 3})
  }},
  {id: 'time-log-day', group: 'progress', title: 'Time log: one day', run: async (p) => {
    await p.go('/log?day=2026-11-08'); await p.shot('Sunday 8 Nov', {maxFrames: 2})
    await p.go('/log?day=2026-11-06'); await p.shot('Friday 6 Nov', {maxFrames: 2})
  }},
  {id: 'week', group: 'progress', title: 'Your week (digest page)', run: async (p) => { await p.go('/week'); await p.shot('week digest', {maxFrames: 4}) }},

  // ------------------------------------------------------------------ 12 · focus, practice, close day
  {id: 'focus-idle', group: 'focus', title: 'Focus with nothing running', run: async (p) => { await p.go('/focus'); await p.shot('no session') }},
  {id: 'focus-run', group: 'focus', title: 'Focus: start, running, pause, break, finish and save', profiles: ['full'], run: async (p) => {
    await p.go('/'); await p.tap('Start now'); await p.wait(1200); await p.shot('just started (00:00)', {scroll: false})
    await p.advance(12); await p.shot('running, 12 min in', {scroll: false})
    await p.try('park', async () => { await p.fillPlaceholder('Park a thought…', 'Check whether the cover must be countable'); await p.press('Enter'); await p.shot('thought parked during focus', {scroll: false}) })
    await p.try('pause', async () => { await p.tap('Pause'); await p.shot('paused', {scroll: false}) })
    await p.try('resume', async () => { await p.tap(/^(Resume|Continue|Play)/); await p.advance(25); await p.shot('resumed, 25 min in', {scroll: false}) })
    await p.try('break', async () => { await p.tap('Break'); await p.shot('break', {scroll: false}); await p.tap(/^(Resume|Back to focus|End break|Continue)/).catch(() => {}) })
    await p.try('drift', async () => { await p.tap('Drifted'); await p.shot('drifted marked', {scroll: false}) })
    await p.try('finish', async () => { await p.tap('Finish'); await p.wait(700); await p.shot('finish sheet: what happened', {maxFrames: 3}) })
    await p.try('save', async () => { await p.tap(/^(Save|Log|Done)/); await p.wait(900); await p.shot('after saving', {maxFrames: 2}) })
  }},
  {id: 'focus-quick', group: 'focus', title: 'Quick focus: start from the sheet', run: async (p) => {
    await p.go('/'); await p.tap('Quick focus'); await p.shot('sheet', {scroll: false})
    await p.try('start', async () => { await p.tap(/^Start/, {role: 'button'}); await p.wait(1200); await p.shot('quick focus running', {scroll: false}) })
  }},
  {id: 'today-running', group: 'focus', title: 'Today while a focus session runs', profiles: ['full'], run: async (p) => {
    await p.go('/'); await p.tap('Start now'); await p.wait(900); await p.nav('/'); await p.wait(700); await p.shot('Today with a running session', {maxFrames: 2})
  }},
  {id: 'practice', group: 'focus', title: 'Practice topics', run: async (p) => { await p.go('/practice'); await p.shot('practice', {maxFrames: 3}) }},
  {id: 'close-day', group: 'focus', title: 'Close the day (3 steps)', run: async (p) => {
    await p.go('/today/close'); await p.shot('1 · today', {maxFrames: 3})
    for (const [i, label] of [[2, '2 · loose ends'], [3, '3 · tomorrow']]) { if (!(await p.has('Next', {timeout: 600}))) break; await p.tap('Next'); await p.shot(label, {maxFrames: 3}) }
  }},

  // ------------------------------------------------------------------ 13 · settings
  {id: 'settings-root', group: 'settings', title: 'Settings', run: async (p) => { await p.go('/settings'); await p.shot('root', {maxFrames: 2}) }},
  ...['appearance', 'tutor', 'study', 'planning', 'reminders', 'subjects', 'data'].map((s) =>
    page('settings-' + s, 'settings', 'Settings: ' + s, '/settings?section=' + s, {shot: {maxFrames: 5}})),

  ...['tutor', 'study', 'planning', 'reminders'].map((sec) => ({
    id: 'settings-' + sec + '-rows', group: 'settings', title: 'Settings → ' + sec + ': open every row', check: 'each picker/dialog a row opens',
    run: async (p) => {
      await p.go('/settings?section=' + sec)
      await p.drill('.v7-set-row', {max: 9, label: sec, maxFrames: 1, skip: ['Sign out', 'Delete', 'Reset', 'Disconnect']})
    }})),

  {id: 'settings-appearance-options', group: 'settings', title: 'Settings → Appearance: paper and sky options (night)', check: 'each paper (Plain, Graph, Dot, Ruled) and sky (Clear, Stars) in the night theme', run: async (p) => {
    await p.go('/settings?section=appearance')
    for (const o of ['Plain', 'Graph', 'Dot', 'Ruled', 'Clear', 'Stars']) await p.try(o, async () => { await p.tap(o); await p.wait(400); await p.shot('option: ' + o, {scroll: false}) })
  }},
  {id: 'settings-subjects-rows', group: 'settings', title: 'Settings → Subjects: open each subject', profiles: ['full'], run: async (p) => {
    await p.go('/settings?section=subjects')
    for (const n of [/^Analysis/, /^Topology/, /^Linear Algebra/]) await p.try(String(n), async () => { await p.tap(n); await p.wait(500); await p.shot('subject ' + String(n).slice(2, 12), {maxFrames: 2}); await p.close() })
  }},
  {id: 'settings-data-actions', group: 'settings', title: 'Settings → Data and account: Delete confirmation (not confirmed)', run: async (p) => {
    await p.go('/settings?section=data')
    await p.try('delete', async () => { await p.tap('Delete…'); await p.wait(500); await p.shot('Delete… dialog', {maxFrames: 2}); await p.close() })
    await p.try('signout', async () => { await p.tap('Sign out'); await p.wait(700); await p.shot('after Sign out', {maxFrames: 2}) })
  }},
  {id: 'settings-reminders-on', group: 'settings', title: 'Settings → Reminders: turn reminders on', run: async (p) => {
    await p.go('/settings?section=reminders'); await p.shot('off', {scroll: false})
    await p.try('on', async () => { await p.page.locator('input[type=checkbox]').first().click({force: true}); await p.wait(600); await p.shot('on', {maxFrames: 3}) })
  }},

  // ------------------------------------------------------------------ 14 · tutor chat and Pad
  {id: 'tutor-chat', group: 'tutor', title: 'Tutor chat (checkpoint)', profiles: ['full'], run: async (p) => {
    await p.go('/p/real-analysis/cp/CP4/tutor'); await p.shot('start', {maxFrames: 2})
    await p.try('begin', async () => { await p.tap('Begin session'); await p.wait(700); await p.shot('began', {scroll: false}) })
    await p.try('write', async () => { await p.tap('Write a question'); await p.wait(500); await p.shot('keyboard', {scroll: false}) })
  }},
  {id: 'pad', group: 'tutor', title: 'Lemma Pad', run: async (p) => { await p.go('/pad'); await p.shot('pad', {maxFrames: 3}) }},

  // ------------------------------------------------------------------ 15 · edge conditions
  ...[['morning', '2026-11-09T07:30:00+05:30'], ['evening', '2026-11-09T21:15:00+05:30'], ['night', '2026-11-10T00:40:00+05:30'], ['weekend', '2026-11-14T10:00:00+05:30']].map(([name, at]) => ({
    id: 'today-' + name, group: 'stress', title: 'Today at ' + name + ' (' + at.slice(0, 16).replace('T', ' ') + ')', check: 'greeting, hero card and plan change with the time of day',
    run: async (p) => { await p.page.clock.setFixedTime(new Date(at)); await p.go('/'); await p.shot(name, {maxFrames: 3}) }})),
  {id: 'offline', group: 'stress', title: 'Offline banner', run: async (p) => {
    await p.go('/tasks'); await p.nav('/'); await p.page.context().setOffline(true); await p.page.evaluate(() => window.dispatchEvent(new Event('offline'))); await p.wait(900)
    await p.shot('Today offline', {scroll: false}); await p.nav('/tasks'); await p.wait(600); await p.shot('Tasks offline', {scroll: false})
  }},
  ...[['today', '/'], ['capture', '/'], ['tasks', '/tasks'], ['review', '/review'], ['settings', '/settings?section=study']].map(([name, route]) => ({
    id: 'large-text-' + name, group: 'stress', title: 'Large system text (130%): ' + name, check: 'nothing clipped, overlapping or unreachable at 130% text',
    run: async (p) => {
      await p.page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '130%' }))
      await p.go(route)
      if (name === 'capture') { await p.tap('Capture'); await p.fill('What do you want to add?', 'Rudin ch 4 tomorrow 4pm 90m #real') }
      await p.shot('130% text', {maxFrames: name === 'capture' ? 1 : 3, scroll: name !== 'capture'})
    }})),
  {id: 'long-text', group: 'stress', title: 'Very long titles and unusual characters', profiles: ['full'], check: 'wrapping/truncation of a 150-character task, math and non-Latin text', run: async (p) => {
    await p.go('/'); await p.tap('Capture')
    await p.fill('What do you want to add?', 'Prove that every sequentially compact metric space is totally bounded and complete, then deduce compactness, citing Lebesgue numbers and ε–δ continuity for ∀x∈X, f(x)≠∅ — 証明を書く')
    await p.tap('Task').catch(() => {}); await p.tap(/^Add task$/); await p.wait(600)
    await p.nav('/tasks'); await p.wait(600); await p.shot('long task in the list', {maxFrames: 2})
  }},
]

/** Scenes that also run in the opt-in `heavy` profile (`--profiles heavy`): the list and chart screens, where a lot of data
 * is what breaks layouts (long lists, dense calendars, many paths and cards). */
export const HEAVY = new Set(['today', 'tasks-list', 'calendar-day', 'calendar-week', 'calendar-month', 'calendar-agenda', 'paths-list',
  'cards-list', 'inbox-cards', 'review-hub', 'insights', 'insights-learning', 'atlas-map', 'atlas-list', 'time-log', 'settings-subjects'])
