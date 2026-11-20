import { expect, test } from '@playwright/test'
import { buildSync } from 'esbuild'
import type { openDemoManualTutor } from '../../src/data/tutor/demo-manual'

declare global {
  interface Window {
    tutorDemo: { openDemoManualTutor: typeof openDemoManualTutor }
  }
}

const adapter = buildSync({
  entryPoints: ['src/data/tutor/demo-manual.ts'],
  bundle: true, write: false, format: 'iife', globalName: 'tutorDemo',
}).outputFiles[0].text

test('demo tutor resumes a saved turn and keeps the first reply and losing draft across tabs', async ({ page, context }) => {
  await page.goto('?demo=1#/')
  await page.addScriptTag({ content: adapter })
  const data = await page.evaluate(async () => {
    const scope = { pathId: 'p', checkpointId: 'cp' }
    const handle = await window.tutorDemo.openDemoManualTutor(scope)
    const saved = await handle.submit('t', {
      question: 'Which lemma?',
      selectedContext: [{ kind: 'source', refId: 's', version: '3', excerpt: 'Saved excerpt' }],
    })
    if (saved.kind !== 'submitted') throw new Error(saved.kind)
    handle.previewImport('t', 'preview', 'Not confirmed')
    handle.close()
    return scope
  })
  await page.reload()
  await page.addScriptTag({ content: adapter })

  const second = await context.newPage()
  await second.goto('?demo=1#/')
  await second.addScriptTag({ content: adapter })
  const checks = await second.evaluate(async scope => {
    const handle = await window.tutorDemo.openDemoManualTutor(scope)
    const sibling = await window.tutorDemo.openDemoManualTutor({ ...scope, checkpointId: 'another' })
    const result = {
      resumed: await handle.resume(), other: await sibling.resume(),
      foreignReply: await sibling.confirmImport('t', 1, 'wrong', 'Wrong checkpoint'),
      blocked: await handle.submit('t2', { question: 'Another', selectedContext: [] }),
    }
    handle.close()
    sibling.close()
    return result
  }, data)
  expect(checks.resumed.turns).toMatchObject([{
    status: 'awaiting-tutor', snapshot: {
      question: 'Which lemma?', selectedContext: [{ version: '3', excerpt: 'Saved excerpt' }],
    },
  }])
  expect(checks.resumed.recoveredDrafts).toEqual([])
  expect(checks.other.turns).toEqual([])
  expect(checks.foreignReply).toEqual({ kind: 'unknown-turn' })
  expect(checks.blocked).toEqual({ kind: 'turn-pending', turnId: 't' })

  async function submitIn(tab: typeof page, id: string, body: string) {
    return tab.evaluate(async ({ scope, id, body }) => {
      const handle = await window.tutorDemo.openDemoManualTutor(scope)
      try { return await handle.confirmImport('t', 1, id, body) } finally { handle.close() }
    }, { scope: data, id, body })
  }
  const outcomes = await Promise.all([
    submitIn(page, 'm1', 'Use compactness'), submitIn(second, 'm2', 'Try a subcover'),
  ])
  expect(outcomes.map(x => x.kind).sort()).toEqual(['already-completed', 'completed'])
  const committed = outcomes.find(x => x.kind === 'completed')
  const losing = outcomes.find(x => x.kind === 'already-completed')
  if (committed?.kind !== 'completed' || losing?.kind !== 'already-completed') throw new Error('Missing outcome')

  const prior = committed.turn.finalReply
  expect(await submitIn(second, prior.messageId, prior.body)).toMatchObject({ kind: 'completed' })
  const recovered = losing.recoverableDraft
  expect(await submitIn(page, recovered.messageId, recovered.body)).toMatchObject({ kind: 'already-completed' })

  await second.reload()
  await second.addScriptTag({ content: adapter })
  const resumed = await second.evaluate(async scope => {
    const handle = await window.tutorDemo.openDemoManualTutor(scope)
    try { return await handle.resume() } finally { handle.close() }
  }, data)
  expect(resumed.head.pendingTurnId).toBeNull()
  expect(resumed.turns).toMatchObject([{ status: 'completed', finalReply: {
    messageId: prior.messageId, body: prior.body,
    provenance: { kind: 'manual-import', label: 'Imported by you' }, suggestions: [],
  } }])
  expect(resumed.recoveredDrafts).toEqual([recovered])

  expect(await second.evaluate(async scope => {
    history.replaceState(null, '', '?demo=0#/')
    try { await window.tutorDemo.openDemoManualTutor(scope); return 'opened' }
    catch (error) { return (error as Error).message }
  }, data)).toContain('only in demo mode')
})
